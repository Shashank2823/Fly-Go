import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient;
/** Either the root client or a transaction — repositories accept both. */
export type Db = PrismaService | Tx;

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']); // serialization failure, deadlock
const MAX_ATTEMPTS = 3;

function sqlState(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as
      { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
    return meta?.driverAdapterError?.cause?.originalCode ?? meta?.code;
  }
  return undefined;
}

/**
 * Owns transaction boundaries (docs §9.1): READ COMMITTED plus explicit row locks, short
 * timeouts, and bounded retries with jitter for deadlocks/serialization failures.
 * External calls (email, payment providers) must never run inside `fn`.
 */
@Injectable()
export class TransactionRunner {
  private readonly logger = new Logger(TransactionRunner.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 2_000,
          timeout: 5_000,
        });
      } catch (err) {
        const state = sqlState(err);
        if (!state || !RETRYABLE_SQLSTATES.has(state) || attempt >= MAX_ATTEMPTS) throw err;
        const delay = 20 * 2 ** attempt + Math.floor(Math.random() * 30);
        this.logger.warn({ sqlState: state, attempt, delay }, 'Retrying transaction');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}

/** True when `err` is a unique-constraint violation (optionally on a specific target). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
