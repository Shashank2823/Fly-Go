import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money/money';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { MarketsService } from '../markets/markets.service';
import { calculatePrice } from '../pricing/price-calculator';
import { BookingsRepository } from './bookings.repository';
import type { CheckoutDto } from './dto/checkout.responses';

/**
 * Computes the binding price from stored fares, fee rules, passenger types and assigned seats
 * (docs §11, §6.6). The client never sends amounts. Re-running checkout with nothing changed
 * returns the same priceVersion (idempotent); a different result creates a new version.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly markets: MarketsService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditService,
  ) {}

  async quote(
    user: AuthenticatedUser,
    reference: string,
    correlationId: string,
  ): Promise<CheckoutDto> {
    const booking = await this.bookings.findByReference(reference, user.id);
    if (!booking)
      throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');
    const fare = await this.markets.fareFor(booking.flightId, booking.cabin, booking.marketCode);
    if (!fare)
      throw new AppError(
        'FARE_UNAVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'This fare is no longer on sale',
      );
    const rules = await this.markets.activeRules(booking.marketCode);

    return this.tx.run(async (tx) => {
      const locked = await this.bookings.lockForUpdate(tx, booking.id);
      if (locked?.status !== 'PENDING') {
        throw new AppError(
          'BOOKING_NOT_PAYABLE',
          HttpStatus.CONFLICT,
          'This booking is not awaiting checkout',
          {
            status: locked?.status,
          },
        );
      }
      const fresh = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const now = await this.bookings.dbNow(tx);
      if (!fresh.holdExpiresAt || fresh.holdExpiresAt <= now) {
        throw new AppError(
          'HOLD_EXPIRED',
          HttpStatus.CONFLICT,
          'Your seat hold has expired. Please choose seats again.',
        );
      }

      const passengers = await this.bookings.passengersWithSeats(booking.id, tx);
      const expectedCount = fresh.adults + fresh.children + fresh.infants;
      const seated = passengers.filter((p) => p.type !== 'INFANT');
      if (passengers.length !== expectedCount || seated.some((p) => !p.seat)) {
        throw new AppError(
          'PASSENGERS_INCOMPLETE',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Add details for every passenger first',
        );
      }

      const price = calculatePrice({
        baseFareMinor: fare.baseFareMinor,
        rules,
        passengers: passengers.map((p) => ({
          ordinal: p.ordinal,
          type: p.type,
          seatKind: p.seat?.flightSeat.kind ?? null,
        })),
      });
      const idByOrdinal = new Map(passengers.map((p) => [p.ordinal, p.id]));
      const signature = (
        lines: { kind: string; code: string; passengerId: string | null; amountMinor: bigint }[],
      ) => lines.map((l) => `${l.kind}|${l.code}|${l.passengerId}|${l.amountMinor}`).join(';');
      const computed = price.lines.map((l) => ({
        kind: l.kind,
        code: l.code,
        description: l.description,
        passengerId: l.passengerOrdinal ? (idByOrdinal.get(l.passengerOrdinal) ?? null) : null,
        amountMinor: l.amountMinor,
      }));

      let priceVersion = fresh.priceVersion;
      const existing =
        fresh.totalMinor !== null
          ? await this.bookings.priceLines(booking.id, fresh.priceVersion, tx)
          : [];
      const unchanged =
        existing.length > 0 &&
        fresh.totalMinor === price.totalMinor &&
        signature(existing) === signature(computed);

      if (!unchanged) {
        priceVersion = fresh.priceVersion + 1;
        await tx.bookingPriceLine.createMany({
          data: computed.map((l) => ({ ...l, bookingId: booking.id, priceVersion })),
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { totalMinor: price.totalMinor, priceVersion, version: { increment: 1 } },
        });
        await this.audit.record(
          {
            actorUserId: user.id,
            actorType: 'USER',
            action: 'BOOKING_PRICED',
            entityType: 'booking',
            entityId: booking.id,
            after: {
              priceVersion,
              totalMinor: price.totalMinor.toString(),
              currency: fresh.currency,
            },
            correlationId,
          },
          tx,
        );
      }

      const ordinalById = new Map(passengers.map((p) => [p.id, p.ordinal]));
      return {
        priceVersion,
        lines: computed.map((l) => ({
          kind: l.kind,
          code: l.code,
          description: l.description,
          passengerOrdinal: l.passengerId ? (ordinalById.get(l.passengerId) ?? null) : null,
          amount: toMoney(l.amountMinor, fresh.currency),
        })),
        total: toMoney(price.totalMinor, fresh.currency),
        holdExpiresAt: fresh.holdExpiresAt.toISOString(),
        serverTime: now.toISOString(),
      };
    });
  }
}
