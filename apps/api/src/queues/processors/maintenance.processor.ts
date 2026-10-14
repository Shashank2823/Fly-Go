import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { OutboxRelayService } from '../../modules/outbox/outbox-relay.service';
import { PaymentReconciliationService } from '../../modules/payments/payment-reconciliation.service';
import { HoldExpiryService } from '../../modules/seat-inventory/hold-expiry.service';
import { DeliveryReconciliationService } from '../reconciliation/delivery-reconciliation.service';
import { MaintenanceJob, QueueName, WORKER_HEARTBEAT_KEY } from '../queue-names';

/**
 * Maintenance queue: low-concurrency periodic jobs. Processors stay thin — real work
 * (hold expiry, reconciliation) will delegate to domain services in later phases.
 */
@Processor(QueueName.Maintenance, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly holdExpiry: HoldExpiryService,
    private readonly outboxRelay: OutboxRelayService,
    private readonly reconciliation: PaymentReconciliationService,
    private readonly delivery: DeliveryReconciliationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case MaintenanceJob.WorkerHeartbeat:
        // Written by a job (not a timer) so it proves the whole scheduler → queue → worker path.
        await this.redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), 'EX', 120);
        // verbose (pino "trace"): every 10 s is too chatty for debug logs.
        this.logger.verbose({ jobId: job.id }, 'heartbeat');
        return;
      case MaintenanceJob.ExpireHolds: {
        const expired = await this.holdExpiry.expireAbandonedHolds();
        await job.updateProgress({ expired });
        return;
      }
      case MaintenanceJob.OutboxRelay:
        await this.outboxRelay.relayPending();
        return;
      case MaintenanceJob.ReconcilePayments:
        await this.reconciliation.reconcile();
        return;
      case MaintenanceJob.ReconcileTickets:
        await this.delivery.reconcileTickets();
        return;
      case MaintenanceJob.RetryEmails:
        await this.delivery.retryEmails();
        return;
      default:
        throw new UnrecoverableError(`Unknown maintenance job: ${job.name}`);
    }
  }
}
