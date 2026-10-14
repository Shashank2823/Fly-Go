import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { QUEUE_PREFIX, QueueName } from './queue-names';

/**
 * Shared queue registration used by both processes: the API produces jobs and reads
 * queue health; only the WorkerModule registers processors.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        prefix: QUEUE_PREFIX,
        // BullMQ requires maxRetriesPerRequest: null for blocking worker connections.
        connection: { ...config.redisConnection, maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 24 * 3600, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QueueName.Maintenance },
      {
        name: QueueName.Payments,
        // Money-moving work: more patience before giving up (≈ 8 min of retries).
        defaultJobOptions: {
          attempts: 8,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 24 * 3600, count: 5_000 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      },
      {
        name: QueueName.Tickets,
        defaultJobOptions: {
          attempts: 6,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 24 * 3600, count: 2_000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QueueName.Email,
        defaultJobOptions: {
          attempts: 8,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { age: 24 * 3600, count: 2_000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QueueName.Notifications,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 24 * 3600, count: 2_000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
