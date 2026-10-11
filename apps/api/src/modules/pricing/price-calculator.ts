import { applyBasisPoints } from '../../common/money/money';
import type {
  FeeRuleKind,
  PassengerType,
  PriceLineKind,
  SeatKind,
} from '../../generated/prisma/client';

/** Infants travel on a lap at a fraction of the base fare (no seat, docs §1.2). */
export const INFANT_BASE_FARE_BPS = 1_000n;

export interface PricingRule {
  code: string;
  name: string;
  kind: FeeRuleKind;
  seatKind: SeatKind | null;
  value: bigint;
}

export interface PricedPassenger {
  ordinal: number;
  type: PassengerType;
  /** Kind of the assigned seat; null for infants or when no seat is chosen yet. */
  seatKind: SeatKind | null;
}

export interface PriceLine {
  kind: PriceLineKind;
  code: string;
  description: string;
  passengerOrdinal: number | null;
  amountMinor: bigint;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  totalMinor: bigint;
}

const passengerLabel = (p: PricedPassenger) => `Passenger ${p.ordinal}`;

/**
 * Deterministic, server-side price calculation (docs §6.6): every amount is a line rounded
 * half-up per passenger, and the total is the sum of the lines so it always matches the
 * itemised receipt. Pure — no I/O — so search, checkout and tests share one implementation.
 */
export function calculatePrice(input: {
  baseFareMinor: bigint;
  rules: PricingRule[];
  passengers: PricedPassenger[];
}): PriceBreakdown {
  const { baseFareMinor, rules, passengers } = input;
  if (baseFareMinor < 0n) throw new RangeError('Base fare must be non-negative');
  if (passengers.length === 0) throw new RangeError('At least one passenger is required');

  const lines: PriceLine[] = [];
  for (const p of [...passengers].sort((a, b) => a.ordinal - b.ordinal)) {
    const base =
      p.type === 'INFANT' ? applyBasisPoints(baseFareMinor, INFANT_BASE_FARE_BPS) : baseFareMinor;
    lines.push({
      kind: 'BASE_FARE',
      code: p.type === 'INFANT' ? 'INFANT_FARE' : 'BASE_FARE',
      description: `${p.type === 'INFANT' ? 'Infant fare' : 'Base fare'} · ${passengerLabel(p)}`,
      passengerOrdinal: p.ordinal,
      amountMinor: base,
    });

    for (const rule of rules) {
      let amount: bigint | null = null;
      let kind: PriceLineKind = 'FEE';
      switch (rule.kind) {
        case 'PERCENT_OF_BASE_BPS':
          amount = applyBasisPoints(base, rule.value);
          kind = 'TAX';
          break;
        case 'FIXED_PER_PASSENGER':
          amount = rule.value;
          break;
        case 'SEAT_KIND_SURCHARGE':
          if (p.seatKind !== null && p.seatKind === rule.seatKind) {
            amount = rule.value;
            kind = 'SEAT_SURCHARGE';
          }
          break;
      }
      if (amount !== null && amount > 0n) {
        lines.push({
          kind,
          code: rule.code,
          description: `${rule.name} · ${passengerLabel(p)}`,
          passengerOrdinal: p.ordinal,
          amountMinor: amount,
        });
      }
    }
  }

  return { lines, totalMinor: lines.reduce((sum, l) => sum + l.amountMinor, 0n) };
}

/** Price for one adult in a standard seat — the "from" price shown in search results. */
export function perAdultPrice(baseFareMinor: bigint, rules: PricingRule[]): bigint {
  return calculatePrice({
    baseFareMinor,
    rules,
    passengers: [{ ordinal: 1, type: 'ADULT', seatKind: 'STANDARD' }],
  }).totalMinor;
}
