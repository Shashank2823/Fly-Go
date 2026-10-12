import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Db, Tx } from '../../database/transaction-runner';
import type { BookingStatus } from '../../generated/prisma/client';

const flightInclude = {
  airline: true,
  origin: true,
  destination: true,
  aircraft: { include: { aircraftType: true } },
} as const;

export const ACTIVE_HOLD_STATUSES: BookingStatus[] = ['PENDING', 'PAYMENT_PENDING'];

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Owner-scoped lookup: a booking that is not the caller's is indistinguishable from a missing one. */
  findByReference(reference: string, ownerId: string | null, db: Db = this.prisma) {
    return db.booking.findFirst({
      where: { reference, ...(ownerId ? { userId: ownerId } : {}) },
      include: { flight: { include: flightInclude } },
    });
  }

  ownedSeats(bookingId: string, db: Db = this.prisma) {
    return db.flightSeat.findMany({
      where: { bookingId, status: { in: ['HELD', 'BOOKED'] } },
      include: { layoutSeat: { select: { features: true, rowNumber: true, columnLetter: true } } },
      orderBy: [{ layoutSeat: { rowNumber: 'asc' } }, { layoutSeat: { columnLetter: 'asc' } }],
    });
  }

  async listForUser(userId: string, page: number, pageSize: number) {
    const where = { userId };
    return Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { flight: { include: flightInclude }, heldSeats: { select: { seatLabel: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
  }

  passengersWithSeats(bookingId: string, db: Db = this.prisma) {
    return db.bookingPassenger.findMany({
      where: { bookingId },
      orderBy: { ordinal: 'asc' },
      include: { seat: { include: { flightSeat: { select: { seatLabel: true, kind: true } } } } },
    });
  }

  priceLines(bookingId: string, priceVersion: number, db: Db = this.prisma) {
    return db.bookingPriceLine.findMany({
      where: { bookingId, priceVersion },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  latestPayment(bookingId: string) {
    return this.prisma.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
  }

  latestTicket(bookingId: string) {
    return this.prisma.ticket.findFirst({ where: { bookingId }, orderBy: { version: 'desc' } });
  }

  flightForBooking(flightId: string) {
    return this.prisma.flight.findUnique({ where: { id: flightId }, include: flightInclude });
  }

  /** Serialises hold creation per user so the pending-booking limit cannot be raced. */
  async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  countActiveHolds(tx: Tx, userId: string): Promise<number> {
    return tx.booking.count({
      where: { userId, status: { in: ACTIVE_HOLD_STATUSES }, holdExpiresAt: { gt: new Date() } },
    });
  }

  async lockForUpdate(tx: Tx, bookingId: string): Promise<{ status: BookingStatus } | null> {
    const rows = await tx.$queryRaw<{ status: BookingStatus }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async dbNow(tx: Tx): Promise<Date> {
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return row!.now;
  }
}
