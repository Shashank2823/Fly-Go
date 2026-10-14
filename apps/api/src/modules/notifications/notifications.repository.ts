import { Inject, Injectable } from '@nestjs/common';
import { type Db, ObjectId } from 'mongodb';
import { Collections, type NotificationDoc } from '../../database/mongo/collections';
import { MONGO_DB } from '../../database/mongo.tokens';

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  private get col() {
    return this.db.collection<NotificationDoc>(Collections.Notifications);
  }

  /** Insert-once by dedupeKey: replays of the same event never create a second notification. */
  async createOnce(doc: Omit<NotificationDoc, '_id'>): Promise<boolean> {
    const res = await this.col.updateOne(
      { dedupeKey: doc.dedupeKey },
      { $setOnInsert: doc },
      { upsert: true },
    );
    return res.upsertedCount === 1;
  }

  /** Every query is scoped by userId — another user's notification is indistinguishable from none. */
  async listForUser(userId: string, opts: { unreadOnly: boolean; skip: number; limit: number }) {
    const filter = { userId, ...(opts.unreadOnly ? { read: false } : {}) };
    const [items, total, unread] = await Promise.all([
      this.col
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(opts.skip)
        .limit(opts.limit)
        .toArray(),
      this.col.countDocuments(filter),
      this.col.countDocuments({ userId, read: false }),
    ]);
    return { items, total, unread };
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const res = await this.col.updateOne({ _id: new ObjectId(id), userId }, [
      { $set: { read: true, readAt: { $ifNull: ['$readAt', '$$NOW'] } } },
    ]);
    return res.matchedCount === 1;
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.col.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    return res.modifiedCount;
  }
}
