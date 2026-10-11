import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { applyTestEnv } from './test-env';

/** Brings the test database schema up to date once per run. */
export default function globalSetup(): void {
  applyTestEnv();
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../../..'),
    env: process.env,
    stdio: 'pipe',
  });
}
