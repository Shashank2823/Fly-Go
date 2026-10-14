import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../mongo.tokens';
import { Collections } from './collections';

const NOTIFICATION_RETENTION_SECONDS = 180 * 24 * 3600;

/**
 * Creates the indexes the application relies on (idempotent; safe on every start). The unique
 * indexes are what make worker upserts exactly-once under at-least-once job delivery.
 */
@Injectable()
export class MongoIndexesService implements OnModuleInit {
  private readonly logger = new Logger(MongoIndexesService.name);

  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async onModuleInit(): Promise<void> {
    await this.db.collection(Collections.TicketSnapshots).createIndexes([
      { key: { bookingId: 1, version: 1 }, name: 'booking_version_ux', unique: true },
      { key: { reference: 1 }, name: 'reference_idx' },
    ]);
    await this.db.collection(Collections.EmailMessages).createIndexes([
      { key: { dedupeKey: 1 }, name: 'dedupe_ux', unique: true },
      { key: { bookingId: 1 }, name: 'booking_idx' },
      { key: { status: 1, updatedAt: 1 }, name: 'status_updated_idx' },
    ]);
    await this.db.collection(Collections.Notifications).createIndexes([
      { key: { dedupeKey: 1 }, name: 'dedupe_ux', unique: true },
      { key: { userId: 1, createdAt: -1 }, name: 'user_feed_idx' },
      { key: { userId: 1, read: 1 }, name: 'user_unread_idx' },
      {
        key: { createdAt: 1 },
        name: 'retention_ttl',
        expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS,
      },
    ]);
    this.logger.log('MongoDB indexes ensured');
  }
}
