import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MarketsModule } from '../markets/markets.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { PasswordHasher } from './password/password-hasher';
import { RateLimiterService } from './rate-limit/rate-limiter.service';

/**
 * Global guard order matters: identify the caller → throttle (per-user policies need the
 * caller) → CSRF → permissions.
 */
@Module({
  imports: [UsersModule, MarketsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    RateLimiterService,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
