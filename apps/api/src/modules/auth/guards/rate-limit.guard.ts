import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppError } from '../../../common/errors/app-error';
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_KEY, type RateLimitPolicy } from '../rate-limit/rate-limit';
import { RateLimiterService } from '../rate-limit/rate-limiter.service';

/** Runs after SessionAuthGuard so per-user policies can key on the authenticated user. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const policies = this.reflector.getAllAndOverride<RateLimitPolicy[] | undefined>(
      RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    ) ?? [DEFAULT_RATE_LIMIT];
    if (policies.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    for (const policy of policies) {
      const result = await this.limiter.consume(
        policy.name,
        this.subject(req, policy),
        policy.limit,
        policy.windowSeconds,
      );
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new AppError(
          'TOO_MANY_REQUESTS',
          HttpStatus.TOO_MANY_REQUESTS,
          'Too many requests. Please wait and try again.',
          { retryAfterSeconds: result.retryAfterSeconds },
        );
      }
    }
    return true;
  }

  private subject(req: Request, policy: RateLimitPolicy): string {
    const ip = req.ip ?? 'unknown';
    switch (policy.by) {
      case 'user':
        return req.user ? `user:${req.user.id}` : `ip:${ip}`;
      case 'ip+email': {
        const body = req.body as { email?: unknown } | undefined;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        return `ip:${ip}|email:${email}`;
      }
      default:
        return `ip:${ip}`;
    }
  }
}
