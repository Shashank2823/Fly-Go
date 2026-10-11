import { SetMetadata } from '@nestjs/common';

export type RateLimitSubject = 'ip' | 'user' | 'ip+email';

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  by: RateLimitSubject;
}

export const RATE_LIMIT_KEY = 'rate-limit:policies';

/** Applied to every route unless it declares its own policies. */
export const DEFAULT_RATE_LIMIT: RateLimitPolicy = {
  name: 'global',
  limit: 120,
  windowSeconds: 60,
  by: 'ip',
};

export const RateLimit = (...policies: RateLimitPolicy[]) => SetMetadata(RATE_LIMIT_KEY, policies);
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_KEY, []);
