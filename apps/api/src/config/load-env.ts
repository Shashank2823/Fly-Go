import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { type Env, envSchema } from './env.schema';

/**
 * Loads the repo-root .env in local development (production injects real env vars),
 * then validates. Values already present in process.env take precedence.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env && process.env.NODE_ENV !== 'production') {
    const rootEnv = resolve(__dirname, '../../../../.env');
    if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Report variable names and reasons only, never values.
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENTS_PROVIDER === 'mock') {
    throw new Error('PAYMENTS_PROVIDER=mock is not allowed in production.');
  }
  return parsed.data;
}
