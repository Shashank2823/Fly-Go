import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { TransactionRunner } from '../../database/transaction-runner';
import { QueueName } from '../../queues/queue-names';
import { OUTBOX_ROUTES } from './outbox-routes';

const BATCH = 100;
const MAX_ATTEMPTS = 20;

interface PendingEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  attempts: number;
}

/**
 * Transactional-outbox relay (docs §12.1): publishes committed domain events to BullMQ.
 * At-least-once — the deterministic jobId `<eventId>-<job>` lets BullMQ drop duplicates, and
 * every handler is idempotent anyway. SKIP LOCKED makes concurrent relays safe.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    private readonly tx: TransactionRunner,
    @InjectQueue(QueueName.Maintenance) maintenance: Queue,
    @InjectQueue(QueueName.Payments) payments: Queue,
    @InjectQueue(QueueName.Tickets) tickets: Queue,
    @InjectQueue(QueueName.Email) email: Queue,
    @InjectQueue(QueueName.Notifications) notifications: Queue,
  ) {
    this.queues = {
      [QueueName.Maintenance]: maintenance,
      [QueueName.Payments]: payments,
      [QueueName.Tickets]: tickets,
      [QueueName.Email]: email,
      [QueueName.Notifications]: notifications,
    };
  }

  async relayPending(): Promise<number> {
    return this.tx.run(async (tx) => {
      const events = await tx.$queryRaw<PendingEvent[]>`
        SELECT id, event_type, payload, correlation_id, attempts
        FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;

      for (const e of events) {
        try {
          for (const route of OUTBOX_ROUTES[e.event_type] ?? []) {
            await this.queues[route.queue].add(
              route.job,
              { ...e.payload, ...route.data, eventId: e.id, correlationId: e.correlation_id },
              { jobId: `${e.id}-${route.job}` },
            );
          }
          await tx.outboxEvent.update({
            where: { id: e.id },
            data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
          });
        } catch (err) {
          const attempts = e.attempts + 1;
          const message = err instanceof Error ? err.message : String(err);
          await tx.outboxEvent.update({
            where: { id: e.id },
            data: {
              attempts,
              lastError: message.slice(0, 500),
              status: attempts >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING',
              availableAt: new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts)),
            },
          });
          this.logger.error(
            { eventId: e.id, eventType: e.event_type, attempts, err: message },
            'Outbox publish failed',
          );
        }
      }
      return events.length;
    });
  }
}
