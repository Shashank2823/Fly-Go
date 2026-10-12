import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { MongoModule } from './database/mongo.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SeatInventoryModule } from './modules/seat-inventory/seat-inventory.module';
import { MaintenanceProcessor } from './queues/processors/maintenance.processor';
import { PaymentsProcessor } from './queues/processors/payments.processor';
import { QueuesModule } from './queues/queues.module';
import { MaintenanceScheduler } from './queues/schedulers/maintenance.scheduler';

/**
 * Root module of the worker process: same domain modules as the API, no HTTP layer,
 * plus queue processors and job schedulers.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    MongoModule,
    RedisModule,
    QueuesModule,
    AuditModule,
    OutboxModule,
    SeatInventoryModule,
    PaymentsModule,
  ],
  providers: [MaintenanceProcessor, PaymentsProcessor, MaintenanceScheduler],
})
export class WorkerModule {}
