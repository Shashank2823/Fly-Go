import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../../config/app-config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * General-purpose Redis connection (cache, rate limiting, sessions, heartbeats).
 * BullMQ manages its own connections (see QueuesModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis({
          ...config.redisConnection,
          keyPrefix: 'flygo:',
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        });
        const logger = new Logger('RedisModule');
        client.on('ready', () => logger.log('Redis connected'));
        client.on('error', (err: Error) => logger.error(`Redis error: ${err.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
