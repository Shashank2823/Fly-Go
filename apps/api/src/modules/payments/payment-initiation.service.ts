import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money/money';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import {
  IdempotencyService,
  type IdempotentResult,
  requestHash,
} from '../idempotency/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';
import type { PaymentStatusDto } from './dto/payment.dto';
import { PaymentsRepository } from './payments.repository';
import { PAYMENT_PROVIDER_NAME } from './payments.constants';

/** Minimum hold time left when a payment starts, so it can't expire mid-request. */
const HOLD_SAFETY_MS = 15_000;

const notFound = () => new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');

/**
 * API side of payment (docs §11.2): validates the booking, records an INITIATED payment,
 * moves the booking to PAYMENT_PENDING and extends the seat hold — all in one transaction —
 * then returns 202. The provider is called by the worker, never inside the request.
 */
@Injectable()
export class PaymentInitiationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsRepository,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: AppConfig,
  ) {}

  async initiate(
    user: AuthenticatedUser,
    reference: string,
    priceVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<PaymentStatusDto>> {
    const booking = await this.bookings.findByReference(reference, user.id);
    if (!booking) throw notFound();

    return this.idempotency.run<PaymentStatusDto & Prisma.InputJsonObject>(
      {
        userId: user.id,
        scope: `POST /bookings/${reference}/payments`,
        key: idempotencyKey,
        hash: requestHash({ priceVersion }),
        successStatus: HttpStatus.ACCEPTED,
      },
      async (tx) => {
        const locked = await this.payments.lockBooking(tx, booking.id);
        if (!locked) throw notFound();

        if (locked.status === 'CONFIRMED') {
          // Already paid (e.g. a retry with a fresh key): report the successful payment.
          const paid = await tx.payment.findFirst({
            where: { bookingId: booking.id, status: 'SUCCEEDED' },
          });
          if (paid)
            return this.toDto(paid, 'CONFIRMED') as PaymentStatusDto & Prisma.InputJsonObject;
        }
        if (locked.status === 'PAYMENT_PENDING') {
          const inflight = await tx.payment.findFirst({
            where: {
              bookingId: booking.id,
              status: { in: ['INITIATED', 'PROCESSING', 'REQUIRES_ACTION'] },
            },
          });
          throw new AppError(
            'PAYMENT_IN_PROGRESS',
            HttpStatus.CONFLICT,
            'A payment for this booking is already in progress',
            {
              paymentId: inflight?.id ?? null,
            },
          );
        }
        if (locked.status !== 'PENDING') {
          throw new AppError(
            'BOOKING_NOT_PAYABLE',
            HttpStatus.CONFLICT,
            'This booking can no longer be paid for',
            {
              status: locked.status,
            },
          );
        }

        const now = await this.bookings.dbNow(tx);
        const heldSeats = await this.payments.countHeldSeats(tx, booking.id);
        if (
          !locked.hold_expires_at ||
          locked.hold_expires_at.getTime() < now.getTime() + HOLD_SAFETY_MS ||
          heldSeats !== locked.seats_required
        ) {
          throw new AppError(
            'HOLD_EXPIRED',
            HttpStatus.CONFLICT,
            'Your seat hold has expired. Please choose seats again.',
          );
        }
        if (locked.total_minor === null || locked.price_version !== priceVersion) {
          throw new AppError(
            'PRICE_CHANGED',
            HttpStatus.CONFLICT,
            'The price has changed. Please review it before paying.',
            {
              currentPriceVersion: locked.total_minor === null ? null : locked.price_version,
            },
          );
        }

        const payment = await tx.payment.create({
          data: {
            bookingId: booking.id,
            provider: PAYMENT_PROVIDER_NAME,
            amountMinor: locked.total_minor,
            currency: locked.currency,
            idempotencyKey,
          },
        });
        // Keep the seats while the (asynchronous) payment is processed.
        const until = new Date(now.getTime() + this.config.get('PAYMENT_HOLD_TTL_SECONDS') * 1000);
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'PAYMENT_PENDING', holdExpiresAt: until, version: { increment: 1 } },
        });
        await this.payments.extendSeatHolds(tx, booking.id, until);

        await this.audit.record(
          {
            actorUserId: user.id,
            actorType: 'USER',
            action: 'PAYMENT_INITIATED',
            entityType: 'payment',
            entityId: payment.id,
            after: {
              amountMinor: payment.amountMinor.toString(),
              currency: payment.currency,
              priceVersion,
            },
            correlationId,
          },
          tx,
        );
        await this.outbox.add(tx, {
          aggregateType: 'payment',
          aggregateId: payment.id,
          eventType: 'PaymentRequested',
          payload: { paymentId: payment.id, bookingId: booking.id },
          correlationId,
        });
        return this.toDto(payment, 'PAYMENT_PENDING') as PaymentStatusDto & Prisma.InputJsonObject;
      },
    );
  }

  async status(
    user: AuthenticatedUser,
    reference: string,
    paymentId: string,
  ): Promise<PaymentStatusDto> {
    const booking = await this.bookings.findByReference(reference, user.id);
    if (!booking) throw notFound();
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, bookingId: booking.id },
    });
    if (!payment)
      throw new AppError('PAYMENT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Payment not found');
    return this.toDto(payment, booking.status);
  }

  private toDto(
    p: {
      id: string;
      status: PaymentStatusDto['status'];
      amountMinor: bigint;
      currency: string;
      failureCode: string | null;
      updatedAt: Date;
    },
    bookingStatus: PaymentStatusDto['bookingStatus'],
  ): PaymentStatusDto {
    return {
      paymentId: p.id,
      status: p.status,
      amount: toMoney(p.amountMinor, p.currency),
      failureCode: p.failureCode,
      bookingStatus,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
