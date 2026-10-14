import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../../..');
export const API_PORT = 3100;
export const WEB_PORT = 5180;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const MAILPIT_URL = 'http://localhost:8025';

/**
 * Environment for the API and worker under test. Everything points at isolated E2E
 * resources — the `flygo_e2e` database, Mongo `flygo_e2e` and Redis logical DB 14 — so a run
 * never touches development data or the integration-test database.
 */
export function e2eEnv(): Record<string, string> {
  const rootEnv = join(ROOT, '.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('DATABASE_URL missing — run npm run env:init');
  const dbUrl = new URL(devUrl);
  dbUrl.pathname = '/flygo_e2e';

  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    API_PORT: String(API_PORT),
    WEB_ORIGIN: WEB_URL,
    DATABASE_URL: dbUrl.toString(),
    REDIS_DB: '14',
    MONGODB_DB: 'flygo_e2e',
    MOCK_PAYMENT_OUTCOME: 'success',
    MOCK_PAYMENT_DELAY_MS: '1500',
    TICKET_STORAGE_DIR: join(tmpdir(), 'flygo-e2e-tickets'),
  };
}
