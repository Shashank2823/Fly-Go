import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Accepts a well-formed inbound X-Request-Id (e.g. from a proxy) or generates one,
 * and echoes it on the response. Registered before every other middleware so the
 * logger and request context both see the same id.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[CORRELATION_HEADER];
  const id = typeof inbound === 'string' && SAFE_ID.test(inbound) ? inbound : randomUUID();
  req.headers[CORRELATION_HEADER] = id;
  res.setHeader('X-Request-Id', id);
  next();
}
