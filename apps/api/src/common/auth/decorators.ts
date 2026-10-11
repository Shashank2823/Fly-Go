import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';
import type { Permission } from './permissions';

export const IS_PUBLIC_KEY = 'auth:public';
export const SKIP_CSRF_KEY = 'auth:skipCsrf';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Route needs no session. The user is still resolved when a session exists (e.g. for pricing market). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exempt from CSRF checks — only for signature-verified machine endpoints (webhooks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

/** Caller must hold every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated user (undefined on public routes without a session). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<Request>().user,
);
