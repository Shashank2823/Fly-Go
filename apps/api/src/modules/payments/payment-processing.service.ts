import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type Tx } from '../../database/transaction-runner';
import type { PaymentStatus } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { newTicketNumber } from '../tickets/ticket-number';
import { PaymentsRepository } from './payments.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './providers/payment-provider';

const TERMINAL: PaymentStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

/**
 * Worker-side payment workflow (docs §11.2). Each step is idempotent and safe to retry:
 *  submit-payment       INITIATED → PROCESSING (provider called with idempotency key = paymentId)
 *  apply-payment-event  forward-only state changes; confirms the booking atomically on success
 *  refund-payment       refunds a payment whose booking could not be confirmed
 * No database transaction is ever open while the provider is called.
 */
@Injectable()
export class PaymentProcessingService {
  private readonly logger = new Logger(PaymentProcessingService.name);

  constructor(
    private readonly tx: TransactionRunner,
    private readonly payments: PaymentsRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async submit(paymentId: string): Promise<void> {
    const payment = await this.tx.run((tx) =>
      tx.payment.findUnique({
        where: { id: paymentId },
        include: { booking: { select: { reference: true } } },
      }),
    );
    if (
      !payment ||
      payment.providerPaymentId ||
      (payment.status !== 'INITIATED' && payment.status !== 'PROCESSING')
    ) {
      return; // already submitted or resolved
    }

    const result = await this.provider.createPayment({
      paymentId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      bookingReference: payment.booking.reference,
      idempotencyKey: paymentId,
    });

    await this.tx.run(async (tx) => {
      await tx.payment.updateMany({
        where: {
          id: paymentId,
          providerPaymentId: null,
          status: { in: ['INITIATED', 'PROCESSING'] },
        },
        data: { providerPaymentId: result.providerPaymentId, status: 'PROCESSING' },
      });
      await this.audit.record(
        {
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'PAYMENT_SUBMITTED',
          entityType: 'payment',
          entityId: paymentId,
          after: { provider: this.provider.name, providerStatus: result.status },
        },
        tx,
      );
    });
  }

  /** Applies one recorded provider event. Duplicate and stale events are marked IGNORED. */
  async applyEvent(paymentEventId: string): Promise<void> {
    await this.tx.run(async (tx) => {
      const events = await tx.$queryRaw<
        {
          id: string;
          status: string;
          type: string;
          payment_id: string | null;
          payload: { failureCode?: string | null };
        }[]
      >`
        SELECT id, status, type, payment_id, payload FROM payment_events WHERE id = ${paymentEventId}::uuid FOR UPDATE`;
      const event = events[0];
      if (!event || event.status !== 'RECEIVED') return;

      const ignore = async (reason: string) => {
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: { status: 'IGNORED', ignoreReason: reason },
        });
        this.logger.warn({ paymentEventId, reason }, 'Payment event ignored');
      };

      if (!event.payment_id) return ignore('UNKNOWN_PAYMENT');
      const head = await tx.payment.findUnique({
        where: { id: event.payment_id },
        select: { bookingId: true },
      });
      if (!head) return ignore('UNKNOWN_PAYMENT');

      // Lock order: booking → seats → payment (docs §9.1).
      const booking = await this.payments.lockBooking(tx, head.bookingId);
      await this.payments.lockSeats(tx, head.bookingId);
      const payment = await this.payments.lockPayment(tx, event.payment_id);
      if (!booking || !payment) return ignore('UNKNOWN_PAYMENT');

      if (event.type === 'payment.succeeded') {
        if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED')
          return ignore('DUPLICATE_SUCCESS');
        await this.onSucceeded(tx, booking, payment);
      } else if (event.type === 'payment.failed') {
        if (TERMINAL.includes(payment.status)) return ignore(`PAYMENT_ALREADY_${payment.status}`);
        await this.onFailed(tx, booking, payment.id, event.payload.failureCode ?? 'payment_failed');
      } else {
        return ignore(`UNHANDLED_TYPE:${event.type}`);
      }

      await tx.paymentEvent.update({
        where: { id: event.id },
        data: { status: 'APPLIED', appliedAt: new Date() },
      });
    });
  }

  private async onSucceeded(
    tx: Tx,
    booking: Awaited<ReturnType<PaymentsRepository['lockBooking']>> & object,
    payment: { id: string; status: PaymentStatus },
  ): Promise<void> {
    // A success after we recorded a failure still means money moved: refund it.
    const lateSuccess = payment.status === 'FAILED' || payment.status === 'CANCELLED';
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCEEDED', succeededAt: new Date(), failureCode: null },
    });

    let confirmed = false;
    if (!lateSuccess && booking.status === 'PAYMENT_PENDING') {
      // Ownership, not the clock, decides: only if the booking still holds ALL its seats
      // (none were reclaimed after an expired hold) are they confirmed. All-or-nothing.
      const held = await this.payments.countHeldSeats(tx, booking.id);
      if (held === booking.seats_required) {
        await this.payments.confirmSeats(tx, booking.id);
        confirmed = true;
      }
    }

    if (confirmed) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          holdExpiresAt: null,
          version: { increment: 1 },
        },
      });
      await tx.ticket.create({
        data: { bookingId: booking.id, version: 1, ticketNumber: newTicketNumber() },
      });
      await this.audit.record(
        {
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'BOOKING_CONFIRMED',
          entityType: 'booking',
          entityId: booking.id,
          before: { status: booking.status },
          after: { status: 'CONFIRMED', paymentId: payment.id },
        },
        tx,
      );
      await this.outbox.add(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'BookingConfirmed',
        payload: {
          bookingId: booking.id,
          reference: booking.reference,
          userId: booking.user_id,
          paymentId: payment.id,
        },
      });
      this.logger.log({ reference: booking.reference, paymentId: payment.id }, 'Booking confirmed');
      return;
    }

    // Paid but cannot confirm (hold lost, booking expired/cancelled, or late success): release and refund.
    if (booking.status === 'PENDING' || booking.status === 'PAYMENT_PENDING') {
      await tx.$executeRaw`
        UPDATE flight_seats SET status = 'AVAILABLE', booking_id = NULL, hold_expires_at = NULL, version = version + 1, updated_at = now()
        WHERE booking_id = ${booking.id}::uuid AND status = 'HELD'`;
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'EXPIRED', expiredAt: new Date(), version: { increment: 1 } },
      });
    }
    await this.audit.record(
      {
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'PAYMENT_SUCCEEDED_UNCONFIRMABLE',
        entityType: 'booking',
        entityId: booking.id,
        after: { paymentId: payment.id, bookingStatus: booking.status, lateSuccess },
      },
      tx,
    );
    await this.outbox.add(tx, {
      aggregateType: 'payment',
      aggregateId: payment.id,
      eventType: 'RefundRequired',
      payload: { paymentId: payment.id, bookingId: booking.id, reference: booking.reference },
    });
    this.logger.warn(
      { reference: booking.reference, paymentId: payment.id },
      'Payment succeeded but booking could not be confirmed — refunding',
    );
  }

  private async onFailed(
    tx: Tx,
    booking: Awaited<ReturnType<PaymentsRepository['lockBooking']>> & object,
    paymentId: string,
    failureCode: string,
  ): Promise<void> {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', failedAt: new Date(), failureCode: failureCode.slice(0, 64) },
    });
    if (booking.status === 'PAYMENT_PENDING') {
      // Back to PENDING so the traveller can retry while the (extended) hold lasts.
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'PENDING', version: { increment: 1 } },
      });
    }
    await this.audit.record(
      {
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'PAYMENT_FAILED',
        entityType: 'payment',
        entityId: paymentId,
        after: { failureCode },
      },
      tx,
    );
    await this.outbox.add(tx, {
      aggregateType: 'payment',
      aggregateId: paymentId,
      eventType: 'PaymentFailed',
      payload: {
        paymentId,
        bookingId: booking.id,
        reference: booking.reference,
        userId: booking.user_id,
      },
    });
  }

  async refund(paymentId: string): Promise<void> {
    const payment = await this.tx.run((tx) => tx.payment.findUnique({ where: { id: paymentId } }));
    if (!payment || payment.status !== 'SUCCEEDED' || !payment.providerPaymentId) return;

    await this.provider.refund(
      payment.providerPaymentId,
      payment.amountMinor,
      `refund-${paymentId}`,
    );

    await this.tx.run(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      if (updated.count === 0) return;
      await this.audit.record(
        {
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'PAYMENT_REFUNDED',
          entityType: 'payment',
          entityId: paymentId,
        },
        tx,
      );
      await this.outbox.add(tx, {
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: 'PaymentRefunded',
        payload: { paymentId, bookingId: payment.bookingId },
      });
    });
  }
}
