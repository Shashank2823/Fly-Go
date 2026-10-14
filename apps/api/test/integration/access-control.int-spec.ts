import request from 'supertest';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { PaymentEventsService } from '../../src/modules/payments/payment-events.service';
import { PaymentProcessingService } from '../../src/modules/payments/payment-processing.service';
import { TicketsService } from '../../src/modules/tickets/tickets.service';
import { contact, adult, readyToPay } from './support/booking-flow';
import { resetMongo } from './support/delivery';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';
import { signedInAgent } from './support/users';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Authorization matrix for every signed-in endpoint: anonymous callers get 401, another
 * customer gets 404 (a foreign booking is indistinguishable from a missing one), unsafe
 * methods without a CSRF token get 403, and the owner succeeds.
 */
describe('Access control matrix', () => {
  let ctx: TestContext;
  let fx: FlightFixture;
  let owner: Agent;
  let other: Agent;
  let reference: string;
  let paymentId: string;
  let notificationId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    await resetMongo(ctx.app);
    fx = await createFlightFixture(ctx.prisma);

    owner = await signedInAgent(ctx.app, 'Owner');
    other = await signedInAgent(ctx.app, 'Other');

    // A confirmed booking with an issued ticket and a notification, owned by `owner`.
    const ready = await readyToPay(owner, fx, ['2A']);
    reference = ready.reference;
    const paid = await owner.pay(reference, ready.priceVersion).expect(202);
    paymentId = paid.body.paymentId as string;

    const processing = ctx.app.get(PaymentProcessingService);
    await processing.submit(paymentId);
    const p = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const ingested = await ctx.app.get(PaymentEventsService).ingest({
      provider: 'mock',
      providerEventId: `evt-acl-${paymentId}`,
      providerPaymentId: p.providerPaymentId!,
      paymentId,
      type: 'payment.succeeded',
      source: 'SIMULATED',
      payload: {},
    });
    await processing.applyEvent(ingested.paymentEventId!);
    await ctx.app.get(TicketsService).generate(p.bookingId);

    const ownerUser = await ctx.prisma.booking.findUniqueOrThrow({ where: { reference } });
    await ctx.app.get(NotificationsService).create({
      type: 'BOOKING_CONFIRMED',
      eventId: 'acl-test',
      userId: ownerUser.userId,
      reference,
    });
    const list = await owner.agent.get('/api/v1/notifications').expect(200);
    notificationId = (list.body.data as { id: string }[])[0]!.id;
  });
  afterAll(() => ctx.app.close());

  const routes = (): { method: Method; url: string; body?: object }[] => [
    { method: 'get', url: `/api/v1/bookings/${reference}` },
    { method: 'delete', url: `/api/v1/bookings/${reference}` },
    {
      method: 'put',
      url: `/api/v1/bookings/${reference}/passengers`,
      body: { contact, passengers: [adult(fx, 1, '2A')] },
    },
    { method: 'post', url: `/api/v1/bookings/${reference}/checkout` },
    { method: 'post', url: `/api/v1/bookings/${reference}/payments`, body: { priceVersion: 1 } },
    { method: 'get', url: `/api/v1/bookings/${reference}/payments/${paymentId}` },
    { method: 'get', url: `/api/v1/bookings/${reference}/ticket` },
    { method: 'get', url: `/api/v1/bookings/${reference}/ticket/download` },
    { method: 'patch', url: `/api/v1/notifications/${notificationId}/read` },
  ];

  const send = (a: Agent, r: { method: Method; url: string; body?: object }, csrf = true) => {
    let req = a.agent[r.method](r.url)
      .set('Origin', 'http://localhost:5173')
      .set('Idempotency-Key', crypto.randomUUID());
    if (csrf) req = req.set('X-CSRF-Token', a.csrf);
    return r.body ? req.send(r.body) : req;
  };

  it('rejects anonymous callers on every signed-in endpoint with 401', async () => {
    const anon = request(ctx.app.getHttpServer());
    const all = [
      ...routes(),
      { method: 'get' as const, url: '/api/v1/auth/me' },
      { method: 'post' as const, url: '/api/v1/auth/logout' },
      { method: 'get' as const, url: '/api/v1/bookings' },
      { method: 'post' as const, url: '/api/v1/bookings', body: {} },
      { method: 'get' as const, url: '/api/v1/notifications' },
      { method: 'post' as const, url: '/api/v1/notifications/read-all' },
      { method: 'get' as const, url: '/api/v1/health/workers' },
    ];
    for (const r of all) {
      const res = await anon[r.method](r.url).set('Origin', 'http://localhost:5173');
      expect({ route: `${r.method.toUpperCase()} ${r.url}`, status: res.status }).toEqual({
        route: `${r.method.toUpperCase()} ${r.url}`,
        status: 401,
      });
      expect(res.headers['content-type']).toContain('application/problem+json');
    }
  });

  it("returns 404 when another customer touches someone else's resources", async () => {
    for (const r of routes()) {
      const res = await send(other, r);
      expect({ route: `${r.method.toUpperCase()} ${r.url}`, status: res.status }).toEqual({
        route: `${r.method.toUpperCase()} ${r.url}`,
        status: 404,
      });
    }
  });

  it("never lists another customer's bookings or notifications", async () => {
    const bookings = await other.agent.get('/api/v1/bookings').expect(200);
    expect(bookings.body.data).toEqual([]);
    const notifications = await other.agent.get('/api/v1/notifications').expect(200);
    expect(notifications.body.data).toEqual([]);

    // Marking all as read must not affect the owner's notifications.
    await other.post('/api/v1/notifications/read-all').expect(204);
    const mine = await owner.agent.get('/api/v1/notifications').expect(200);
    expect(mine.body.data[0].read).toBe(false);
  });

  it('rejects unsafe methods without a CSRF token with 403', async () => {
    for (const r of routes().filter((x) => x.method !== 'get')) {
      const res = await send(owner, r, false);
      expect({ route: `${r.method.toUpperCase()} ${r.url}`, status: res.status }).toEqual({
        route: `${r.method.toUpperCase()} ${r.url}`,
        status: 403,
      });
    }
  });

  it("never replays another customer's response for a reused Idempotency-Key", async () => {
    const key = crypto.randomUUID();
    const body = {
      flightId: fx.flightId,
      cabin: 'ECONOMY',
      passengers: { adults: 1, children: 0, infants: 0 },
    };
    const mine = await owner.hold({ ...body, seats: ['2C'] }, key).expect(201);
    const theirs = await other.hold({ ...body, seats: ['2C'] }, key);
    // Same key, same seat: the second user is a fresh request and loses the seat race —
    // it must not receive the owner's booking.
    expect(theirs.status).toBe(409);
    expect(theirs.body.reference).toBeUndefined();
    await owner.del(`/api/v1/bookings/${mine.body.reference}`).expect(204);
  });

  it('forbids customers from admin-only endpoints', async () => {
    await owner.agent.get('/api/v1/health/workers').expect(403);
  });

  it('lets the owner read their own resources', async () => {
    await owner.agent.get(`/api/v1/bookings/${reference}`).expect(200);
    await owner.agent.get(`/api/v1/bookings/${reference}/payments/${paymentId}`).expect(200);
    const pdf = await owner.agent.get(`/api/v1/bookings/${reference}/ticket`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await owner.agent.get(`/api/v1/bookings/${reference}/ticket/download`).expect(200);
    await send(
      owner,
      routes().find((r) => r.method === 'patch')!,
    ).expect(204);
  });
});
