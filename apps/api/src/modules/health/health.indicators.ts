import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { Db } from 'mongodb';
import { connect } from 'node:net';
import { AppConfig } from '../../config/app-config';
import { MONGO_DB } from '../../database/mongo.tokens';
import { PrismaService } from '../../database/prisma.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import {
  QueueName,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_MS,
} from '../../queues/queue-names';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'unknown error');

/** Readiness probes for every dependency. Failures report a short reason, never credentials. */
@Injectable()
export class HealthIndicators {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(MONGO_DB) private readonly mongo: Db,
    @InjectQueue(QueueName.Maintenance) private readonly maintenanceQueue: Queue,
    @InjectQueue(QueueName.Payments) private readonly paymentsQueue: Queue,
    @InjectQueue(QueueName.Tickets) private readonly ticketsQueue: Queue,
    @InjectQueue(QueueName.Email) private readonly emailQueue: Queue,
    @InjectQueue(QueueName.Notifications) private readonly notificationsQueue: Queue,
    private readonly config: AppConfig,
  ) {}

  async postgres() {
    const check = this.health.check('postgres');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return check.up();
    } catch (err) {
      return check.down(errorMessage(err));
    }
  }

  async redisPing() {
    const check = this.health.check('redis');
    try {
      return (await this.redis.ping()) === 'PONG' ? check.up() : check.down('unexpected reply');
    } catch (err) {
      return check.down(errorMessage(err));
    }
  }

  async mongoPing() {
    const check = this.health.check('mongodb');
    try {
      await this.mongo.command({ ping: 1 });
      return check.up();
    } catch (err) {
      return check.down(errorMessage(err));
    }
  }

  async smtp() {
    const check = this.health.check('smtp');
    const host = this.config.get('SMTP_HOST');
    const port = this.config.get('SMTP_PORT');
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = connect({ host, port, timeout: 2_000 });
      socket.once('connect', () => (socket.end(), resolve(true)));
      socket.once('timeout', () => (socket.destroy(), resolve(false)));
      socket.once('error', () => resolve(false));
    });
    return reachable ? check.up() : check.down('SMTP server unreachable');
  }

  async workerHeartbeat() {
    const check = this.health.check('worker');
    const raw = await this.redis.get(WORKER_HEARTBEAT_KEY);
    if (!raw) return check.down({ message: 'no heartbeat recorded' });
    const ageMs = Date.now() - new Date(raw).getTime();
    return ageMs <= WORKER_HEARTBEAT_STALE_MS
      ? check.up({ lastHeartbeat: raw, ageMs })
      : check.down({ message: 'heartbeat stale', lastHeartbeat: raw, ageMs });
  }

  async queues() {
    const check = this.health.check('queues');
    try {
      const states = ['waiting', 'active', 'delayed', 'failed'] as const;
      const queues = {
        [QueueName.Maintenance]: this.maintenanceQueue,
        [QueueName.Payments]: this.paymentsQueue,
        [QueueName.Tickets]: this.ticketsQueue,
        [QueueName.Email]: this.emailQueue,
        [QueueName.Notifications]: this.notificationsQueue,
      };
      const counts = Object.fromEntries(
        await Promise.all(
          Object.entries(queues).map(
            async ([name, q]) => [name, await q.getJobCounts(...states)] as const,
          ),
        ),
      );
      const outbox = await this.prisma.outboxEvent.groupBy({
        by: ['status'],
        _count: true,
        where: { status: { in: ['PENDING', 'DEAD'] } },
      });
      return check.up({
        ...counts,
        outbox: Object.fromEntries(outbox.map((o) => [o.status, o._count])),
      });
    } catch (err) {
      return check.down(errorMessage(err));
    }
  }
}
