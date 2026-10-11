import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { CORRELATION_HEADER } from '../../common/http/correlation-id.middleware';
import type { UserWithRoles } from '../users/users.repository';
import { AuthService } from './auth.service';
import { AuthResponse, CsrfResponse, MeResponse } from './dto/auth-responses';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RateLimit } from './rate-limit/rate-limit';
import {
  destroySession,
  newCsrfToken,
  regenerateSession,
  saveSession,
} from './session/session.utils';

const correlationId = (req: Request) => req.headers[CORRELATION_HEADER] as string;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Issues (or returns) the CSRF token for this browser session. */
  @Public()
  @Get('csrf')
  async csrf(@Req() req: Request): Promise<CsrfResponse> {
    if (!req.session.csrfToken) {
      req.session.csrfToken = newCsrfToken();
      await saveSession(req);
    }
    return { csrfToken: req.session.csrfToken };
  }

  @Public()
  @Post('register')
  @RateLimit({ name: 'auth.register', limit: 5, windowSeconds: 3600, by: 'ip' })
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResponse> {
    const user = await this.auth.register(dto, correlationId(req));
    return this.startSession(req, user);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(
    { name: 'auth.login.account', limit: 5, windowSeconds: 60, by: 'ip+email' },
    { name: 'auth.login.ip', limit: 20, windowSeconds: 60, by: 'ip' },
  )
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    const user = await this.auth.verifyCredentials(dto, correlationId(req));
    return this.startSession(req, user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.recordLogout(user.id, correlationId(req));
    await destroySession(req, res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.auth.toMe(user);
  }

  /** New session id on every login (fixation defence) with a fresh CSRF token. */
  private async startSession(req: Request, user: UserWithRoles): Promise<AuthResponse> {
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.sessionVersion = user.sessionVersion;
    req.session.authenticatedAt = Date.now();
    req.session.csrfToken = newCsrfToken();
    await saveSession(req);
    return { user: await this.auth.toMe(user), csrfToken: req.session.csrfToken };
  }
}
