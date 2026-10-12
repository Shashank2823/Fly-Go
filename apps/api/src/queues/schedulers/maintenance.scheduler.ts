import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MaintenanceJob, QueueName } from '../queue-names';

/**
 * Declares repeatable maintenance jobs using BullMQ Job Schedulers (bullmq >= 5.16).
 * upsertJobScheduler is idempotent, so every worker replica can call it on boot.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(QueueName.Maintenance) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      MaintenanceJob.WorkerHeartbeat,
      { every: 10_000 },
      { name: MaintenanceJob.WorkerHeartbeat, opts: { attempts: 1, removeOnComplete: true } },
    );
    await this.queue.upsertJobScheduler(
      MaintenanceJob.ExpireHolds,
      { every: 30_000 },
      { name: MaintenanceJob.ExpireHolds, opts: { attempts: 1, removeOnComplete: true } },
    );
    // Publishes committed domain events (e.g. PaymentRequested) to their queues.
    await this.queue.upsertJobScheduler(
      MaintenanceJob.OutboxRelay,
      { every: 1_000 },
      {
        name: MaintenanceJob.OutboxRelay,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
      },
    );
    await this.queue.upsertJobScheduler(
      MaintenanceJob.ReconcilePayments,
      { every: 120_000 },
      { name: MaintenanceJob.ReconcilePayments, opts: { attempts: 1, removeOnComplete: true } },
    );
    this.logger.log('Maintenance job schedulers registered');
  }
}
