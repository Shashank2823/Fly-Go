import { defineConfig, devices } from '@playwright/test';
import { API_PORT, e2eEnv, ROOT, WEB_PORT, WEB_URL } from './support/env';

const env = e2eEnv();

/**
 * Full-stack browser tests: Chromium → Vite dev server (:5180) → API (:3100) → worker, all
 * pointed at isolated E2E resources (see support/env.ts). Ports differ from the dev
 * defaults, so a running `npm run dev:*` setup is left alone. `npm run test:e2e` builds the
 * API first; the servers run from that build.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // keep failures honest; registration is rate-limited to 5 per hour per IP
  workers: 4,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'node apps/api/dist/main.js',
      cwd: ROOT,
      env,
      url: `http://localhost:${API_PORT}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'worker',
      command: 'node apps/api/dist/worker.js',
      cwd: ROOT,
      env,
      // No HTTP port: Playwright just launches it (it is connected long before the web server
      // has finished starting) and stops it after the run.
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: 'npm run dev -w @flygo/web',
      cwd: ROOT,
      env: { WEB_PORT: String(WEB_PORT), API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
