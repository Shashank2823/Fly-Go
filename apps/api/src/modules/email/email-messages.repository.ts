import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import {
  Collections,
  type EmailAttempt,
  type EmailMessageDoc,
} from '../../database/mongo/collections';
import { MONGO_DB } from '../../database/mongo.tokens';

const SEND_LOCK_MS = 60_000;

@Injectable()
export class EmailMessagesRepository {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  private get col() {
    return this.db.collection<EmailMessageDoc>(Collections.EmailMessages);
  }

  /** Creates the logical message once (unique dedupeKey); later calls return the existing one. */
  async ensure(doc: Omit<EmailMessageDoc, '_id'>): Promise<EmailMessageDoc> {
    const stored = await this.col.findOneAndUpdate(
      { dedupeKey: doc.dedupeKey },
      { $setOnInsert: doc },
      { upsert: true, returnDocument: 'after' },
    );
    return stored!;
  }

  /**
   * Atomically takes the right to send: only a message that is not SENT and not currently
   * being sent by someone else (lock expired) can be claimed.
   */
  claim(dedupeKey: string, now: Date) {
    return this.col.findOneAndUpdate(
      {
        dedupeKey,
        status: { $ne: 'SENT' },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
      },
      {
        $set: {
          status: 'SENDING',
          lockedUntil: new Date(now.getTime() + SEND_LOCK_MS),
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async markSent(dedupeKey: string, attempt: EmailAttempt): Promise<void> {
    await this.col.updateOne(
      { dedupeKey },
      {
        $set: {
          status: 'SENT',
          sentAt: attempt.at,
          providerMessageId: attempt.providerMessageId ?? null,
          lockedUntil: null,
          updatedAt: attempt.at,
        },
        $push: { attempts: attempt },
      },
    );
  }

  async markFailedAttempt(dedupeKey: string, attempt: EmailAttempt, final: boolean): Promise<void> {
    await this.col.updateOne(
      { dedupeKey },
      {
        $set: {
          status: final ? 'FAILED' : 'RETRY_SCHEDULED',
          lockedUntil: null,
          updatedAt: attempt.at,
        },
        $push: { attempts: attempt },
      },
    );
  }

  findByDedupeKey(dedupeKey: string) {
    return this.col.findOne({ dedupeKey });
  }

  /** Booking ids that already have a confirmation email recorded as SENT. */
  async sentBookingIds(bookingIds: string[]): Promise<Set<string>> {
    const rows = await this.col
      .find(
        { bookingId: { $in: bookingIds }, type: 'BOOKING_CONFIRMATION', status: 'SENT' },
        { projection: { bookingId: 1 } },
      )
      .toArray();
    return new Set(rows.map((r) => r.bookingId));
  }
}
