import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { QueuesModule } from '../../queues/queues.module';
import { HealthController } from './health.controller';
import { HealthIndicators } from './health.indicators';

@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: 'pretty' }), QueuesModule],
  controllers: [HealthController],
  providers: [HealthIndicators],
})
export class HealthModule {}
