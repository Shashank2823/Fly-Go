import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Db } from 'mongodb';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { AppConfig } from '../../src/config/app-config';
import { MONGO_DB } from '../../src/database/mongo.tokens';
import { EmailMessagesRepository } from '../../src/modules/email/email-messages.repository';
import type { EmailTransport } from '../../src/modules/email/email-transport';
import { EmailService } from '../../src/modules/email/email.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { OutboxRelayService } from '../../src/modules/outbox/outbox-relay.service';
import { PaymentEventsService } from '../../src/modules/payments/payment-events.service';
import { PaymentProcessingService } from '../../src/modules/payments/payment-processing.service';
import { TicketsService } from '../../src/modules/tickets/tickets.service';
import { QueueName } from '../../src/queues/queue-names';
import { readyToPay } from './support/booking-flow';
import { mailpitMessage, mailpitSearch, resetMongo } from './support/delivery';
import { createFlightFixture, type FlightFixture, resetDatabase } from './support/fixtures';
import { createTestApp, flushTestRedis, type TestContext } from './support/test-app';
import { signedInAgent } from './support/users';

/**
 * Tickets (PostgreSQL + MongoDB snapshot + file), confirmation email (Mailpit) and in-app
 * notifications (MongoDB). Worker steps are invoked directly for deterministic edge cases.
 */
describe('Tickets, email and notifications', () => {
  let ctx: TestContext;
  let fx: FlightFixture;
  let mongo: Db;
  let tickets: TicketsService;

  beforeAll(async () => {
    ctx = await createTestApp();
    tickets = ctx.app.get(TicketsService);
    // The API process has no EmailModule (the worker sends email); build the parts directly.
    emailRepo = new EmailMessagesRepository(ctx.app.get<Db>(MONGO_DB));
  });
  let emailRepo: EmailMessagesRepository;
  afterAll(() => ctx.app.close());

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
    mongo = await resetMongo(ctx.app);
    fx = await createFlightFixture(ctx.prisma);
  });

  /** A booking confirmed through the real payment services (no queues). */
  async function confirmedBooking(name = 'Asha') {
    const a = await signedInAgent(ctx.app, name);
    const { reference, priceVersion } = await readyToPay(a, fx, ['2A']);
    const paid = await a.pay(reference, priceVersion).expect(202);
    const processing = ctx.app.get(PaymentProcessingService);
    await processing.submit(paid.body.paymentId);
    const p = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paid.body.paymentId } });
    const ev = await ctx.app.get(PaymentEventsService).ingest({
      provider: 'mock',
      providerEventId: `evt-${p.id}`,
      providerPaymentId: p.providerPaymentId!,
      paymentId: p.id,
      type: 'payment.succeeded',
      source: 'SIMULATED',
      payload: {},
    });
    await processing.applyEvent(ev.paymentEventId!);
    const booking = await ctx.prisma.booking.findUniqueOrThrow({ where: { reference } });
    expect(booking.status).toBe('CONFIRMED');
    return { a, reference, booking };
  }

  describe('e-tickets', () => {
    it('generates once: snapshot in MongoDB, PDF in storage, ticket ISSUED, TicketIssued event', async () => {
      const { a, reference, booking } = await confirmedBooking();
      expect(await tickets.generate(booking.id)).toBe('ISSUED');
      expect(await tickets.generate(booking.id)).toBe('ALREADY_ISSUED');

      const ticket = await ctx.prisma.ticket.findFirstOrThrow({ where: { bookingId: booking.id } });
      expect(ticket).toMatchObject({ status: 'ISSUED', storageKey: `tickets/${reference}/v1.pdf` });
      expect(ticket.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(
        await mongo.collection('ticket_snapshots').countDocuments({ bookingId: booking.id }),
      ).toBe(1);
      expect(await ctx.prisma.outboxEvent.count({ where: { eventType: 'TicketIssued' } })).toBe(1);

      const view = await a.agent
        .get(`/api/v1/bookings/${reference}/ticket`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(view.headers['content-type']).toBe('application/pdf');
      expect(view.headers['content-disposition']).toBe(`inline; filename="FlyGo-${reference}.pdf"`);
      expect(view.headers['cache-control']).toBe('private, no-store');
      expect((view.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const dl = await a.agent.get(`/api/v1/bookings/${reference}/ticket/download`).expect(200);
      expect(dl.headers['content-disposition']).toBe(
        `attachment; filename="FlyGo-${reference}.pdf"`,
      );
    });

    it('answers 409 TICKET_NOT_READY with Retry-After while the ticket is being prepared', async () => {
      const { a, reference } = await confirmedBooking();
      const res = await a.agent.get(`/api/v1/bookings/${reference}/ticket`).expect(409);
      expect(res.body.code).toBe('TICKET_NOT_READY');
      expect(res.headers['retry-after']).toBe('3');
    });

    it('rebuilds a lost PDF byte-for-byte from its snapshot', async () => {
      const { a, reference, booking } = await confirmedBooking();
      await tickets.generate(booking.id);
      const ticket = await ctx.prisma.ticket.findFirstOrThrow({ where: { bookingId: booking.id } });
      await unlink(join(process.env.TICKET_STORAGE_DIR!, ticket.storageKey!));

      const res = await a.agent
        .get(`/api/v1/bookings/${reference}/ticket/download`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const { createHash } = await import('node:crypto');
      expect(
        createHash('sha256')
          .update(res.body as Buffer)
          .digest('hex'),
      ).toBe(ticket.sha256);
    });

    it('never serves another traveller’s ticket', async () => {
      const { reference, booking } = await confirmedBooking('Asha');
      await tickets.generate(booking.id);
      const b = await signedInAgent(ctx.app, 'Bilal');
      await b.agent.get(`/api/v1/bookings/${reference}/ticket`).expect(404);
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/bookings/${reference}/ticket`)
        .expect(401);
    });
  });

  describe('confirmation email', () => {
    const build = (transport: EmailTransport) =>
      new EmailService(ctx.prisma, emailRepo, transport, ctx.app.get(AppConfig));

    it('sends once to Mailpit and records the delivery; repeats are no-ops', async () => {
      const { booking, reference } = await confirmedBooking();
      const { SmtpEmailTransport } = await import('../../src/modules/email/smtp-email.transport');
      const transport = new SmtpEmailTransport(ctx.app.get(AppConfig));
      const svc = build(transport);

      expect(await svc.sendBookingConfirmation(booking.id)).toBe('SENT');
      expect(await svc.sendBookingConfirmation(booking.id)).toBe('ALREADY_SENT');
      transport.onModuleDestroy();

      const doc = await mongo.collection('email_messages').findOne({ bookingId: booking.id });
      expect(doc).toMatchObject({ status: 'SENT', to: 'asha@example.com' });
      expect(doc!.attempts).toHaveLength(1);

      const found = await mailpitSearch(reference);
      expect(found.messages_count).toBe(1);
      const msg = await mailpitMessage(found.messages[0]!.ID);
      expect(msg.Text).toContain(`/bookings/${reference}`);
      expect(msg.Text).toContain('XI101');
    });

    it('records a transient failure, schedules a retry, then succeeds without duplicating', async () => {
      const { booking } = await confirmedBooking();
      const failing: EmailTransport = {
        send: () => Promise.reject(new Error('connect ECONNREFUSED')),
      };
      await expect(build(failing).sendBookingConfirmation(booking.id)).rejects.toThrow(
        'ECONNREFUSED',
      );
      let doc = await mongo.collection('email_messages').findOne({ bookingId: booking.id });
      expect(doc).toMatchObject({ status: 'RETRY_SCHEDULED' });
      expect(doc!.attempts[0]).toMatchObject({ outcome: 'TRANSIENT_ERROR' });

      const ok: EmailTransport = { send: () => Promise.resolve({ providerMessageId: 'm-1' }) };
      expect(await build(ok).sendBookingConfirmation(booking.id)).toBe('SENT');
      doc = await mongo.collection('email_messages').findOne({ bookingId: booking.id });
      expect(doc).toMatchObject({ status: 'SENT', providerMessageId: 'm-1' });
      expect(doc!.attempts.map((x: { outcome: string }) => x.outcome)).toEqual([
        'TRANSIENT_ERROR',
        'SENT',
      ]);
      expect(await mongo.collection('email_messages').countDocuments()).toBe(1);
    });

    it('marks the email FAILED on the last allowed attempt', async () => {
      const { booking } = await confirmedBooking();
      const failing: EmailTransport = { send: () => Promise.reject(new Error('timeout')) };
      await expect(build(failing).sendBookingConfirmation(booking.id, true)).rejects.toThrow();
      expect(
        await mongo.collection('email_messages').findOne({ bookingId: booking.id }),
      ).toMatchObject({ status: 'FAILED' });
    });
  });

  describe('in-app notifications', () => {
    it('creates one notification per event and lets only the owner read and dismiss it', async () => {
      const { a, reference, booking } = await confirmedBooking('Asha');
      const svc = ctx.app.get(NotificationsService);
      const event = {
        type: 'BOOKING_CONFIRMED' as const,
        eventId: 'evt-1',
        userId: booking.userId,
        reference,
      };
      expect(await svc.create(event)).toBe(true);
      expect(await svc.create(event)).toBe(false); // replayed event → no duplicate
      await svc.create({ ...event, type: 'TICKET_READY', eventId: 'evt-2' });

      const list = await a.agent.get('/api/v1/notifications').expect(200);
      expect(list.body.unreadCount).toBe(2);
      expect(list.body.data.map((n: { type: string }) => n.type)).toEqual([
        'TICKET_READY',
        'BOOKING_CONFIRMED',
      ]);
      const id = list.body.data[0].id as string;

      const b = await signedInAgent(ctx.app, 'Bilal');
      await b.agent
        .patch(`/api/v1/notifications/${id}/read`)
        .set('X-CSRF-Token', b.csrf)
        .set('Origin', 'http://localhost:5173')
        .expect(404);
      expect((await b.agent.get('/api/v1/notifications').expect(200)).body.data).toEqual([]);

      await a.agent
        .patch(`/api/v1/notifications/${id}/read`)
        .set('X-CSRF-Token', a.csrf)
        .set('Origin', 'http://localhost:5173')
        .expect(204);
      await a.agent
        .patch('/api/v1/notifications/not-an-id/read')
        .set('X-CSRF-Token', a.csrf)
        .set('Origin', 'http://localhost:5173')
        .expect(404);
      expect(
        (await a.agent.get('/api/v1/notifications?unreadOnly=true').expect(200)).body.unreadCount,
      ).toBe(1);
      await a.post('/api/v1/notifications/read-all').expect(204);
      expect((await a.agent.get('/api/v1/notifications').expect(200)).body.unreadCount).toBe(0);
    });
  });

  it('fans BookingConfirmed out to separate ticket, email and notification jobs', async () => {
    await confirmedBooking();
    await ctx.app.get(OutboxRelayService).relayPending();
    const event = await ctx.prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'BookingConfirmed' },
    });
    expect(event.status).toBe('PUBLISHED');
    const job = (q: string, name: string) =>
      ctx.app.get<Queue>(getQueueToken(q)).getJob(`${event.id}-${name}`);
    expect(await job(QueueName.Tickets, 'generate-ticket')).toBeDefined();
    expect(await job(QueueName.Email, 'send-booking-confirmation')).toBeDefined();
    expect((await job(QueueName.Notifications, 'create-notification'))?.data).toMatchObject({
      notificationType: 'BOOKING_CONFIRMED',
    });
  });
});
