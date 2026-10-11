import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { SkipRateLimit } from '../auth/rate-limit/rate-limit';
import { HealthIndicators } from './health.indicators';

@ApiTags('health')
@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicators,
  ) {}

  /** Liveness: the process is up and the event loop responds. No dependency checks. */
  @Public()
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Readiness: the API can serve traffic (all request-path dependencies reachable). */
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.indicators.postgres(),
      () => this.indicators.redisPing(),
      () => this.indicators.mongoPing(),
    ]);
  }

  /**
   * Asynchronous processing health. Kept separate from readiness: a stopped worker
   * delays emails/tickets but must not take the API out of rotation.
   * Exposes queue internals, so it requires the `queue:inspect` permission.
   */
  @RequirePermissions(Permission.QueueInspect)
  @Get('workers')
  @HealthCheck()
  workers() {
    return this.health.check([
      () => this.indicators.workerHeartbeat(),
      () => this.indicators.queues(),
      () => this.indicators.smtp(),
    ]);
  }
}
