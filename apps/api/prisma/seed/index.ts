import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { seedFlights } from './flights';
import { seedMarkets } from './markets';
import { seedReferenceData } from './reference';
import { seedRoles } from './roles';

/** Idempotent development seed. Safe to re-run; later runs add flights for new dates. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await seedRoles(prisma);
    await seedMarkets(prisma);
    await seedReferenceData(prisma);
    await seedFlights(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
