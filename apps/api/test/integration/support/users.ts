import { permissionsFor } from '../../../src/common/auth/permissions';
import type { AuthenticatedUser } from '../../../src/common/auth/authenticated-user';
import type { PrismaService } from '../../../src/database/prisma.service';
import { browserAgent } from './test-app';
import type { NestExpressApplication } from '@nestjs/platform-express';

let counter = 0;

/** Creates a customer directly in the database (no password flow) for service-level tests. */
export async function createCustomer(prisma: PrismaService): Promise<AuthenticatedUser> {
  counter++;
  const email = `customer${counter}-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used',
      fullName: `Customer ${counter}`,
      nationality: 'IN',
      roles: { create: { roleId: 1 } },
    },
  });
  return {
    id: user.id,
    email,
    fullName: user.fullName,
    phone: null,
    nationality: 'IN',
    roles: ['USER'],
    permissions: permissionsFor(['USER']),
  };
}

/** Registers through the API and returns a signed-in browser-like agent. */
export async function signedInAgent(app: NestExpressApplication, name: string) {
  const b = await browserAgent(app);
  const res = await b.post('/api/v1/auth/register', {
    fullName: `Traveller ${name}`,
    email: `${name.toLowerCase()}-${Date.now()}@example.com`,
    password: 'monsoon-chai-at-dawn',
    nationality: 'IN',
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  b.csrf = res.body.csrfToken;
  return {
    ...b,
    hold: (body: object, key: string = crypto.randomUUID()) =>
      b.agent
        .post('/api/v1/bookings')
        .set('X-CSRF-Token', b.csrf)
        .set('Origin', 'http://localhost:5173')
        .set('Idempotency-Key', key)
        .send(body),
    del: (url: string) =>
      b.agent.delete(url).set('X-CSRF-Token', b.csrf).set('Origin', 'http://localhost:5173'),
    put: (url: string, body: object) =>
      b.agent
        .put(url)
        .set('X-CSRF-Token', b.csrf)
        .set('Origin', 'http://localhost:5173')
        .send(body),
    pay: (reference: string, priceVersion: number, key: string = crypto.randomUUID()) =>
      b.agent
        .post(`/api/v1/bookings/${reference}/payments`)
        .set('X-CSRF-Token', b.csrf)
        .set('Origin', 'http://localhost:5173')
        .set('Idempotency-Key', key)
        .send({ priceVersion }),
  };
}
