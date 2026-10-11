import type { RequestHandler } from 'express';
import session from 'express-session';
import type Redis from 'ioredis';
import type { AppConfig } from '../../../config/app-config';
import { RedisSessionStore } from './redis-session.store';

export const SESSION_COOKIE = 'fg_sid';

/** Cookie-based server-side sessions (docs §8.1–8.2). */
export function createSessionMiddleware(config: AppConfig, redis: Redis): RequestHandler {
  const idleMs = config.get('SESSION_IDLE_MINUTES') * 60_000;
  return session({
    name: SESSION_COOKIE,
    secret: config.get('SESSION_SECRET'),
    store: new RedisSessionStore(redis, idleMs / 1000),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: idleMs,
    },
  });
}
