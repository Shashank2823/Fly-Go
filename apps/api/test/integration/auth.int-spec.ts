import request from 'supertest';
import { resetDatabase } from './support/fixtures';
import { browserAgent, createTestApp, flushTestRedis, type TestContext } from './support/test-app';

const VALID = {
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  password: 'monsoon-chai-at-dawn',
  nationality: 'IN',
  phone: '+919876543210',
};

const sessionCookie = (res: request.Response) =>
  ([res.headers['set-cookie']].flat().filter(Boolean) as string[]).find((c) =>
    c.startsWith('fg_sid='),
  );

describe('Authentication (sessions + CSRF + rate limits)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await flushTestRedis(ctx.redis);
  });

  describe('CSRF', () => {
    it('rejects state-changing requests without a CSRF token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(VALID)
        .expect(403);
      expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('rejects a token from a different session', async () => {
      const a = await browserAgent(ctx.app);
      const b = await browserAgent(ctx.app);
      const res = await a.agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', b.csrf)
        .send(VALID)
        .expect(403);
      expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('rejects a foreign Origin even with a valid token', async () => {
      const a = await browserAgent(ctx.app);
      await a.agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', a.csrf)
        .set('Origin', 'https://evil.example')
        .send(VALID)
        .expect(403);
    });
  });

  describe('registration', () => {
    it('creates a USER, starts a session and resolves the INR market', async () => {
      const b = await browserAgent(ctx.app);
      const res = await b.post('/api/v1/auth/register', VALID).expect(201);
      expect(res.body.user).toMatchObject({
        email: 'asha@example.com',
        roles: ['USER'],
        market: { code: 'IN', currency: 'INR' },
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('id');

      const me = await b.agent.get('/api/v1/auth/me').expect(200);
      expect(me.body.fullName).toBe('Asha Verma');

      const user = await ctx.prisma.user.findFirstOrThrow();
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: 'USER_REGISTERED', entityId: user.id },
        }),
      ).toBe(1);
    });

    it('treats emails case-insensitively for duplicates', async () => {
      await (await browserAgent(ctx.app)).post('/api/v1/auth/register', VALID).expect(201);
      const res = await (
        await browserAgent(ctx.app)
      )
        .post('/api/v1/auth/register', { ...VALID, email: 'ASHA@Example.com' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('rejects common passwords', async () => {
      const res = await (
        await browserAgent(ctx.app)
      )
        .post('/api/v1/auth/register', { ...VALID, password: 'password123' })
        .expect(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');
    });

    it('refuses role injection through the payload', async () => {
      const res = await (
        await browserAgent(ctx.app)
      )
        .post('/api/v1/auth/register', { ...VALID, roles: ['ADMIN'] })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('validates nationality against ISO country codes', async () => {
      await (
        await browserAgent(ctx.app)
      )
        .post('/api/v1/auth/register', { ...VALID, nationality: 'ZZ' })
        .expect(400);
    });
  });

  describe('login and logout', () => {
    beforeEach(async () => {
      await (await browserAgent(ctx.app)).post('/api/v1/auth/register', VALID).expect(201);
      await flushTestRedis(ctx.redis);
    });

    it('issues a new session id on login (session fixation defence)', async () => {
      const b = await browserAgent(ctx.app);
      const before = await b.agent.get('/api/v1/auth/csrf');
      const anonCookie = sessionCookie(before);
      const res = await b
        .post('/api/v1/auth/login', { email: VALID.email, password: VALID.password })
        .expect(200);
      const authCookie = sessionCookie(res);
      expect(authCookie).toBeDefined();
      expect(authCookie).not.toEqual(anonCookie);
      expect(res.body.csrfToken).not.toEqual(b.csrf);
    });

    it('returns the same generic error for a wrong password and an unknown email', async () => {
      const b = await browserAgent(ctx.app);
      const wrong = await b
        .post('/api/v1/auth/login', { email: VALID.email, password: 'not-the-password' })
        .expect(401);
      const unknown = await b
        .post('/api/v1/auth/login', { email: 'nobody@example.com', password: 'whatever-123' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.title).toEqual(unknown.body.title);
    });

    it('ends the session on logout', async () => {
      const b = await browserAgent(ctx.app);
      const login = await b
        .post('/api/v1/auth/login', { email: VALID.email, password: VALID.password })
        .expect(200);
      b.csrf = login.body.csrfToken;
      await b.agent.get('/api/v1/auth/me').expect(200);
      await b.post('/api/v1/auth/logout').expect(204);
      const me = await b.agent.get('/api/v1/auth/me').expect(401);
      expect(me.body.code).toBe('UNAUTHENTICATED');
    });

    it('invalidates existing sessions when the session version changes', async () => {
      const b = await browserAgent(ctx.app);
      await b
        .post('/api/v1/auth/login', { email: VALID.email, password: VALID.password })
        .expect(200);
      await ctx.prisma.user.updateMany({ data: { sessionVersion: { increment: 1 } } });
      await b.agent.get('/api/v1/auth/me').expect(401);
    });

    it('rejects disabled accounts', async () => {
      await ctx.prisma.user.updateMany({ data: { status: 'DISABLED' } });
      const res = await (
        await browserAgent(ctx.app)
      )
        .post('/api/v1/auth/login', { email: VALID.email, password: VALID.password })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('rate-limits repeated login attempts for one account', async () => {
      const b = await browserAgent(ctx.app);
      for (let i = 0; i < 5; i++) {
        await b
          .post('/api/v1/auth/login', { email: VALID.email, password: 'wrong-password-x' })
          .expect(401);
      }
      const res = await b
        .post('/api/v1/auth/login', { email: VALID.email, password: VALID.password })
        .expect(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('authorization', () => {
    it('requires a session for /auth/me', async () => {
      await request(ctx.app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('hides queue internals from anonymous users and customers', async () => {
      await request(ctx.app.getHttpServer()).get('/api/v1/health/workers').expect(401);
      const b = await browserAgent(ctx.app);
      await b.post('/api/v1/auth/register', VALID).expect(201);
      const res = await b.agent.get('/api/v1/health/workers').expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('keeps readiness public', async () => {
      await request(ctx.app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    });
  });
});
