import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Db } from '../../database/transaction-runner';
import type { UserStatus } from '../../generated/prisma/client';

export interface UserWithRoles {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  nationality: string;
  status: UserStatus;
  sessionVersion: number;
  roles: string[];
}

const withRoles = { roles: { select: { role: { select: { code: true } } } } } as const;

type UserRow = Omit<UserWithRoles, 'roles'> & { roles: { role: { code: string } }[] };

const toUser = (row: UserRow): UserWithRoles => ({
  id: row.id,
  email: row.email,
  passwordHash: row.passwordHash,
  fullName: row.fullName,
  phone: row.phone,
  nationality: row.nationality,
  status: row.status,
  sessionVersion: row.sessionVersion,
  roles: row.roles.map((r) => r.role.code),
});

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithRoles | null> {
    const row = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: withRoles,
    });
    return row ? toUser(row) : null;
  }

  async findActiveById(id: string): Promise<UserWithRoles | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: withRoles,
    });
    return row ? toUser(row) : null;
  }

  async create(
    data: {
      email: string;
      passwordHash: string;
      fullName: string;
      phone: string | null;
      nationality: string;
      roleId: number;
    },
    db: Db = this.prisma,
  ): Promise<UserWithRoles> {
    const row = await db.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        phone: data.phone,
        nationality: data.nationality,
        roles: { create: { roleId: data.roleId } },
      },
      include: withRoles,
    });
    return toUser(row);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
