import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/auth/decorators';
import { permissionsFor } from '../../../common/auth/permissions';
import { AppError } from '../../../common/errors/app-error';
import { AppConfig } from '../../../config/app-config';
import { UsersRepository } from '../../users/users.repository';

/**
 * Resolves the caller from the server-side session on every request (docs §8.3). The user,
 * status and roles are re-read from PostgreSQL so revocations apply immediately; sessions
 * past the absolute lifetime or with a stale sessionVersion are discarded.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersRepository,
    private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    await this.resolveUser(req);
    if (isPublic || req.user) return true;
    throw new AppError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Please sign in to continue');
  }

  private async resolveUser(req: Request): Promise<void> {
    const s = req.session as typeof req.session | undefined;
    if (!s?.userId) return;

    const maxAgeMs = this.config.get('SESSION_ABSOLUTE_HOURS') * 3_600_000;
    const tooOld = !s.authenticatedAt || Date.now() - s.authenticatedAt > maxAgeMs;
    const user = tooOld ? null : await this.users.findActiveById(s.userId);

    if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== s.sessionVersion) {
      // Drop the identity but keep the session (and its CSRF token) usable as anonymous.
      delete s.userId;
      delete s.sessionVersion;
      delete s.authenticatedAt;
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      nationality: user.nationality,
      roles: user.roles,
      permissions: permissionsFor(user.roles),
    };
  }
}
