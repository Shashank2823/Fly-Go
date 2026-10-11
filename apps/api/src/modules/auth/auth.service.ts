import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { permissionsFor, ROLE_IDS, RoleCode } from '../../common/auth/permissions';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation, TransactionRunner } from '../../database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { MarketsService } from '../markets/markets.service';
import { UsersRepository, type UserWithRoles } from '../users/users.repository';
import type { MeResponse } from './dto/auth-responses';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordHasher } from './password/password-hasher';
import { passwordProblem } from './password/password-policy';

const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Incorrect email or password');

/**
 * Account registration and credential verification. Session issuance is the controller's
 * job (HTTP concern); this service never sees cookies or tokens.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditService,
    private readonly markets: MarketsService,
  ) {}

  async register(dto: RegisterDto, correlationId: string): Promise<UserWithRoles> {
    const problem = passwordProblem(dto.password, dto.email);
    if (problem) {
      throw new AppError('WEAK_PASSWORD', HttpStatus.BAD_REQUEST, problem, undefined, [
        { field: 'password', message: problem },
      ]);
    }

    // Hash outside any transaction: Argon2 is deliberately slow.
    const passwordHash = await this.hasher.hash(dto.password);
    try {
      return await this.tx.run(async (tx) => {
        const user = await this.users.create(
          {
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            phone: dto.phone ?? null,
            nationality: dto.nationality,
            roleId: ROLE_IDS[RoleCode.User],
          },
          tx,
        );
        await this.audit.record(
          {
            actorUserId: user.id,
            actorType: 'USER',
            action: 'USER_REGISTERED',
            entityType: 'user',
            entityId: user.id,
            correlationId,
          },
          tx,
        );
        return user;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(
          'EMAIL_TAKEN',
          HttpStatus.CONFLICT,
          'An account with this email already exists',
          undefined,
          [{ field: 'email', message: 'An account with this email already exists' }],
        );
      }
      throw err;
    }
  }

  async verifyCredentials(dto: LoginDto, correlationId: string): Promise<UserWithRoles> {
    const user = await this.users.findByEmail(dto.email);
    // Always run a verification so unknown emails take as long as wrong passwords.
    const ok = await this.hasher.verify(user?.passwordHash ?? null, dto.password);
    if (!user || !ok) throw invalidCredentials();
    if (user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_DISABLED', HttpStatus.FORBIDDEN, 'This account is not active');
    }

    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(dto.password));
      this.logger.log({ userId: user.id }, 'Password hash upgraded');
    }

    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'USER_LOGGED_IN',
      entityType: 'user',
      entityId: user.id,
      correlationId,
    });
    return user;
  }

  async recordLogout(userId: string, correlationId: string): Promise<void> {
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      action: 'USER_LOGGED_OUT',
      entityType: 'user',
      entityId: userId,
      correlationId,
    });
  }

  async toMe(
    user: Pick<AuthenticatedUser, 'fullName' | 'email' | 'phone' | 'nationality' | 'roles'>,
  ): Promise<MeResponse> {
    const market = await this.markets.resolve(user.nationality);
    return {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      nationality: user.nationality,
      roles: user.roles,
      permissions: permissionsFor(user.roles),
      market,
    };
  }
}
