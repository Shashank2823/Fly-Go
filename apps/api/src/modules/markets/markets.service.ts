import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { CabinClass, FeeRule } from '../../generated/prisma/client';
import type { PricingRule } from '../pricing/price-calculator';

export interface ResolvedMarket {
  code: string;
  currency: string;
}

const CACHE_TTL_MS = 60_000;

/**
 * Nationality → pricing market (docs §23). Market configuration changes rarely, so it is
 * cached in-process for a minute; prices themselves are always computed from PostgreSQL rows.
 */
@Injectable()
export class MarketsService {
  private cache: {
    loadedAt: number;
    defaultMarket: ResolvedMarket;
    byCountry: Map<string, ResolvedMarket>;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(nationality: string | null | undefined): Promise<ResolvedMarket> {
    const data = await this.load();
    return (nationality && data.byCountry.get(nationality)) || data.defaultMarket;
  }

  /** Fee rules active at `at` for a market, as calculator input. */
  async activeRules(marketCode: string, at: Date = new Date()): Promise<PricingRule[]> {
    const rules: FeeRule[] = await this.prisma.feeRule.findMany({
      where: {
        marketCode,
        activeFrom: { lte: at },
        OR: [{ activeTo: null }, { activeTo: { gt: at } }],
      },
      orderBy: { code: 'asc' },
    });
    return rules.map((r) => ({
      code: r.code,
      name: r.name,
      kind: r.kind,
      seatKind: r.seatKind,
      value: r.value,
    }));
  }

  /** Base fare for a flight/cabin in a market, or null if not on sale there. */
  fareFor(flightId: string, cabin: CabinClass, marketCode: string) {
    return this.prisma.flightFare.findUnique({
      where: { flightId_cabin_marketCode: { flightId, cabin, marketCode } },
    });
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) return this.cache;
    const markets = await this.prisma.market.findMany({ include: { countries: true } });
    const def = markets.find((m) => m.isDefault);
    if (!def) throw new Error('No default market configured — run the seed.');
    const byCountry = new Map<string, ResolvedMarket>();
    for (const m of markets) {
      for (const c of m.countries)
        byCountry.set(c.countryCode, { code: m.code, currency: m.currency });
    }
    this.cache = {
      loadedAt: Date.now(),
      defaultMarket: { code: def.code, currency: def.currency },
      byCountry,
    };
    return this.cache;
  }
}
