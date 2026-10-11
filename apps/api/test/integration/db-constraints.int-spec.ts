import type { PrismaService } from '../../src/database/prisma.service';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, type TestContext } from './support/test-app';

/**
 * The database is the last line of defence (docs §6.4): each test writes a row that the
 * application should never produce and proves PostgreSQL rejects it.
 */
describe('PostgreSQL integrity constraints', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let fx: FlightFixture;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
  });
  afterAll(() => ctx.app.close());

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await createFlightFixture(prisma);
    const user = await prisma.user.create({
      data: {
        email: 'c@example.com',
        passwordHash: 'x',
        fullName: 'Constraint Tester',
        nationality: 'IN',
      },
    });
    userId = user.id;
  });

  const seat = (flightId: string, label: string) =>
    prisma.flightSeat.findFirstOrThrow({ where: { flightId, seatLabel: label } });

  const booking = (overrides: Record<string, unknown> = {}) =>
    prisma.booking.create({
      data: {
        reference: 'K7QX2M',
        userId,
        flightId: fx.flightId,
        cabin: 'ECONOMY',
        marketCode: 'IN',
        currency: 'INR',
        adults: 1,
        seatsRequired: 1,
        holdExpiresAt: new Date(Date.now() + 600_000),
        ...overrides,
      },
    });

  describe('flight_seats ownership', () => {
    it('rejects a HELD seat without an owning booking', async () => {
      const s = await seat(fx.flightId, '2A');
      await expect(
        prisma.$executeRaw`UPDATE flight_seats SET status = 'HELD', hold_expires_at = now() WHERE id = ${s.id}::uuid`,
      ).rejects.toThrow(/flight_seats_owner_chk/);
    });

    it('rejects a BOOKED seat that still carries a hold expiry', async () => {
      const b = await booking();
      const s = await seat(fx.flightId, '2A');
      await expect(
        prisma.$executeRaw`UPDATE flight_seats SET status = 'BOOKED', booking_id = ${b.id}::uuid, hold_expires_at = now() WHERE id = ${s.id}::uuid`,
      ).rejects.toThrow(/flight_seats_owner_chk/);
    });

    it('rejects a duplicate seat label on the same flight', async () => {
      const s = await seat(fx.flightId, '2A');
      await expect(
        prisma.$executeRaw`INSERT INTO flight_seats (id, flight_id, layout_seat_id, seat_label, cabin, kind, updated_at)
          VALUES (gen_random_uuid(), ${fx.flightId}::uuid, ${s.layoutSeatId}::uuid, '2A', 'ECONOMY', 'STANDARD', now())`,
      ).rejects.toThrow(/unique/i);
    });
  });

  describe('booking_seats composite keys', () => {
    it('rejects assigning a seat from a different flight', async () => {
      const b = await booking();
      const pax = await prisma.bookingPassenger.create({
        data: {
          bookingId: b.id,
          ordinal: 1,
          type: 'ADULT',
          firstName: 'A',
          lastName: 'B',
          dateOfBirth: new Date('1990-01-01'),
        },
      });
      const foreignSeat = await seat(fx.otherFlightId, '2A');
      await expect(
        prisma.$executeRaw`INSERT INTO booking_seats (id, booking_id, flight_id, flight_seat_id, passenger_id)
          VALUES (gen_random_uuid(), ${b.id}::uuid, ${fx.flightId}::uuid, ${foreignSeat.id}::uuid, ${pax.id}::uuid)`,
      ).rejects.toThrow(/booking_seats_flight_seat_id_flight_id_fkey/);
    });
  });

  describe('bookings', () => {
    it('rejects malformed references (ambiguous characters)', async () => {
      await expect(booking({ reference: 'O0I1LL' })).rejects.toThrow(/bookings_reference_chk/);
    });

    it('rejects more infants than adults', async () => {
      await expect(booking({ adults: 1, infants: 2 })).rejects.toThrow(/bookings_pax_chk/);
    });

    it('rejects a PENDING booking without a hold expiry', async () => {
      await expect(booking({ holdExpiresAt: null })).rejects.toThrow(/bookings_hold_chk/);
    });

    it('rejects CONFIRMED without confirmation timestamp and total', async () => {
      await expect(booking({ status: 'CONFIRMED', holdExpiresAt: null })).rejects.toThrow(
        /bookings_confirmed_chk/,
      );
    });
  });

  describe('payments', () => {
    const payment = (
      bookingId: string,
      key: string,
      status: 'INITIATED' | 'SUCCEEDED' | 'FAILED',
    ) =>
      prisma.payment.create({
        data: {
          bookingId,
          provider: 'mock',
          status,
          amountMinor: 582_500n,
          currency: 'INR',
          idempotencyKey: key,
          succeededAt: status === 'SUCCEEDED' ? new Date() : null,
        },
      });

    it('allows only one in-flight attempt per booking', async () => {
      const b = await booking();
      await payment(b.id, 'k1', 'INITIATED');
      await expect(payment(b.id, 'k2', 'INITIATED')).rejects.toThrow();
      await expect(payment(b.id, 'k3', 'FAILED')).resolves.toBeDefined();
    });

    it('allows only one successful payment per booking', async () => {
      const b = await booking();
      await payment(b.id, 'k1', 'SUCCEEDED');
      await expect(payment(b.id, 'k2', 'SUCCEEDED')).rejects.toThrow();
    });

    it('rejects reuse of an idempotency key on the same booking', async () => {
      const b = await booking();
      await payment(b.id, 'same', 'FAILED');
      await expect(payment(b.id, 'same', 'FAILED')).rejects.toThrow();
    });
  });

  describe('tickets', () => {
    it('allows at most one ISSUED ticket per booking', async () => {
      const b = await booking();
      const issued = {
        status: 'ISSUED' as const,
        issuedAt: new Date(),
        storageKey: 'k',
        sha256: 'a'.repeat(64),
      };
      await prisma.ticket.create({
        data: { bookingId: b.id, version: 1, ticketNumber: 'T1', ...issued },
      });
      await expect(
        prisma.ticket.create({
          data: { bookingId: b.id, version: 2, ticketNumber: 'T2', ...issued },
        }),
      ).rejects.toThrow();
    });
  });

  describe('reference data', () => {
    it('rejects a flight that arrives before it departs', async () => {
      const f = await prisma.flight.findUniqueOrThrow({ where: { id: fx.flightId } });
      await expect(
        prisma.flight.update({
          where: { id: f.id },
          data: { arrivalAt: new Date(f.departureAt.getTime() - 60_000) },
        }),
      ).rejects.toThrow(/flights_times_chk/);
    });

    it('allows only one default market', async () => {
      await expect(
        prisma.market.create({
          data: { code: 'XX', name: 'Other', currency: 'USD', isDefault: true },
        }),
      ).rejects.toThrow();
    });

    it('rejects fee rules with an invalid percentage', async () => {
      await expect(
        prisma.feeRule.create({
          data: {
            marketCode: 'IN',
            code: 'BAD',
            name: 'Bad',
            kind: 'PERCENT_OF_BASE_BPS',
            value: 20_000n,
            activeFrom: new Date(),
          },
        }),
      ).rejects.toThrow(/fee_rules_bps_chk/);
    });
  });
});
