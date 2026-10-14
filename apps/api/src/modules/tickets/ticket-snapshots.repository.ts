import { Inject, Injectable } from '@nestjs/common';
import { type Db, ObjectId } from 'mongodb';
import { Collections, type TicketSnapshotDoc } from '../../database/mongo/collections';
import { MONGO_DB } from '../../database/mongo.tokens';

@Injectable()
export class TicketSnapshotsRepository {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  private get col() {
    return this.db.collection<TicketSnapshotDoc>(Collections.TicketSnapshots);
  }

  /**
   * Insert-once: the first snapshot for (bookingId, version) wins and is returned on every
   * retry, so a re-rendered PDF is always built from exactly what was first captured.
   */
  async upsertOnce(doc: TicketSnapshotDoc): Promise<TicketSnapshotDoc & { _id: ObjectId }> {
    const stored = await this.col.findOneAndUpdate(
      { bookingId: doc.bookingId, version: doc.version },
      { $setOnInsert: doc },
      { upsert: true, returnDocument: 'after' },
    );
    return stored as TicketSnapshotDoc & { _id: ObjectId };
  }

  findById(id: string) {
    return ObjectId.isValid(id)
      ? this.col.findOne({ _id: new ObjectId(id) })
      : Promise.resolve(null);
  }
}
