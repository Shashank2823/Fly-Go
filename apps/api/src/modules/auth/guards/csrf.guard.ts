import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { SKIP_CSRF_KEY } from '../../../common/auth/decorators';
import { AppError } from '../../../common/errors/app-error';
import { AppConfig } from '../../../config/app-config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sameToken = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Synchronizer-token CSRF protection plus an Origin allow-list (docs §8.2), layered on top
 * of SameSite=Lax cookies. Applies to every state-changing request, including login.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [ctx.getHandler(), ctx.getClass()])
    ) {
      return true;
    }

    const origin = req.headers.origin;
    if (origin && origin !== this.config.get('WEB_ORIGIN')) throw this.reject();

    const header = req.headers['x-csrf-token'];
    const expected = (req.session as typeof req.session | undefined)?.csrfToken;
    if (typeof header !== 'string' || !expected || !sameToken(header, expected))
      throw this.reject();
    return true;
  }

  private reject() {
    return new AppError(
      'CSRF_TOKEN_INVALID',
      HttpStatus.FORBIDDEN,
      'Your session security token is missing or expired. Please retry.',
    );
  }
}
