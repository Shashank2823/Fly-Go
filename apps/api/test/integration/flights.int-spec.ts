import request from 'supertest';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';

describe('Flight search and details', () => {
  let ctx: TestContext;
  let fx: FlightFixture;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    fx = await createFlightFixture(ctx.prisma);
  });

  const search = (params: Record<string, string | number>) =>
    http()
      .get('/api/v1/flights')
      .query({ from: 'DEL', to: 'BOM', date: fx.date, ...params });

  it('returns bookable flights with airport-local times and an all-in INR price', async () => {
    const res = await search({}).expect(200);
    expect(res.body.market).toEqual({ code: 'IN', currency: 'INR' });
    expect(res.body.page).toMatchObject({ page: 1, totalItems: 2, totalPages: 1 });
    const [first] = res.body.data;
    expect(first).toMatchObject({
      flightNumber: 'XI101',
      airline: { code: 'XI', name: 'Indus Skyways' },
      origin: { iata: 'DEL', city: 'New Delhi' },
      destination: { iata: 'BOM' },
      durationMinutes: 130,
      cabin: 'ECONOMY',
      seatsAvailable: 3,
      // ₹5,000 base + 7.5% tax + ₹450 fee = ₹5,825.00
      pricePerAdult: { amountMinor: '582500', currency: 'INR' },
    });
    expect(first.departure.local).toBe(`${fx.date}T09:30:00+05:30`);
    expect(first.departure.timezone).toBe('Asia/Kolkata');
    expect(first.departure.utc).toBe(fx.departureAt.toISOString());
  });

  it('sorts by price descending', async () => {
    await ctx.prisma.flightFare.updateMany({
      where: { flightId: fx.otherFlightId, cabin: 'ECONOMY' },
      data: { baseFareMinor: 900_000n },
    });
    const res = await search({ sort: 'price', order: 'desc' }).expect(200);
    expect(res.body.data.map((f: { flightNumber: string }) => f.flightNumber)).toEqual([
      'XI103',
      'XI101',
    ]);
  });

  it('excludes flights without enough free seats in the cabin', async () => {
    await search({ passengers: 3 })
      .expect(200)
      .expect((r) => expect(r.body.data).toHaveLength(2));
    await search({ passengers: 4 })
      .expect(200)
      .expect((r) => expect(r.body.data).toHaveLength(0));
  });

  it('counts expired holds as available and live holds as taken', async () => {
    const user = await ctx.prisma.user.create({
      data: { email: 'h@example.com', passwordHash: 'x', fullName: 'Holder', nationality: 'IN' },
    });
    const booking = await ctx.prisma.booking.create({
      data: {
        reference: 'HLD234',
        userId: user.id,
        flightId: fx.flightId,
        cabin: 'ECONOMY',
        marketCode: 'IN',
        currency: 'INR',
        adults: 1,
        seatsRequired: 1,
        holdExpiresAt: new Date(Date.now() + 600_000),
      },
    });
    const hold = (label: string, expiresAt: Date) => ctx.prisma.$executeRaw`
      UPDATE flight_seats SET status = 'HELD', booking_id = ${booking.id}::uuid, hold_expires_at = ${expiresAt}
      WHERE flight_id = ${fx.flightId}::uuid AND seat_label = ${label}`;
    await hold('2A', new Date(Date.now() + 600_000)); // live
    await hold('2B', new Date(Date.now() - 1_000)); // expired

    const res = await search({}).expect(200);
    const morning = res.body.data.find((f: { flightNumber: string }) => f.flightNumber === 'XI101');
    expect(morning.seatsAvailable).toBe(2);
  });

  it.each([
    [{ from: 'DEL', to: 'DEL' }, 400, 'SAME_AIRPORTS'],
    [{ to: 'XXX' }, 422, 'AIRPORT_NOT_FOUND'],
    [{ date: '2020-01-01' }, 422, 'DATE_IN_PAST'],
    [{ sort: 'random' }, 400, 'VALIDATION_FAILED'],
    [{ passengers: 10 }, 400, 'VALIDATION_FAILED'],
    [{ date: '20-10-2026' }, 400, 'VALIDATION_FAILED'],
  ])('rejects invalid query %j', async (params, status, code) => {
    const res = await search(params).expect(status);
    expect(res.body.code).toBe(code);
  });

  it('returns flight details with per-cabin offers', async () => {
    const res = await http().get(`/api/v1/flights/${fx.flightId}`).expect(200);
    expect(res.body.cabins.map((c: { cabin: string }) => c.cabin)).toEqual(['BUSINESS', 'ECONOMY']);
    expect(res.body.cabins[0]).toMatchObject({
      baseFare: { amountMinor: '1500000', currency: 'INR' },
      seatsAvailable: 2,
    });
  });

  it('returns 404 for unknown flights and 400 for malformed ids', async () => {
    await http().get('/api/v1/flights/0199c7a0-0000-7000-8000-000000000000').expect(404);
    await http().get('/api/v1/flights/not-a-uuid').expect(400);
  });

  it('finds airports by city prefix, code and fuzzy name', async () => {
    const byCity = await http().get('/api/v1/airports').query({ q: 'mum' }).expect(200);
    expect(byCity.body[0].iata).toBe('BOM');
    const byCode = await http().get('/api/v1/airports').query({ q: 'del' }).expect(200);
    expect(byCode.body[0]).toMatchObject({ iata: 'DEL', timezone: 'Asia/Kolkata' });
  });
});
