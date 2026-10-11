import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { LoggingModule } from './common/logging/logging.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { MongoModule } from './database/mongo.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AirportsModule } from './modules/airports/airports.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { FlightsModule } from './modules/flights/flights.module';
import { HealthModule } from './modules/health/health.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { SeatInventoryModule } from './modules/seat-inventory/seat-inventory.module';
import { QueuesModule } from './queues/queues.module';

/** Root module of the HTTP API process. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    MongoModule,
    RedisModule,
    CacheModule,
    QueuesModule,
    AuditModule,
    OutboxModule,
    AuthModule,
    ReferenceModule,
    AirportsModule,
    FlightsModule,
    SeatInventoryModule,
    BookingsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
