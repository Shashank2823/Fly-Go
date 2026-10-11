import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/bootstrap/configure-app';
import { PrismaService } from '../../../src/database/prisma.service';
import { REDIS_CLIENT } from '../../../src/infrastructure/redis/redis.module';

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  redis: Redis;
}

/** Boots the real AppModule with the production HTTP pipeline against test resources. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), redis: app.get(REDIS_CLIENT) };
}

/** A cookie-keeping client that fetches and sends the CSRF token like the SPA does. */
export async function browserAgent(app: NestExpressApplication) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.get('/api/v1/auth/csrf').expect(200);
  let csrf = (res.body as { csrfToken: string }).csrfToken;
  return {
    agent,
    get csrf() {
      return csrf;
    },
    set csrf(token: string) {
      csrf = token;
    },
    post: (url: string, body?: object) =>
      agent.post(url).set('X-CSRF-Token', csrf).set('Origin', 'http://localhost:5173').send(body),
  };
}

export const flushTestRedis = (redis: Redis) => redis.flushdb(); // logical DB 15 only
