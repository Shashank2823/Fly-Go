import request from 'supertest';
import type { AuthenticatedUser } from '../../src/common/auth/authenticated-user';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { HoldExpiryService } from '../../src/modules/seat-inventory/hold-expiry.service';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';
import { createCustomer, signedInAgent } from './support/users';

/**
 * Fixture seats — BUSINESS: 1A, 1C · ECONOMY: 2A, 2B (extra legroom), 2C.
 * These tests exercise the real PostgreSQL locking paths (docs §9).
 */
describe('Seat holds (booking-as-hold)', () => {
  let ctx: TestContext;
  let fx: FlightFixture;
  let bookings: BookingsService;
  let expiry: HoldExpiryService;

  const economy = (seats: string[], adults = seats.length) => ({
    flightId: fx.flightId,
    cabin: 'ECONOMY',
    passengers: { adults, children: 0, infants: 0 },
    seats,
  });

  const seatRow = (label: string) =>
    ctx.prisma.flightSeat.findFirstOrThrow({ where: { flightId: fx.flightId, seatLabel: label } });

  const expireNow = async (reference: string) => {
    const past = new Date(Date.now() - 1_000);
    const b = await ctx.prisma.booking.update({
      where: { reference },
      data: { holdExpiresAt: past },
    });
    await ctx.prisma.flightSeat.updateMany({
      where: { bookingId: b.id, status: 'HELD' },
      data: { holdExpiresAt: past },
    });
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    bookings = ctx.app.get(BookingsService);
    expiry = ctx.app.get(HoldExpiryService);
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    fx = await createFlightFixture(ctx.prisma);
  });

  describe('creating a hold', () => {
    it('holds the seat, prices an estimate and shows it as yours on the seat map', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const res = await a.hold(economy(['2B'])).expect(201);

      expect(res.body).toMatchObject({
        status: 'PENDING',
        cabin: 'ECONOMY',
        seats: [{ label: '2B', kind: 'EXTRA_LEGROOM' }],
      });
      expect(res.body.reference).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      const ttl = (Date.parse(res.body.holdExpiresAt) - Date.parse(res.body.serverTime)) / 1000;
      expect(ttl).toBeCloseTo(600, 0);
      // ₹5,000 base + ₹375 tax + ₹450 fee + ₹2,000 extra legroom
      expect(res.body.priceEstimate.total).toEqual({ amountMinor: '782500', currency: 'INR' });

      const seat = await seatRow('2B');
      expect(seat.status).toBe('HELD');

      const mine = await a.agent.get(`/api/v1/flights/${fx.flightId}/seat-map`).expect(200);
      expect(mine.body.seats.find((s: { label: string }) => s.label === '2B').state).toBe(
        'HELD_BY_YOU',
      );
      const anon = await request(ctx.app.getHttpServer())
        .get(`/api/v1/flights/${fx.flightId}/seat-map`)
        .expect(200);
      expect(anon.body.seats.find((s: { label: string }) => s.label === '2B').state).toBe('HELD');
      expect(await ctx.prisma.auditLog.count({ where: { action: 'BOOKING_HELD' } })).toBe(1);
    });

    it('requires an Idempotency-Key', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const res = await a.agent
        .post('/api/v1/bookings')
        .set('X-CSRF-Token', a.csrf)
        .set('Origin', 'http://localhost:5173')
        .send(economy(['2A']))
        .expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('replays the original booking for a retried request with the same key', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const key = crypto.randomUUID();
      const first = await a.hold(economy(['2A']), key).expect(201);
      const retry = await a.hold(economy(['2A']), key).expect(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.reference).toBe(first.body.reference);
      expect(await ctx.prisma.booking.count()).toBe(1);

      const reused = await a.hold(economy(['2C']), key).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('rejects a seat another traveller holds', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const b = await signedInAgent(ctx.app, 'Bilal');
      await a.hold(economy(['2A'])).expect(201);
      const res = await b.hold(economy(['2A'])).expect(409);
      expect(res.body).toMatchObject({ code: 'SEATS_UNAVAILABLE', meta: { unavailable: ['2A'] } });
    });

    it('is all-or-nothing for multi-seat holds', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const b = await signedInAgent(ctx.app, 'Bilal');
      await a.hold(economy(['2A'])).expect(201);
      await b.hold(economy(['2B', '2A'])).expect(409);
      expect((await seatRow('2B')).status).toBe('AVAILABLE');
      expect(await ctx.prisma.booking.count()).toBe(1);
    });

    it.each([
      [
        { seats: ['2A', '2B'], passengers: { adults: 1, children: 0, infants: 0 } },
        'SEAT_COUNT_MISMATCH',
      ],
      [{ seats: ['9Z'] }, 'SEAT_NOT_FOUND'],
      [{ seats: ['1A'] }, 'SEAT_CABIN_MISMATCH'],
      [{ seats: ['2A'], passengers: { adults: 1, children: 0, infants: 2 } }, 'TOO_MANY_INFANTS'],
    ])('rejects %j with %s', async (override, code) => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const res = await a.hold({ ...economy(['2A']), ...override }).expect(422);
      expect(res.body.code).toBe(code);
      expect(await ctx.prisma.booking.count()).toBe(0);
    });

    it('refuses flights that have departed or are inside the booking cut-off', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const soon = new Date(Date.now() + 30 * 60_000);
      await ctx.prisma.flight.update({
        where: { id: fx.flightId },
        data: { departureAt: soon, arrivalAt: new Date(soon.getTime() + 3_600_000) },
      });
      const res = await a.hold(economy(['2A'])).expect(422);
      expect(res.body.code).toBe('FLIGHT_NOT_BOOKABLE');
    });

    it('limits travellers to three bookings in progress', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      for (const seat of ['2A', '2B', '2C']) await a.hold(economy([seat])).expect(201);
      const res = await a.hold({ ...economy(['1A']), cabin: 'BUSINESS' }).expect(409);
      expect(res.body.code).toBe('TOO_MANY_ACTIVE_HOLDS');
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of 50 simultaneous requests win the same seat', async () => {
      const users: AuthenticatedUser[] = [];
      for (let i = 0; i < 50; i++) users.push(await createCustomer(ctx.prisma));

      const results = await Promise.allSettled(
        users.map((u) =>
          bookings.createHold(u, economy(['2A']) as never, crypto.randomUUID(), 'test'),
        ),
      );
      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(49);
      expect(new Set(lost.map((r) => (r.reason as { code: string }).code))).toEqual(
        new Set(['SEATS_UNAVAILABLE']),
      );

      const seat = await seatRow('2A');
      const winner = await ctx.prisma.booking.findFirstOrThrow();
      expect(seat).toMatchObject({ status: 'HELD', bookingId: winner.id });
      expect(await ctx.prisma.booking.count()).toBe(1); // losers' bookings rolled back
    });

    it('never splits overlapping multi-seat holds (2A+2B vs 2B+2C)', async () => {
      const users: AuthenticatedUser[] = [];
      for (let i = 0; i < 20; i++) users.push(await createCustomer(ctx.prisma));

      const results = await Promise.allSettled(
        users.map((u, i) =>
          bookings.createHold(
            u,
            economy(i % 2 ? ['2A', '2B'] : ['2B', '2C']) as never,
            crypto.randomUUID(),
            'test',
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const [booking] = await ctx.prisma.booking.findMany({ include: { heldSeats: true } });
      expect(booking!.heldSeats).toHaveLength(2);
      const held = await ctx.prisma.flightSeat.count({
        where: { flightId: fx.flightId, status: 'HELD' },
      });
      expect(held).toBe(2);
    });
  });

  describe('expiry and release', () => {
    it('lets an expired hold be reclaimed, and the sweep never frees the new owner’s seat', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const b = await signedInAgent(ctx.app, 'Bilal');
      const first = await a.hold(economy(['2A'])).expect(201);
      await expireNow(first.body.reference);

      const second = await b.hold(economy(['2A'])).expect(201);
      expect(await expiry.expireAbandonedHolds()).toBe(1);

      const old = await ctx.prisma.booking.findUniqueOrThrow({
        where: { reference: first.body.reference },
      });
      const fresh = await ctx.prisma.booking.findUniqueOrThrow({
        where: { reference: second.body.reference },
      });
      expect(old.status).toBe('EXPIRED');
      expect(await seatRow('2A')).toMatchObject({ status: 'HELD', bookingId: fresh.id });
      expect(
        await ctx.prisma.outboxEvent.count({
          where: { eventType: 'BookingExpired', aggregateId: old.id },
        }),
      ).toBe(1);
    });

    it('frees seats of abandoned holds and reports the booking as expired', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const res = await a.hold(economy(['2C'])).expect(201);
      await expireNow(res.body.reference);

      const before = await request(ctx.app.getHttpServer()).get(
        `/api/v1/flights/${fx.flightId}/seat-map`,
      );
      expect(before.body.seats.find((s: { label: string }) => s.label === '2C').state).toBe(
        'AVAILABLE',
      );

      await expiry.expireAbandonedHolds();
      expect(await seatRow('2C')).toMatchObject({
        status: 'AVAILABLE',
        bookingId: null,
        holdExpiresAt: null,
      });

      const detail = await a.agent.get(`/api/v1/bookings/${res.body.reference}`).expect(200);
      expect(detail.body).toMatchObject({
        status: 'EXPIRED',
        seats: [],
        holdExpiresAt: null,
        priceEstimate: null,
      });
      expect(await expiry.expireAbandonedHolds()).toBe(0);
    });

    it('releases a hold on request, idempotently', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const res = await a.hold(economy(['2A', '2C'])).expect(201);
      await a.del(`/api/v1/bookings/${res.body.reference}`).expect(204);
      await a.del(`/api/v1/bookings/${res.body.reference}`).expect(204);

      expect((await seatRow('2A')).status).toBe('AVAILABLE');
      expect((await seatRow('2C')).status).toBe('AVAILABLE');
      const booking = await ctx.prisma.booking.findUniqueOrThrow({
        where: { reference: res.body.reference },
      });
      expect(booking.status).toBe('CANCELLED');
    });
  });

  describe('ownership', () => {
    it('hides other travellers’ bookings behind 404s', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const b = await signedInAgent(ctx.app, 'Bilal');
      const res = await a.hold(economy(['2A'])).expect(201);

      await b.agent.get(`/api/v1/bookings/${res.body.reference}`).expect(404);
      await b.del(`/api/v1/bookings/${res.body.reference}`).expect(404);
      expect((await seatRow('2A')).status).toBe('HELD');
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/bookings/${res.body.reference}`)
        .expect(401);
    });
  });

  describe('seat map', () => {
    it('describes the layout with aisles, seat kinds and surcharges', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/v1/flights/${fx.flightId}/seat-map`)
        .expect(200);
      expect(res.body.cabins).toEqual([
        { cabin: 'BUSINESS', firstRow: 1, lastRow: 1, columns: ['A', null, 'C'] },
        { cabin: 'ECONOMY', firstRow: 2, lastRow: 2, columns: ['A', 'B', null, 'C'] },
      ]);
      const twoB = res.body.seats.find((s: { label: string }) => s.label === '2B');
      expect(twoB).toMatchObject({
        kind: 'EXTRA_LEGROOM',
        state: 'AVAILABLE',
        surcharge: { amountMinor: '200000', currency: 'INR' },
      });
      expect(res.body.holdTtlSeconds).toBe(600);
    });
  });
});
