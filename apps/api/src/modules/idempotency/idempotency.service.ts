import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../database/prisma.service';
import { TransactionRunner, type Tx } from '../../database/transaction-runner';
import type { Prisma } from '../../generated/prisma/client';

const LOCK_MS = 30_000;
const RETAIN_MS = 24 * 3_600_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** True when the stored response of an earlier identical request was returned. */
  replayed: boolean;
}

export function assertIdempotencyKey(key: string | undefined): string {
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError(
      'IDEMPOTENCY_KEY_REQUIRED',
      HttpStatus.BAD_REQUEST,
      'An Idempotency-Key header (8–64 characters: letters, digits, "-" or "_") is required',
    );
  }
  return key;
}

/** Stable hash of a request body (sorted keys) used to detect key reuse with different input. */
export function requestHash(body: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
}

/**
 * DB-backed request deduplication (docs §11). The key row is claimed before the work, and
 * completed in the SAME transaction as the business change — so a stored response exists
 * exactly when the effect committed. Failed requests release the key so the client may retry.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionRunner,
  ) {}

  async run<T extends Prisma.InputJsonValue>(
    params: { userId: string; scope: string; key: string; hash: string; successStatus: number },
    work: (tx: Tx) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const { userId, scope, key, hash } = params;
    const claimed = await this.claim(userId, scope, key, hash);
    if (!claimed.claimed) return claimed.replay as IdempotentResult<T>;

    try {
      const body = await this.tx.run(async (tx) => {
        const result = await work(tx);
        await tx.idempotencyKey.update({
          where: { id: claimed.id },
          data: { status: 'COMPLETED', responseStatus: params.successStatus, responseBody: result },
        });
        return result;
      });
      return { status: params.successStatus, body, replayed: false };
    } catch (err) {
      await this.prisma.idempotencyKey.deleteMany({
        where: { id: claimed.id, status: 'IN_PROGRESS' },
      });
      throw err;
    }
  }

  private async claim(
    userId: string,
    scope: string,
    key: string,
    hash: string,
  ): Promise<
    { claimed: true; id: string } | { claimed: false; replay: IdempotentResult<unknown> }
  > {
    const now = new Date();
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO idempotency_keys (id, user_id, scope, key, request_hash, status, locked_until, expires_at)
      VALUES (gen_random_uuid(), ${userId}::uuid, ${scope}, ${key}, ${hash}, 'IN_PROGRESS',
              ${new Date(now.getTime() + LOCK_MS)}, ${new Date(now.getTime() + RETAIN_MS)})
      ON CONFLICT (user_id, scope, key) DO NOTHING
      RETURNING id`;
    if (inserted[0]) return { claimed: true, id: inserted[0].id };

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope, key } },
    });
    if (!existing) return this.claim(userId, scope, key, hash); // released between our statements
    if (existing.requestHash !== hash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (existing.status === 'COMPLETED') {
      return {
        claimed: false,
        replay: {
          status: existing.responseStatus ?? 200,
          body: existing.responseBody,
          replayed: true,
        },
      };
    }
    // IN_PROGRESS: take over only if the previous holder's lock lapsed (it crashed).
    const takeover = await this.prisma.idempotencyKey.updateMany({
      where: { id: existing.id, status: 'IN_PROGRESS', lockedUntil: { lt: now } },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (takeover.count === 1) return { claimed: true, id: existing.id };
    throw new AppError(
      'REQUEST_IN_PROGRESS',
      HttpStatus.CONFLICT,
      'An identical request is still being processed',
    );
  }
}
