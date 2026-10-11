import { Injectable } from '@nestjs/common';
import type { Tx } from '../../database/transaction-runner';
import type { Prisma } from '../../generated/prisma/client';

export interface OutboxMessage {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  /** IDs and references only — never PII (docs §12.1). */
  payload: Prisma.InputJsonObject;
  correlationId?: string | null;
}

/**
 * Transactional outbox writer. Requires the caller's transaction so the event commits
 * atomically with the business change. The relay that publishes events to BullMQ lands in
 * Phase 6; until then events accumulate durably as PENDING.
 */
@Injectable()
export class OutboxService {
  async add(tx: Tx, message: OutboxMessage): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: message.payload,
        correlationId: message.correlationId ?? null,
      },
    });
  }
}
