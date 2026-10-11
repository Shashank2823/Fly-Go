import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';

const jsonResponse = (status: number, body: unknown, type = 'application/problem+json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('ApiError.fromResponse', () => {
  it('parses problem+json bodies including field errors and meta', async () => {
    const err = await ApiError.fromResponse(
      jsonResponse(409, {
        type: 'https://flygo.dev/errors/seats-unavailable',
        title: 'Seats unavailable',
        status: 409,
        code: 'SEATS_UNAVAILABLE',
        traceId: 't-1',
        meta: { unavailable: ['12B'] },
      }),
    );
    expect(err.code).toBe('SEATS_UNAVAILABLE');
    expect(err.status).toBe(409);
    expect(err.meta).toEqual({ unavailable: ['12B'] });
    expect(err.errors).toEqual([]);
  });

  it('falls back to a safe generic error for non-JSON 5xx responses', async () => {
    const res = new Response('<html>Bad gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html', 'x-request-id': 'abc' },
    });
    const err = await ApiError.fromResponse(res);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.message).not.toContain('html');
    expect(err.traceId).toBe('abc');
  });
});
