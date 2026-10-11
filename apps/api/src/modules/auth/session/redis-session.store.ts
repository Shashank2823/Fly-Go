import { Store, type SessionData } from 'express-session';
import type Redis from 'ioredis';

const KEY_PREFIX = 'sess:';

/**
 * express-session store backed by our shared ioredis connection (docs §8.2). Sessions carry
 * no PII — only the user id, session version, auth timestamp and CSRF token — and expire
 * with the cookie's idle timeout.
 */
export class RedisSessionStore extends Store {
  constructor(
    private readonly redis: Redis,
    private readonly idleTtlSeconds: number,
  ) {
    super();
  }

  private ttl(sess: SessionData): number {
    const maxAge = sess.cookie?.maxAge;
    return typeof maxAge === 'number' ? Math.max(1, Math.ceil(maxAge / 1000)) : this.idleTtlSeconds;
  }

  override get(sid: string, cb: (err: unknown, session?: SessionData | null) => void): void {
    this.redis
      .get(KEY_PREFIX + sid)
      .then((raw) => cb(null, raw ? (JSON.parse(raw) as SessionData) : null))
      .catch(cb);
  }

  override set(sid: string, sess: SessionData, cb?: (err?: unknown) => void): void {
    this.redis
      .set(KEY_PREFIX + sid, JSON.stringify(sess), 'EX', this.ttl(sess))
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }

  override touch(sid: string, sess: SessionData, cb?: (err?: unknown) => void): void {
    this.redis
      .expire(KEY_PREFIX + sid, this.ttl(sess))
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.redis
      .del(KEY_PREFIX + sid)
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }
}
