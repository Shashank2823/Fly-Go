import type { PrismaClient } from '../../src/generated/prisma/client';

const RULES_FROM = new Date('2026-01-01T00:00:00Z');

/** v1: one India market priced in INR; every nationality falls back to it (docs §23). */
export async function seedMarkets(prisma: PrismaClient): Promise<void> {
  await prisma.market.upsert({
    where: { code: 'IN' },
    create: { code: 'IN', name: 'India', currency: 'INR', isDefault: true },
    update: { name: 'India', currency: 'INR', isDefault: true },
  });
  await prisma.marketCountry.upsert({
    where: { countryCode: 'IN' },
    create: { countryCode: 'IN', marketCode: 'IN' },
    update: { marketCode: 'IN' },
  });

  const rules = [
    { code: 'GST', name: 'Taxes (7.5%)', kind: 'PERCENT_OF_BASE_BPS', seatKind: null, value: 750n },
    {
      code: 'CONVENIENCE_FEE',
      name: 'Convenience fee',
      kind: 'FIXED_PER_PASSENGER',
      seatKind: null,
      value: 45_000n,
    },
    {
      code: 'SEAT_EXTRA_LEGROOM',
      name: 'Extra legroom seat',
      kind: 'SEAT_KIND_SURCHARGE',
      seatKind: 'EXTRA_LEGROOM',
      value: 200_000n,
    },
    {
      code: 'SEAT_EXIT_ROW',
      name: 'Exit row seat',
      kind: 'SEAT_KIND_SURCHARGE',
      seatKind: 'EXIT_ROW',
      value: 120_000n,
    },
  ] as const;
  for (const r of rules) {
    await prisma.feeRule.upsert({
      where: {
        marketCode_code_activeFrom: { marketCode: 'IN', code: r.code, activeFrom: RULES_FROM },
      },
      create: { marketCode: 'IN', activeFrom: RULES_FROM, ...r },
      update: { name: r.name, kind: r.kind, seatKind: r.seatKind, value: r.value },
    });
  }
  console.log(`Seeded market IN (INR) with ${rules.length} fee rules.`);
}
