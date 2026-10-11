import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Tx } from '../../database/transaction-runner';
import type { CabinClass, SeatInventoryStatus, SeatKind } from '../../generated/prisma/client';

export interface SeatMapRow {
  seat_label: string;
  row_number: number;
  column_letter: string;
  cabin: CabinClass;
  kind: SeatKind;
  features: string[];
  status: SeatInventoryStatus;
  booking_id: string | null;
  hold_expires_at: Date | null;
}

export interface ExpiredBooking {
  id: string;
  reference: string;
  user_id: string;
  flight_id: string;
}

/**
 * The only code that mutates flight_seats (docs §9). Every statement is a single atomic
 * conditional update, so availability checked earlier never matters — the WHERE clause
 * is re-evaluated by PostgreSQL under the row lock.
 */
@Injectable()
export class SeatInventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  seatMap(flightId: string): Promise<SeatMapRow[]> {
    return this.prisma.$queryRaw<SeatMapRow[]>`
      SELECT s.seat_label, ls.row_number, ls.column_letter, s.cabin, s.kind, ls.features,
             s.status, s.booking_id, s.hold_expires_at
      FROM flight_seats s
      JOIN layout_seats ls ON ls.id = s.layout_seat_id
      WHERE s.flight_id = ${flightId}::uuid
      ORDER BY ls.row_number, ls.column_letter`;
  }

  /** Seats on the flight matching `labels`, regardless of state (for 422 vs 409 decisions). */
  existingSeats(flightId: string, labels: string[]) {
    return this.prisma.flightSeat.findMany({
      where: { flightId, seatLabel: { in: labels } },
      select: { id: true, seatLabel: true, cabin: true, kind: true },
    });
  }

  /**
   * Atomically holds every requested seat that is free (or whose hold expired) for `bookingId`.
   * Rows are locked in id order (deadlock-free across overlapping multi-seat holds); FOR UPDATE
   * re-checks the predicate after waiting, so a seat taken concurrently simply drops out.
   * Returns the labels actually held — the caller rolls back unless it got all of them.
   */
  async hold(
    tx: Tx,
    p: { flightId: string; labels: string[]; bookingId: string; expiresAt: Date },
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ seat_label: string }[]>`
      UPDATE flight_seats s
         SET status = 'HELD', booking_id = ${p.bookingId}::uuid, hold_expires_at = ${p.expiresAt},
             version = s.version + 1, updated_at = now()
       WHERE s.id IN (
         SELECT id FROM flight_seats
          WHERE flight_id = ${p.flightId}::uuid
            AND seat_label = ANY(${p.labels}::text[])
            AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now()))
          ORDER BY id
          FOR UPDATE
       )
      RETURNING s.seat_label`;
    return rows.map((r) => r.seat_label);
  }

  /** Releases seats still HELD by the booking (seats it lost to a lazy reclaim are untouched). */
  release(tx: Tx, bookingId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE flight_seats
         SET status = 'AVAILABLE', booking_id = NULL, hold_expires_at = NULL,
             version = version + 1, updated_at = now()
       WHERE booking_id = ${bookingId}::uuid AND status = 'HELD'`;
  }

  /**
   * Expires a batch of abandoned PENDING bookings and frees their seats in one statement.
   * SKIP LOCKED lets several workers sweep concurrently and never blocks a booking being paid.
   */
  expireBatch(tx: Tx, limit: number): Promise<ExpiredBooking[]> {
    return tx.$queryRaw<ExpiredBooking[]>`
      WITH expired AS (
        SELECT id FROM bookings
         WHERE status = 'PENDING' AND hold_expires_at < now()
         ORDER BY hold_expires_at
         LIMIT ${limit}
         FOR UPDATE SKIP LOCKED
      ), released AS (
        UPDATE flight_seats s
           SET status = 'AVAILABLE', booking_id = NULL, hold_expires_at = NULL,
               version = s.version + 1, updated_at = now()
          FROM expired e
         WHERE s.booking_id = e.id AND s.status = 'HELD'
        RETURNING s.id
      )
      UPDATE bookings b
         SET status = 'EXPIRED', expired_at = now(), version = b.version + 1, updated_at = now()
        FROM expired e
       WHERE b.id = e.id
      RETURNING b.id, b.reference, b.user_id, b.flight_id`;
  }

  /** The viewer's unexpired holds on this flight (to mark HELD_BY_YOU and offer resume/release). */
  activeHoldsForUser(userId: string, flightId: string) {
    return this.prisma.booking.findMany({
      where: {
        userId,
        flightId,
        status: { in: ['PENDING', 'PAYMENT_PENDING'] },
        holdExpiresAt: { gt: new Date() },
      },
      select: { id: true, reference: true, status: true, holdExpiresAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
