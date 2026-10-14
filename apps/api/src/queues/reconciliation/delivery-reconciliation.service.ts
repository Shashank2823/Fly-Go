import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { EmailMessagesRepository } from '../../modules/email/email-messages.repository';
import { EmailService } from '../../modules/email/email.service';
import { EmailJob, QueueName, TicketsJob } from '../queue-names';

const TICKET_GRACE_MS = 2 * 60_000;
const EMAIL_GRACE_MS = 10 * 60_000;
const EMAIL_LOOKBACK_MS = 7 * 24 * 3600_000;
const MAX_EMAIL_ATTEMPTS = 20;

/**
 * Re-derives lost or failed work from the authoritative stores (docs §12.3): PostgreSQL says
 * which bookings are confirmed, so any confirmed booking without an issued ticket, or without
 * a SENT confirmation email, gets its job enqueued again. Queues are never trusted as durable.
 */
@Injectable()
export class DeliveryReconciliationService {
  private readonly logger = new Logger(DeliveryReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailMessagesRepository,
    @InjectQueue(QueueName.Tickets) private readonly tickets: Queue,
    @InjectQueue(QueueName.Email) private readonly email: Queue,
  ) {}

  async reconcileTickets(): Promise<number> {
    const now = Date.now();
    const stuck = await this.prisma.ticket.findMany({
      where: {
        booking: { status: 'CONFIRMED' },
        createdAt: { lt: new Date(now - TICKET_GRACE_MS) },
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'GENERATING', updatedAt: { lt: new Date(now - TICKET_GRACE_MS) } },
        ],
      },
      select: { id: true, bookingId: true },
      take: 200,
    });
    const bucket = Math.floor(now / (5 * 60_000));
    for (const t of stuck) {
      await this.tickets.add(
        TicketsJob.GenerateTicket,
        { bookingId: t.bookingId },
        { jobId: `reconcile-ticket-${t.id}-${bucket}` },
      );
    }
    if (stuck.length) this.logger.warn({ count: stuck.length }, 'Re-queued ticket generation');
    return stuck.length;
  }

  async retryEmails(): Promise<number> {
    const now = Date.now();
    const confirmed = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        confirmedAt: { gt: new Date(now - EMAIL_LOOKBACK_MS), lt: new Date(now - EMAIL_GRACE_MS) },
      },
      select: { id: true, reference: true },
      take: 500,
    });
    if (!confirmed.length) return 0;
    const sent = await this.emails.sentBookingIds(confirmed.map((b) => b.id));
    const bucket = Math.floor(now / (10 * 60_000));
    let queued = 0;
    for (const b of confirmed.filter((x) => !sent.has(x.id))) {
      const doc = await this.emails.findByDedupeKey(EmailService.confirmationKey(b.reference));
      if (doc && doc.attempts.length >= MAX_EMAIL_ATTEMPTS) continue; // give up; stays visible as FAILED
      await this.email.add(
        EmailJob.SendBookingConfirmation,
        { bookingId: b.id },
        { jobId: `reconcile-email-${b.id}-${bucket}` },
      );
      queued++;
    }
    if (queued) this.logger.warn({ count: queued }, 'Re-queued confirmation emails');
    return queued;
  }
}
