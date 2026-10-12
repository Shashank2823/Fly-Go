import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Db, Tx } from '../../database/transaction-runner';
import type { BookingStatus, PaymentStatus } from '../../generated/prisma/client';

export interface LockedBooking {
  id: string;
  reference: string;
  user_id: string;
  status: BookingStatus;
  seats_required: number;
  hold_expires_at: Date | null;
  total_minor: bigint | null;
  currency: string;
  price_version: number;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockBooking(tx: Tx, bookingId: string): Promise<LockedBooking | null> {
    const rows = await tx.$queryRaw<LockedBooking[]>`
      SELECT id, reference, user_id, status, seats_required, hold_expires_at, total_minor, currency, price_version
      FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /** Locks the booking's seat rows in id order (deadlock-free lock ordering, docs §9.1). */
  async lockSeats(tx: Tx, bookingId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM flight_seats WHERE booking_id = ${bookingId}::uuid ORDER BY id FOR UPDATE`;
  }

  async lockPayment(tx: Tx, paymentId: string) {
    const rows = await tx.$queryRaw<{ id: string; status: PaymentStatus; booking_id: string }[]>`
      SELECT id, status, booking_id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  countHeldSeats(tx: Tx, bookingId: string): Promise<number> {
    return tx.flightSeat.count({ where: { bookingId, status: 'HELD' } });
  }

  /** Extends the hold on the booking's seats while a payment is in flight. */
  extendSeatHolds(tx: Tx, bookingId: string, until: Date): Promise<number> {
    return tx.$executeRaw`
      UPDATE flight_seats SET hold_expires_at = ${until}, version = version + 1, updated_at = now()
      WHERE booking_id = ${bookingId}::uuid AND status = 'HELD'`;
  }

  /** HELD → BOOKED for every seat this booking still owns. Returns how many were confirmed. */
  confirmSeats(tx: Tx, bookingId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE flight_seats SET status = 'BOOKED', hold_expires_at = NULL, version = version + 1, updated_at = now()
      WHERE booking_id = ${bookingId}::uuid AND status = 'HELD'`;
  }

  findByProviderId(provider: string, providerPaymentId: string, db: Db = this.prisma) {
    return db.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId } },
    });
  }

  latestForBooking(bookingId: string) {
    return this.prisma.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
  }
}
