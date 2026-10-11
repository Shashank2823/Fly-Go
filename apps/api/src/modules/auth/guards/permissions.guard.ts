import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../../common/auth/decorators';
import type { Permission } from '../../../common/auth/permissions';
import { AppError } from '../../../common/errors/app-error';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user)
      throw new AppError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Please sign in to continue');
    if (!required.every((p) => user.permissions.includes(p))) {
      throw new AppError(
        'FORBIDDEN',
        HttpStatus.FORBIDDEN,
        'You do not have access to this resource',
      );
    }
    return true;
  }
}
