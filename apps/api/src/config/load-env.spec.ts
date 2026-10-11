import { loadEnv } from './load-env';

const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgresql://u:p@localhost:5432/flygo',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: 'secret',
  MONGODB_URI: 'mongodb://u:p@localhost:27017/flygo',
  MONGODB_DB: 'flygo',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'FlyGo <no-reply@flygo.local>',
});

describe('loadEnv', () => {
  it('parses and coerces a valid environment with defaults', () => {
    const env = loadEnv(validEnv());
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.HOLD_TTL_SECONDS).toBe(600);
    expect(env.PAYMENTS_PROVIDER).toBe('mock');
  });

  it('rejects a short session secret without echoing its value', () => {
    const env = { ...validEnv(), SESSION_SECRET: 'tooshort-secret-value' };
    expect(() => loadEnv(env)).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv(env)).not.toThrow(/tooshort-secret-value/);
  });

  it('rejects missing required variables', () => {
    const env = validEnv();
    delete env.DATABASE_URL;
    expect(() => loadEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('refuses the mock payment provider in production', () => {
    expect(() => loadEnv({ ...validEnv(), NODE_ENV: 'production' })).toThrow(/mock/);
  });
});
