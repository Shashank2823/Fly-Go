import type { PrismaClient } from '../../src/generated/prisma/client';

/** Stable role IDs: referenced by code constants, never renumber. */
export const ROLE_SEED = [
  { id: 1, code: 'USER', name: 'Customer' },
  { id: 2, code: 'SUPPORT', name: 'Support agent' },
  { id: 3, code: 'ADMIN', name: 'Administrator' },
] as const;

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of ROLE_SEED) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: { code: role.code, name: role.name },
    });
  }
  console.log(`Seeded ${ROLE_SEED.length} roles.`);
}
