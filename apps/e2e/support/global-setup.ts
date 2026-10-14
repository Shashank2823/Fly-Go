import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { Client } from 'pg';
import { e2eEnv, ROOT } from './env';

/** Seeded flights must reach at least this far ahead for the specs' search dates. */
const MIN_SEEDED_DAYS = 10;

/**
 * Prepares the isolated E2E resources (flygo_e2e only):
 *  1. applies migrations, and seeds reference data + flights when missing or running out;
 *  2. removes every customer, booking and payment left by earlier runs, releasing their seats;
 *  3. clears sessions and rate-limit counters (the worker's job schedulers are left running —
 *     Playwright starts the web servers before this setup).
 */
export default async function globalSetup(): Promise<void> {
  const env = { ...process.env, ...e2eEnv() };
  const apiDir = join(ROOT, 'apps/api');
  execSync('npx prisma migrate deploy', { cwd: apiDir, env, stdio: 'pipe' });

  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();
  try {
    const { rows } = await pg.query<{ enough: boolean }>(
      `SELECT coalesce(max(departure_at) > now() + make_interval(days => $1), false) AS enough
         FROM flights`,
      [MIN_SEEDED_DAYS],
    );
    if (!rows[0]?.enough) {
      console.log('[e2e] Seeding flygo_e2e (first run takes ~30 s)…');
      execSync('npx prisma db seed', { cwd: apiDir, env, stdio: 'pipe' });
    }

    await pg.query('BEGIN');
    await pg.query(`UPDATE flight_seats SET status = 'AVAILABLE', booking_id = NULL,
                      hold_expires_at = NULL WHERE booking_id IS NOT NULL`);
    for (const table of [
      'payment_events',
      'tickets',
      'payments',
      'booking_price_lines',
      'booking_seats',
      'booking_passengers',
      'bookings',
      'outbox_events',
      'audit_logs',
      'idempotency_keys',
      'password_reset_tokens',
      'user_roles',
      'users',
    ]) {
      await pg.query(`DELETE FROM ${table}`);
    }
    await pg.query('COMMIT');
  } finally {
    await pg.end();
  }

  const mongo = new MongoClient(env.MONGODB_URI!);
  try {
    const db = mongo.db(env.MONGODB_DB);
    for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
      await db.collection(c.name).deleteMany({});
    }
  } finally {
    await mongo.close();
  }

  const redis = new Redis({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD || undefined,
    db: Number(env.REDIS_DB),
  });
  try {
    for (const pattern of ['flygo:sess:*', 'flygo:rl:*']) {
      for await (const keys of redis.scanStream({ match: pattern, count: 500 })) {
        if ((keys as string[]).length) await redis.del(...(keys as string[]));
      }
    }
  } finally {
    redis.disconnect();
  }

  rmSync(env.TICKET_STORAGE_DIR!, { recursive: true, force: true });
}
