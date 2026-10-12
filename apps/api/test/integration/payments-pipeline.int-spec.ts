import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { WorkerModule } from '../../src/worker.module';
import { readyToPay } from './support/booking-flow';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';
import { signedInAgent } from './support/users';

/**
 * End-to-end through the real infrastructure: API → outbox → relay (BullMQ job scheduler) →
 * payments queue → mock gateway → simulated webhook (delayed job) → event inbox → apply →
 * booking CONFIRMED. A real worker runs in-process against Redis DB 15.
 */
describe('Payment pipeline (API + worker + queues)', () => {
  let ctx: TestContext;
  let worker: INestApplicationContext;
  let fx: FlightFixture;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error'] });
    await worker.init();
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    await ctx.app.close();
  });

  beforeEach(async () => {
    fx = await createFlightFixture(ctx.prisma).catch(async () => {
      await resetDatabase(ctx.prisma);
      return createFlightFixture(ctx.prisma);
    });
  });

  const waitFor = async <T>(
    fn: () => Promise<T>,
    done: (v: T) => boolean,
    timeoutMs = 20_000,
  ): Promise<T> => {
    const start = Date.now();
    for (;;) {
      const v = await fn();
      if (done(v) || Date.now() - start > timeoutMs) return v;
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  it('confirms a booking asynchronously after "Complete payment"', async () => {
    const a = await signedInAgent(ctx.app, 'Asha');
    const { reference, priceVersion } = await readyToPay(a, fx, ['2A', '2B']);

    const started = await a.pay(reference, priceVersion).expect(202);
    expect(started.body.status).toBe('INITIATED');

    const final = await waitFor(
      async () =>
        (await a.agent.get(`/api/v1/bookings/${reference}/payments/${started.body.paymentId}`))
          .body,
      (b: { status: string }) => b.status === 'SUCCEEDED' || b.status === 'FAILED',
    );
    expect(final).toMatchObject({ status: 'SUCCEEDED', bookingStatus: 'CONFIRMED' });

    const detail = await a.agent.get(`/api/v1/bookings/${reference}`).expect(200);
    expect(detail.body).toMatchObject({ status: 'CONFIRMED', payment: { status: 'SUCCEEDED' } });
    expect(detail.body.seats.map((s: { label: string }) => s.label).sort()).toEqual(['2A', '2B']);

    const events = await ctx.prisma.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'SIMULATED',
      status: 'APPLIED',
      type: 'payment.succeeded',
    });
    const audit = await ctx.prisma.auditLog.findMany({
      where: { action: { in: ['PAYMENT_INITIATED', 'PAYMENT_SUBMITTED', 'BOOKING_CONFIRMED'] } },
    });
    expect(audit.map((x) => x.action).sort()).toEqual([
      'BOOKING_CONFIRMED',
      'PAYMENT_INITIATED',
      'PAYMENT_SUBMITTED',
    ]);
  }, 40_000);
});
