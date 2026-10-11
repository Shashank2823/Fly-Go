import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Short-lived JSON cache in Redis. Cached data is informational only — never consulted for
 * holds, pricing at checkout or booking decisions (docs §7). Cache failures degrade to a miss.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  static key(namespace: string, parts: unknown): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url')
      .slice(0, 32);
    return `cache:${namespace}:${digest}`;
  }

  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Cache read failed');
    }
    const value = await load();
    this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((err: Error) => {
      this.logger.warn({ err: err.message }, 'Cache write failed');
    });
    return value;
  }
}
