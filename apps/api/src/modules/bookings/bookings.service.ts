import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Permission } from '../../common/auth/permissions';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money/money';
import { AppConfig } from '../../config/app-config';
import { isUniqueViolation, TransactionRunner } from '../../database/transaction-runner';
import type { CabinClass, Prisma, SeatKind } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { toFlightHeader } from '../flights/flight.mapper';
import { BOOKING_CUTOFF_MINUTES } from '../flights/flights.repository';
import {
  IdempotencyService,
  type IdempotentResult,
  requestHash,
} from '../idempotency/idempotency.service';
import { MarketsService } from '../markets/markets.service';
import { OutboxService } from '../outbox/outbox.service';
import { calculatePrice, type PricedPassenger } from '../pricing/price-calculator';
import { SeatInventoryRepository } from '../seat-inventory/seat-inventory.repository';
import { newBookingReference } from './booking-reference';
import { assertTransition } from './booking-state';
import { ACTIVE_HOLD_STATUSES, BookingsRepository } from './bookings.repository';
import type { BookingDetailDto, BookingSeatDto } from './dto/booking.responses';
import type { CreateBookingDto } from './dto/create-booking.dto';

export const MAX_ACTIVE_HOLDS_PER_USER = 3;
const CREATE_SCOPE = 'POST /bookings';

const notFound = () => new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');

/** Passenger ordinals: adults, then children, then infants; seats go to seated passengers in order. */
function pricedPassengers(
  counts: { adults: number; children: number; infants: number },
  seatKinds: SeatKind[],
): PricedPassenger[] {
  const types = [
    ...Array<'ADULT'>(counts.adults).fill('ADULT'),
    ...Array<'CHILD'>(counts.children).fill('CHILD'),
    ...Array<'INFANT'>(counts.infants).fill('INFANT'),
  ];
  let seatIndex = 0;
  return types.map((type, i) => ({
    ordinal: i + 1,
    type,
    seatKind: type === 'INFANT' ? null : (seatKinds[seatIndex++] ?? null),
  }));
}

/**
 * Booking-as-hold (docs §2 D4, §9.2): creating a PENDING booking atomically holds its seats.
 * Payment-driven transitions are added in Phase 5.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly seats: SeatInventoryRepository,
    private readonly markets: MarketsService,
    private readonly idempotency: IdempotencyService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: AppConfig,
  ) {}

  async createHold(
    user: AuthenticatedUser,
    dto: CreateBookingDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<BookingDetailDto>> {
    const { adults, children, infants } = dto.passengers;
    if (infants > adults) {
      throw new AppError(
        'TOO_MANY_INFANTS',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Each infant must travel with an adult',
      );
    }
    if (adults + children > 9) {
      throw new AppError(
        'TOO_MANY_PASSENGERS',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'A booking can seat at most 9 passengers',
      );
    }
    if (dto.seats.length !== adults + children) {
      throw new AppError(
        'SEAT_COUNT_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Select exactly ${adults + children} seat(s) — one for each adult and child`,
      );
    }

    // Cheap validation before any locks; the hold itself re-validates availability atomically.
    const flight = await this.bookings.flightForBooking(dto.flightId);
    if (!flight) throw new AppError('FLIGHT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Flight not found');
    const bookable =
      (flight.status === 'SCHEDULED' || flight.status === 'DELAYED') &&
      flight.departureAt.getTime() > Date.now() + BOOKING_CUTOFF_MINUTES * 60_000;
    if (!bookable) {
      throw new AppError(
        'FLIGHT_NOT_BOOKABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'This flight can no longer be booked',
      );
    }

    const existing = await this.seats.existingSeats(flight.id, dto.seats);
    const missing = dto.seats.filter((l) => !existing.some((s) => s.seatLabel === l));
    if (missing.length) {
      throw new AppError(
        'SEAT_NOT_FOUND',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Some seats do not exist on this flight',
        {
          seats: missing,
        },
      );
    }
    const wrongCabin = existing.filter((s) => s.cabin !== dto.cabin).map((s) => s.seatLabel);
    if (wrongCabin.length) {
      throw new AppError(
        'SEAT_CABIN_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Selected seats must be in ${dto.cabin}`,
        {
          seats: wrongCabin,
        },
      );
    }

    const market = await this.markets.resolve(user.nationality);
    const fare = await this.markets.fareFor(flight.id, dto.cabin, market.code);
    if (!fare) {
      throw new AppError(
        'FARE_UNAVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'This cabin is not on sale for your market',
      );
    }
    const rules = await this.markets.activeRules(market.code);
    const kindByLabel = new Map(existing.map((s) => [s.seatLabel, s.kind]));
    const ttlSeconds = this.config.get('HOLD_TTL_SECONDS');

    const attempt = () =>
      this.idempotency.run<BookingDetailDto & Prisma.InputJsonObject>(
        {
          userId: user.id,
          scope: CREATE_SCOPE,
          key: idempotencyKey,
          hash: requestHash(dto),
          successStatus: HttpStatus.CREATED,
        },
        async (tx) => {
          await this.bookings.lockUser(tx, user.id);
          if ((await this.bookings.countActiveHolds(tx, user.id)) >= MAX_ACTIVE_HOLDS_PER_USER) {
            throw new AppError(
              'TOO_MANY_ACTIVE_HOLDS',
              HttpStatus.CONFLICT,
              `You already have ${MAX_ACTIVE_HOLDS_PER_USER} bookings in progress. Complete or release one first.`,
            );
          }

          const now = await this.bookings.dbNow(tx);
          const holdExpiresAt = new Date(now.getTime() + ttlSeconds * 1000);
          const booking = await tx.booking.create({
            data: {
              reference: newBookingReference(),
              userId: user.id,
              flightId: flight.id,
              cabin: dto.cabin,
              marketCode: market.code,
              currency: market.currency,
              adults,
              children,
              infants,
              seatsRequired: adults + children,
              holdExpiresAt,
            },
          });

          const held = await this.seats.hold(tx, {
            flightId: flight.id,
            labels: dto.seats,
            bookingId: booking.id,
            expiresAt: holdExpiresAt,
          });
          if (held.length !== dto.seats.length) {
            // Throwing rolls back the booking and any seats that were held: all-or-nothing.
            throw new AppError(
              'SEATS_UNAVAILABLE',
              HttpStatus.CONFLICT,
              'Some of the selected seats were just taken. Please choose again.',
              { unavailable: dto.seats.filter((l) => !held.includes(l)) },
            );
          }

          await this.audit.record(
            {
              actorUserId: user.id,
              actorType: 'USER',
              action: 'BOOKING_HELD',
              entityType: 'booking',
              entityId: booking.id,
              after: {
                status: 'PENDING',
                seats: dto.seats,
                holdExpiresAt: holdExpiresAt.toISOString(),
              },
              correlationId,
            },
            tx,
          );

          const seatDtos = await this.toSeatDtos(booking.id, tx);
          return this.toDetail({
            booking,
            flight,
            seats: seatDtos,
            baseFareMinor: fare.baseFareMinor,
            rules,
            seatKinds: dto.seats.map((l) => kindByLabel.get(l)!),
            now,
          }) as BookingDetailDto & Prisma.InputJsonObject;
        },
      );

    try {
      return await attempt();
    } catch (err) {
      // A booking-reference collision (≈1 in a billion) aborts the transaction: retry once.
      if (isUniqueViolation(err)) return attempt();
      throw err;
    }
  }

  async getForUser(user: AuthenticatedUser, reference: string): Promise<BookingDetailDto> {
    const ownerId = user.permissions.includes(Permission.BookingReadAny) ? null : user.id;
    const booking = await this.bookings.findByReference(reference, ownerId);
    if (!booking) throw notFound();

    const seats = await this.toSeatDtos(booking.id);
    let estimate: {
      baseFareMinor: bigint;
      rules: Awaited<ReturnType<MarketsService['activeRules']>>;
    } | null = null;
    if (booking.status === 'PENDING' || booking.status === 'PAYMENT_PENDING') {
      const fare = await this.markets.fareFor(booking.flightId, booking.cabin, booking.marketCode);
      if (fare)
        estimate = {
          baseFareMinor: fare.baseFareMinor,
          rules: await this.markets.activeRules(booking.marketCode),
        };
    }
    return this.toDetail({
      booking,
      flight: booking.flight,
      seats,
      baseFareMinor: estimate?.baseFareMinor ?? null,
      rules: estimate?.rules ?? [],
      seatKinds: seats.map((s) => s.kind),
      now: new Date(),
    });
  }

  /** Releases a PENDING hold. Idempotent: releasing an already released booking is a no-op. */
  async release(user: AuthenticatedUser, reference: string, correlationId: string): Promise<void> {
    const booking = await this.bookings.findByReference(reference, user.id);
    if (!booking) throw notFound();

    await this.tx.run(async (tx) => {
      const locked = await this.bookings.lockForUpdate(tx, booking.id);
      if (!locked || locked.status === 'CANCELLED' || locked.status === 'EXPIRED') return;
      if (locked.status !== 'PENDING') {
        throw new AppError(
          'BOOKING_NOT_RELEASABLE',
          HttpStatus.CONFLICT,
          'Only bookings awaiting details or payment can be released',
        );
      }
      assertTransition(locked.status, 'CANCELLED');
      const released = await this.seats.release(tx, booking.id);
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(
        {
          actorUserId: user.id,
          actorType: 'USER',
          action: 'BOOKING_RELEASED',
          entityType: 'booking',
          entityId: booking.id,
          before: { status: locked.status },
          after: { status: 'CANCELLED', seatsReleased: released },
          correlationId,
        },
        tx,
      );
      await this.outbox.add(tx, {
        aggregateType: 'booking',
        aggregateId: booking.id,
        eventType: 'BookingCancelled',
        payload: {
          bookingId: booking.id,
          reference: booking.reference,
          reason: 'RELEASED_BY_USER',
        },
        correlationId,
      });
    });
  }

  private async toSeatDtos(
    bookingId: string,
    db?: Parameters<BookingsRepository['ownedSeats']>[1],
  ): Promise<BookingSeatDto[]> {
    const rows = await this.bookings.ownedSeats(bookingId, db);
    return rows.map((s) => ({
      label: s.seatLabel,
      cabin: s.cabin,
      kind: s.kind,
      features: s.layoutSeat.features,
    }));
  }

  private toDetail(p: {
    booking: {
      reference: string;
      status: BookingDetailDto['status'];
      cabin: CabinClass;
      currency: string;
      holdExpiresAt: Date | null;
      adults: number;
      children: number;
      infants: number;
      createdAt: Date;
    };
    flight: Parameters<typeof toFlightHeader>[0];
    seats: BookingSeatDto[];
    baseFareMinor: bigint | null;
    rules: Awaited<ReturnType<MarketsService['activeRules']>>;
    seatKinds: SeatKind[];
    now: Date;
  }): BookingDetailDto {
    const { booking } = p;
    const activeHold =
      (booking.status === 'PENDING' || booking.status === 'PAYMENT_PENDING') &&
      booking.holdExpiresAt;
    const counts = { adults: booking.adults, children: booking.children, infants: booking.infants };

    let priceEstimate: BookingDetailDto['priceEstimate'] = null;
    if (p.baseFareMinor !== null && ACTIVE_HOLD_STATUSES.includes(booking.status)) {
      const price = calculatePrice({
        baseFareMinor: p.baseFareMinor,
        rules: p.rules,
        passengers: pricedPassengers(counts, p.seatKinds),
      });
      priceEstimate = {
        lines: price.lines.map((l) => ({
          kind: l.kind,
          code: l.code,
          description: l.description,
          passengerOrdinal: l.passengerOrdinal,
          amount: toMoney(l.amountMinor, booking.currency),
        })),
        total: toMoney(price.totalMinor, booking.currency),
        isEstimate: true,
      };
    }

    return {
      reference: booking.reference,
      status: booking.status,
      cabin: booking.cabin,
      holdExpiresAt: activeHold ? booking.holdExpiresAt!.toISOString() : null,
      serverTime: p.now.toISOString(),
      passengers: counts,
      flight: toFlightHeader(p.flight),
      seats: p.seats,
      priceEstimate,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
