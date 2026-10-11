import type { Env } from './env.schema';

/** Typed, read-only configuration injected wherever settings are needed. */
export class AppConfig {
  constructor(private readonly env: Env) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get redisConnection(): { host: string; port: number; password: string; db: number } {
    return {
      host: this.env.REDIS_HOST,
      port: this.env.REDIS_PORT,
      password: this.env.REDIS_PASSWORD,
      db: this.env.REDIS_DB,
    };
  }
}
