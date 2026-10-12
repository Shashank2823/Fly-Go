import { PaymentEventsService } from '../../src/modules/payments/payment-events.service';
import { PaymentProcessingService } from '../../src/modules/payments/payment-processing.service';
import { OutboxRelayService } from '../../src/modules/outbox/outbox-relay.service';
import { adult, contact, dobForAge, readyToPay } from './support/booking-flow';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';
import { signedInAgent } from './support/users';

/**
 * Passenger details, checkout pricing and payment rules. Worker steps are invoked directly
 * (no BullMQ) so each edge case is deterministic. The full queue pipeline is covered in
 * payments-pipeline.int-spec.ts.
 */
describe('Passengers, checkout and payments', () => {
  let ctx: TestContext;
  let fx: FlightFixture;
  let processing: PaymentProcessingService;
  let events: PaymentEventsService;

  beforeAll(async () => {
    ctx = await createTestApp();
    processing = ctx.app.get(PaymentProcessingService);
    events = ctx.app.get(PaymentEventsService);
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    fx = await createFlightFixture(ctx.prisma);
  });

  const hold = (
    a: Awaited<ReturnType<typeof signedInAgent>>,
    seats: string[],
    pax = { adults: seats.length, children: 0, infants: 0 },
  ) => a.hold({ flightId: fx.flightId, cabin: 'ECONOMY', passengers: pax, seats }).expect(201);

  const bookingRow = (reference: string) =>
    ctx.prisma.booking.findUniqueOrThrow({ where: { reference } });

  /** Simulates the provider's webhook for a payment, as the mock/real gateway would. */
  const providerEvent = async (
    paymentId: string,
    type: 'payment.succeeded' | 'payment.failed',
    eventId = `evt-${type}-${paymentId}`,
  ) => {
    await processing.submit(paymentId);
    const p = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const res = await events.ingest({
      provider: 'mock',
      providerEventId: eventId,
      providerPaymentId: p.providerPaymentId!,
      paymentId,
      type,
      failureCode: type === 'payment.failed' ? 'card_declined' : undefined,
      source: 'SIMULATED',
      payload: {},
    });
    if (res.paymentEventId) await processing.applyEvent(res.paymentEventId);
    return res;
  };

  describe('passenger details', () => {
    it('saves travellers with their seats and contact details', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A', '2B'], { adults: 1, children: 1, infants: 1 });
      const res = await a
        .put(`/api/v1/bookings/${h.body.reference}/passengers`, {
          contact,
          passengers: [
            adult(fx, 1, '2A'),
            {
              ordinal: 2,
              type: 'CHILD',
              firstName: 'Kabir',
              lastName: 'Verma',
              dateOfBirth: dobForAge(fx, 8),
              seatLabel: '2B',
            },
            {
              ordinal: 3,
              type: 'INFANT',
              firstName: 'Mira',
              lastName: 'Verma',
              dateOfBirth: dobForAge(fx, 1),
            },
          ],
        })
        .expect(200);
      expect(
        res.body.travellers.map((t: { firstName: string; seatLabel: string | null }) => [
          t.firstName,
          t.seatLabel,
        ]),
      ).toEqual([
        ['Asha', '2A'],
        ['Kabir', '2B'],
        ['Mira', null],
      ]);
      expect(res.body.contact).toEqual(contact);
      // Audit records counts only, never names.
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'PASSENGERS_UPDATED' },
      });
      expect(JSON.stringify(audit.after)).not.toContain('Asha');
    });

    it.each([
      [
        'a date of birth that makes the adult a child',
        () => ({ ...adult(fx, 1, '2A'), dateOfBirth: dobForAge(fx, 10) }),
        'AGE_TYPE_MISMATCH',
      ],
      [
        'a seat that is not part of the booking',
        () => adult(fx, 1, '2C'),
        'SEAT_ASSIGNMENT_INVALID',
      ],
      [
        'a missing seat',
        () => ({ ...adult(fx, 1, '2A'), seatLabel: undefined }),
        'SEAT_ASSIGNMENT_INVALID',
      ],
      [
        'an impossible date',
        () => ({ ...adult(fx, 1, '2A'), dateOfBirth: '1990-02-30' }),
        'AGE_TYPE_MISMATCH',
      ],
    ])('rejects %s', async (_label, passenger, code) => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A']);
      const res = await a
        .put(`/api/v1/bookings/${h.body.reference}/passengers`, {
          contact,
          passengers: [passenger()],
        })
        .expect(422);
      expect(res.body.code).toBe(code);
      expect(await ctx.prisma.bookingPassenger.count()).toBe(0);
    });

    it('rejects the wrong number of passengers', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A']);
      const res = await a
        .put(`/api/v1/bookings/${h.body.reference}/passengers`, {
          contact,
          passengers: [adult(fx, 1, '2A'), adult(fx, 2, '2A')],
        })
        .expect(422);
      expect(res.body.code).toBe('PASSENGER_COUNT_MISMATCH');
    });

    it('keeps children out of exit rows', async () => {
      await ctx.prisma.flightSeat.updateMany({
        where: { flightId: fx.flightId, seatLabel: '2C' },
        data: { kind: 'EXIT_ROW' },
      });
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A', '2C'], { adults: 1, children: 1, infants: 0 });
      const res = await a
        .put(`/api/v1/bookings/${h.body.reference}/passengers`, {
          contact,
          passengers: [
            adult(fx, 1, '2A'),
            {
              ordinal: 2,
              type: 'CHILD',
              firstName: 'Kabir',
              lastName: 'Verma',
              dateOfBirth: dobForAge(fx, 8),
              seatLabel: '2C',
            },
          ],
        })
        .expect(422);
      expect(res.body.code).toBe('EXIT_ROW_RESTRICTED');
    });
  });

  describe('checkout', () => {
    it('prices from stored fares and rules — the client never sends an amount', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A', '2B'], { adults: 2, children: 0, infants: 1 });
      await a
        .put(`/api/v1/bookings/${h.body.reference}/passengers`, {
          contact,
          passengers: [
            adult(fx, 1, '2A'),
            adult(fx, 2, '2B', 'Rohan'),
            {
              ordinal: 3,
              type: 'INFANT',
              firstName: 'Mira',
              lastName: 'Verma',
              dateOfBirth: dobForAge(fx, 1),
            },
          ],
        })
        .expect(200);
      const quote = await a.post(`/api/v1/bookings/${h.body.reference}/checkout`).expect(200);
      // 2 × (5000 + 375 + 450) + 2000 extra legroom (2B) + infant (500 + 37.50 + 450)
      expect(quote.body.total).toEqual({ amountMinor: '1463750', currency: 'INR' });
      expect(quote.body.priceVersion).toBe(1);

      const again = await a.post(`/api/v1/bookings/${h.body.reference}/checkout`).expect(200);
      expect(again.body.priceVersion).toBe(1); // unchanged → same version
      expect(await ctx.prisma.bookingPriceLine.count()).toBe(quote.body.lines.length);
    });

    it('requires passenger details first', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const h = await hold(a, ['2A']);
      const res = await a.post(`/api/v1/bookings/${h.body.reference}/checkout`).expect(422);
      expect(res.body.code).toBe('PASSENGERS_INCOMPLETE');
    });

    it('invalidates the price when passengers change', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      await a
        .put(`/api/v1/bookings/${reference}/passengers`, {
          contact,
          passengers: [adult(fx, 1, '2A', 'Anika')],
        })
        .expect(200);
      const res = await a.pay(reference, priceVersion).expect(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
    });
  });

  describe('starting a payment', () => {
    it('records the payment, moves the booking to PAYMENT_PENDING and extends the seat hold', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion, total } = await readyToPay(a, fx);
      const before = await bookingRow(reference);

      const res = await a.pay(reference, priceVersion).expect(202);
      expect(res.body).toMatchObject({
        status: 'INITIATED',
        bookingStatus: 'PAYMENT_PENDING',
        amount: total,
      });

      const after = await bookingRow(reference);
      expect(after.status).toBe('PAYMENT_PENDING');
      expect(after.holdExpiresAt!.getTime()).toBeGreaterThan(before.holdExpiresAt!.getTime());
      const seat = await ctx.prisma.flightSeat.findFirstOrThrow({ where: { bookingId: after.id } });
      expect(seat.holdExpiresAt!.getTime()).toBe(after.holdExpiresAt!.getTime());
      expect(await ctx.prisma.outboxEvent.count({ where: { eventType: 'PaymentRequested' } })).toBe(
        1,
      );
    });

    it('replays the same response for a retried request and rejects a second concurrent payment', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      const key = crypto.randomUUID();
      const first = await a.pay(reference, priceVersion, key).expect(202);
      const retry = await a.pay(reference, priceVersion, key).expect(202);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.paymentId).toBe(first.body.paymentId);

      const second = await a.pay(reference, priceVersion).expect(409);
      expect(second.body).toMatchObject({
        code: 'PAYMENT_IN_PROGRESS',
        meta: { paymentId: first.body.paymentId },
      });
      expect(await ctx.prisma.payment.count()).toBe(1);
    });

    it('refuses to start payment on an expired hold', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      await ctx.prisma.booking.update({
        where: { reference },
        data: { holdExpiresAt: new Date(Date.now() + 5_000) },
      });
      const res = await a.pay(reference, priceVersion).expect(409);
      expect(res.body.code).toBe('HOLD_EXPIRED');
      expect(await ctx.prisma.payment.count()).toBe(0);
    });
  });

  describe('applying provider events', () => {
    it('confirms the booking, books the seats and creates a ticket on success', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      const paid = await a.pay(reference, priceVersion).expect(202);
      await providerEvent(paid.body.paymentId, 'payment.succeeded');

      const b = await bookingRow(reference);
      expect(b).toMatchObject({ status: 'CONFIRMED', holdExpiresAt: null });
      expect(b.confirmedAt).not.toBeNull();
      expect(
        await ctx.prisma.flightSeat.findFirstOrThrow({ where: { bookingId: b.id } }),
      ).toMatchObject({ status: 'BOOKED', holdExpiresAt: null });
      expect(
        await ctx.prisma.ticket.findFirstOrThrow({ where: { bookingId: b.id } }),
      ).toMatchObject({ status: 'PENDING', version: 1 });
      expect(await ctx.prisma.outboxEvent.count({ where: { eventType: 'BookingConfirmed' } })).toBe(
        1,
      );

      const detail = await a.agent.get(`/api/v1/bookings/${reference}`).expect(200);
      expect(detail.body).toMatchObject({
        status: 'CONFIRMED',
        payment: { status: 'SUCCEEDED' },
        ticket: { status: 'PENDING' },
      });
      expect(detail.body.ticket.ticketNumber).toMatch(/^976\d{10}$/);
    });

    it('ignores a duplicate webhook — the booking is confirmed exactly once', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      const paid = await a.pay(reference, priceVersion).expect(202);
      await providerEvent(paid.body.paymentId, 'payment.succeeded', 'evt-1');
      const dup = await providerEvent(paid.body.paymentId, 'payment.succeeded', 'evt-1'); // same provider event id
      expect(dup.recorded).toBe(false);
      await providerEvent(paid.body.paymentId, 'payment.succeeded', 'evt-2'); // same outcome, new id

      expect(await ctx.prisma.ticket.count()).toBe(1);
      expect(await ctx.prisma.outboxEvent.count({ where: { eventType: 'BookingConfirmed' } })).toBe(
        1,
      );
      expect(
        await ctx.prisma.paymentEvent.findMany({
          select: { status: true },
          orderBy: { receivedAt: 'asc' },
        }),
      ).toEqual([{ status: 'APPLIED' }, { status: 'IGNORED' }]);
    });

    it('returns the booking to PENDING on a declined payment so the traveller can retry', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      const paid = await a.pay(reference, priceVersion).expect(202);
      await providerEvent(paid.body.paymentId, 'payment.failed');

      expect((await bookingRow(reference)).status).toBe('PENDING');
      const status = await a.agent
        .get(`/api/v1/bookings/${reference}/payments/${paid.body.paymentId}`)
        .expect(200);
      expect(status.body).toMatchObject({
        status: 'FAILED',
        failureCode: 'card_declined',
        bookingStatus: 'PENDING',
      });

      const retry = await a.pay(reference, priceVersion).expect(202); // new key, new attempt
      expect(retry.body.paymentId).not.toBe(paid.body.paymentId);
    });

    it('refunds a payment that succeeds after the seats were lost', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      const paid = await a.pay(reference, priceVersion).expect(202);
      // Someone else took the seat after an (artificially) expired hold.
      const b = await bookingRow(reference);
      const other = await ctx.prisma.user.create({
        data: { email: 'o@example.com', passwordHash: 'x', fullName: 'Other', nationality: 'IN' },
      });
      const otherBooking = await ctx.prisma.booking.create({
        data: {
          reference: 'XTH234',
          userId: other.id,
          flightId: fx.flightId,
          cabin: 'ECONOMY',
          marketCode: 'IN',
          currency: 'INR',
          adults: 1,
          seatsRequired: 1,
          holdExpiresAt: new Date(Date.now() + 600_000),
        },
      });
      await ctx.prisma.flightSeat.updateMany({
        where: { bookingId: b.id },
        data: { bookingId: otherBooking.id },
      });

      await providerEvent(paid.body.paymentId, 'payment.succeeded');
      expect((await bookingRow(reference)).status).toBe('EXPIRED');
      expect(await ctx.prisma.outboxEvent.count({ where: { eventType: 'RefundRequired' } })).toBe(
        1,
      );

      await processing.refund(paid.body.paymentId);
      expect(
        await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paid.body.paymentId } }),
      ).toMatchObject({ status: 'REFUNDED' });
      expect(await ctx.prisma.ticket.count()).toBe(0);
    });

    it('publishes payment work through the outbox with deduplicated job ids', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const { reference, priceVersion } = await readyToPay(a, fx);
      await a.pay(reference, priceVersion).expect(202);
      const relay = ctx.app.get(OutboxRelayService, { strict: false });
      expect(await relay.relayPending()).toBeGreaterThanOrEqual(1);
      expect(
        await ctx.prisma.outboxEvent.count({
          where: { eventType: 'PaymentRequested', status: 'PUBLISHED' },
        }),
      ).toBe(1);
    });
  });

  describe('my bookings', () => {
    it('lists only my bookings, newest first', async () => {
      const a = await signedInAgent(ctx.app, 'Asha');
      const b = await signedInAgent(ctx.app, 'Bilal');
      await hold(a, ['2A']);
      await hold(a, ['2B']);
      await hold(b, ['2C']);
      const res = await a.agent.get('/api/v1/bookings').expect(200);
      expect(res.body.page.totalItems).toBe(2);
      expect(res.body.data.map((x: { seats: string[] }) => x.seats[0])).toEqual(['2B', '2A']);
    });
  });
});
