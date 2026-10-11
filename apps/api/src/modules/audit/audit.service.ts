import { Injectable } from '@nestjs/common';
import type { ActorType, Prisma } from '../../generated/prisma/client';
import type { Db } from '../../database/transaction-runner';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry {
  actorUserId: string | null;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  correlationId?: string | null;
}

/**
 * Business audit trail in PostgreSQL. Pass the transaction client so the audit row commits
 * (or rolls back) atomically with the change it describes. Never record secrets or PII.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before,
        after: entry.after,
        correlationId: entry.correlationId ?? null,
      },
    });
  }
}
