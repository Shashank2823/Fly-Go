import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();

/**
 * Single source of truth for runtime configuration. The process refuses to start
 * when anything is missing or malformed (fail fast, docs §17).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_PORT: port.default(3000),
  WEB_ORIGIN: z.url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_IDLE_MINUTES: positiveInt.default(30),
  SESSION_ABSOLUTE_HOURS: positiveInt.default(168),

  DATABASE_URL: z.url().startsWith('postgresql://'),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port,
  REDIS_PASSWORD: z.string().min(1),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),

  MONGODB_URI: z.url().startsWith('mongodb://'),
  MONGODB_DB: z.string().min(1),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: port,
  MAIL_FROM: z.string().min(3),

  HOLD_TTL_SECONDS: positiveInt.default(600),
  PAYMENT_HOLD_TTL_SECONDS: positiveInt.default(900),

  PAYMENTS_PROVIDER: z.enum(['mock']).default('mock'),

  /** Where ticket PDFs are stored by the local file storage (relative paths are from the repo root). */
  TICKET_STORAGE_DIR: z.string().min(1).default('var/tickets'),
  MOCK_PAYMENT_DELAY_MS: z.coerce.number().int().min(0).default(1500),
  /** Development/test only: force the mock gateway's outcome. */
  MOCK_PAYMENT_OUTCOME: z.enum(['success', 'fail']).default('success'),
});

export type Env = z.infer<typeof envSchema>;
