import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counters in Redis (INCR + EXPIRE NX in one MULTI). Subjects are hashed so
 * emails and IPs never appear in Redis keys.
 */
@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(
    name: string,
    subject: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const digest = createHash('sha256').update(subject).digest('base64url').slice(0, 22);
    const key = `rl:${name}:${digest}:${window}`;
    const results = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const windowEnds = (window + 1) * windowSeconds;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, windowEnds - Math.floor(Date.now() / 1000)),
    };
  }
}
