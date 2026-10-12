import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, type FieldError } from '../../common/errors/app-error';
import { zonedDate } from '../../common/time/zoned-time';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { BookingsRepository } from './bookings.repository';
import type { UpdatePassengersDto } from './dto/passengers.dto';
import { ageOn, isRealDate, typeForAge } from './passenger-rules';

const invalid = (
  code: string,
  message: string,
  errors?: FieldError[],
  meta?: Record<string, unknown>,
) => new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, message, meta, errors);

/**
 * Saves traveller details and seat assignments for a PENDING booking (full replace, so the
 * request is naturally idempotent). Any change invalidates a previous checkout price.
 */
@Injectable()
export class PassengersService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditService,
  ) {}

  async replace(
    user: AuthenticatedUser,
    reference: string,
    dto: UpdatePassengersDto,
    correlationId: string,
  ): Promise<void> {
    const booking = await this.bookings.findByReference(reference, user.id);
    if (!booking)
      throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');
    const departureDate = zonedDate(booking.flight.departureAt, booking.flight.origin.timezone);
    const today = zonedDate(new Date(), booking.flight.origin.timezone);

    // ── Shape and counts ─────────────────────────────────────────────────────
    const pax = [...dto.passengers].sort((a, b) => a.ordinal - b.ordinal);
    const expected = { ADULT: booking.adults, CHILD: booking.children, INFANT: booking.infants };
    const actual = { ADULT: 0, CHILD: 0, INFANT: 0 };
    for (const p of pax) actual[p.type]++;
    if (
      pax.length !== booking.adults + booking.children + booking.infants ||
      Object.entries(expected).some(([t, n]) => actual[t as keyof typeof actual] !== n)
    ) {
      throw invalid(
        'PASSENGER_COUNT_MISMATCH',
        `This booking is for ${booking.adults} adult(s), ${booking.children} child(ren) and ${booking.infants} infant(s)`,
        undefined,
        { expected },
      );
    }
    if (pax.some((p, i) => p.ordinal !== i + 1)) {
      throw invalid('INVALID_ORDINALS', 'Passenger ordinals must be 1, 2, 3, … without gaps');
    }

    // ── Ages must match the passenger type on the departure date ─────────────
    const ageErrors: FieldError[] = [];
    pax.forEach((p, i) => {
      const field = `passengers[${i}].dateOfBirth`;
      if (!isRealDate(p.dateOfBirth) || p.dateOfBirth > today) {
        ageErrors.push({ field, message: 'Enter a valid date of birth in the past' });
      } else if (typeForAge(ageOn(p.dateOfBirth, departureDate)) !== p.type) {
        ageErrors.push({
          field,
          message: {
            ADULT: 'Adults must be 12 or older on the travel date',
            CHILD: 'Children must be 2–11 on the travel date',
            INFANT: 'Infants must be under 2 on the travel date',
          }[p.type],
        });
      }
    });
    if (ageErrors.length)
      throw invalid(
        'AGE_TYPE_MISMATCH',
        'Some dates of birth do not match the passenger type',
        ageErrors,
      );

    await this.tx.run(async (tx) => {
      const locked = await this.bookings.lockForUpdate(tx, booking.id);
      if (locked?.status !== 'PENDING') {
        throw new AppError(
          'BOOKING_NOT_EDITABLE',
          HttpStatus.CONFLICT,
          'Passenger details can only be changed before payment',
        );
      }
      const now = await this.bookings.dbNow(tx);
      if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() <= now.getTime()) {
        throw new AppError(
          'HOLD_EXPIRED',
          HttpStatus.CONFLICT,
          'Your seat hold has expired. Please choose seats again.',
        );
      }

      // ── Seats: every seated passenger gets exactly one of the booking's held seats ──
      const held = await this.bookings.ownedSeats(booking.id, tx);
      const heldByLabel = new Map(
        held.filter((s) => s.status === 'HELD').map((s) => [s.seatLabel, s]),
      );
      const seatErrors: FieldError[] = [];
      const used = new Set<string>();
      pax.forEach((p, i) => {
        const field = `passengers[${i}].seatLabel`;
        if (p.type === 'INFANT') {
          if (p.seatLabel)
            seatErrors.push({
              field,
              message: 'Infants travel on an adult’s lap and have no seat',
            });
          return;
        }
        const seat = p.seatLabel ? heldByLabel.get(p.seatLabel) : undefined;
        if (!p.seatLabel || !seat)
          seatErrors.push({ field, message: 'Choose one of the seats held for this booking' });
        else if (used.has(p.seatLabel))
          seatErrors.push({ field, message: 'Each seat can only be assigned once' });
        else if (p.type === 'CHILD' && seat.kind === 'EXIT_ROW')
          seatErrors.push({ field, message: 'Children cannot sit in an exit row' });
        if (p.seatLabel) used.add(p.seatLabel);
      });
      if (seatErrors.length || used.size !== heldByLabel.size) {
        throw invalid(
          seatErrors.some((e) => e.message.includes('exit row'))
            ? 'EXIT_ROW_RESTRICTED'
            : 'SEAT_ASSIGNMENT_INVALID',
          'Every seated passenger needs a different seat from this booking',
          seatErrors,
        );
      }

      // ── Replace passengers + seat assignments; invalidate any previous price ──
      await tx.bookingSeat.deleteMany({ where: { bookingId: booking.id } });
      await tx.bookingPassenger.deleteMany({ where: { bookingId: booking.id } });
      for (const p of pax) {
        const created = await tx.bookingPassenger.create({
          data: {
            bookingId: booking.id,
            ordinal: p.ordinal,
            type: p.type,
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00Z`),
            nationality: p.nationality ?? null,
            email: p.ordinal === 1 ? dto.contact.email : null,
            phone: p.ordinal === 1 ? dto.contact.phone : null,
          },
        });
        if (p.seatLabel) {
          await tx.bookingSeat.create({
            data: {
              bookingId: booking.id,
              flightId: booking.flightId,
              flightSeatId: heldByLabel.get(p.seatLabel)!.id,
              passengerId: created.id,
            },
          });
        }
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          contactEmail: dto.contact.email,
          contactPhone: dto.contact.phone,
          totalMinor: null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          actorUserId: user.id,
          actorType: 'USER',
          action: 'PASSENGERS_UPDATED',
          entityType: 'booking',
          entityId: booking.id,
          after: { passengers: pax.length }, // counts only — no PII in audit logs
          correlationId,
        },
        tx,
      );
    });
  }
}
