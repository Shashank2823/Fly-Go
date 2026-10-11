import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { SESSION_COOKIE } from './session.middleware';

const asError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

export const newCsrfToken = () => randomBytes(32).toString('base64url');

/** Issues a fresh session id (prevents session fixation) — call on login/registration. */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err: unknown) => (err ? reject(asError(err)) : resolve())),
  );
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.save((err: unknown) => (err ? reject(asError(err)) : resolve())),
  );
}

export function destroySession(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.destroy((err: unknown) => {
      res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax' });
      return err ? reject(asError(err)) : resolve();
    }),
  );
}
