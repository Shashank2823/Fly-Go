import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Points every connection at isolated test resources before any app code loads:
 * the `flygo_test` database and Redis logical DB 15. Never the development data.
 */
export function applyTestEnv(): void {
  const rootEnv = resolve(__dirname, '../../../../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('DATABASE_URL missing — run npm run env:init');
  const testUrl = new URL(devUrl);
  testUrl.pathname = '/flygo_test';

  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'warn';
  process.env.DATABASE_URL = testUrl.toString();
  process.env.REDIS_DB = '15';
}
