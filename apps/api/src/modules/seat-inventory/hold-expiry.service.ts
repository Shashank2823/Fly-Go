import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { SeatInventoryRepository } from './seat-inventory.repository';

const BATCH_SIZE = 200;
const MAX_BATCHES_PER_RUN = 10;

/**
 * Expires abandoned holds (docs §9.4). Seat maps already treat expired holds as free; this
 * sweep makes the booking state explicit, frees the rows and emits BookingExpired.
 */
@Injectable()
export class HoldExpiryService {
  private readonly logger = new Logger(HoldExpiryService.name);

  constructor(
    private readonly tx: TransactionRunner,
    private readonly seats: SeatInventoryRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async expireAbandonedHolds(): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const expired = await this.tx.run(async (tx) => {
        const rows = await this.seats.expireBatch(tx, BATCH_SIZE);
        for (const b of rows) {
          await this.audit.record(
            {
              actorUserId: null,
              actorType: 'SYSTEM',
              action: 'BOOKING_EXPIRED',
              entityType: 'booking',
              entityId: b.id,
              after: { status: 'EXPIRED', reason: 'HOLD_TIMEOUT' },
            },
            tx,
          );
          await this.outbox.add(tx, {
            aggregateType: 'booking',
            aggregateId: b.id,
            eventType: 'BookingExpired',
            payload: { bookingId: b.id, reference: b.reference, userId: b.user_id },
          });
        }
        return rows.length;
      });
      total += expired;
      if (expired < BATCH_SIZE) break;
    }
    if (total > 0) this.logger.log({ expired: total }, 'Expired abandoned seat holds');
    return total;
  }
}
