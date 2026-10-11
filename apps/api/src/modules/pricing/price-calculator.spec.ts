import { applyBasisPoints } from '../../common/money/money';
import { calculatePrice, perAdultPrice, type PricingRule } from './price-calculator';

// The approved v1 India market rules (docs §23).
const IN_RULES: PricingRule[] = [
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
];

describe('applyBasisPoints', () => {
  it('rounds half-up', () => {
    expect(applyBasisPoints(1n, 5_000n)).toBe(1n); // 0.5 → 1
    expect(applyBasisPoints(1n, 4_999n)).toBe(0n);
    expect(applyBasisPoints(549_900n, 750n)).toBe(41_243n); // 41242.5 → 41243
  });

  it('rejects negative input', () => {
    expect(() => applyBasisPoints(-1n, 750n)).toThrow(RangeError);
  });
});

describe('calculatePrice', () => {
  it('prices one adult in a standard seat: base + 7.5% tax + ₹450 fee', () => {
    const { lines, totalMinor } = calculatePrice({
      baseFareMinor: 500_000n, // ₹5,000
      rules: IN_RULES,
      passengers: [{ ordinal: 1, type: 'ADULT', seatKind: 'STANDARD' }],
    });
    expect(lines.map((l) => [l.kind, l.code, l.amountMinor])).toEqual([
      ['BASE_FARE', 'BASE_FARE', 500_000n],
      ['TAX', 'GST', 37_500n],
      ['FEE', 'CONVENIENCE_FEE', 45_000n],
    ]);
    expect(totalMinor).toBe(582_500n); // ₹5,825
  });

  it('adds seat surcharges only for the matching seat kind', () => {
    const { lines } = calculatePrice({
      baseFareMinor: 500_000n,
      rules: IN_RULES,
      passengers: [
        { ordinal: 1, type: 'ADULT', seatKind: 'EXTRA_LEGROOM' },
        { ordinal: 2, type: 'ADULT', seatKind: 'EXIT_ROW' },
        { ordinal: 3, type: 'CHILD', seatKind: 'STANDARD' },
      ],
    });
    const surcharges = lines.filter((l) => l.kind === 'SEAT_SURCHARGE');
    expect(surcharges.map((l) => [l.passengerOrdinal, l.amountMinor])).toEqual([
      [1, 200_000n],
      [2, 120_000n],
    ]);
  });

  it('charges infants 10% of base fare, taxed on that amount, with no seat surcharge', () => {
    const { lines } = calculatePrice({
      baseFareMinor: 500_000n,
      rules: IN_RULES,
      passengers: [{ ordinal: 2, type: 'INFANT', seatKind: null }],
    });
    expect(lines.map((l) => [l.code, l.amountMinor])).toEqual([
      ['INFANT_FARE', 50_000n],
      ['GST', 3_750n],
      ['CONVENIENCE_FEE', 45_000n],
    ]);
  });

  it('makes the total exactly the sum of itemised lines', () => {
    const { lines, totalMinor } = calculatePrice({
      baseFareMinor: 549_933n,
      rules: IN_RULES,
      passengers: [1, 2, 3].map((ordinal) => ({
        ordinal,
        type: 'ADULT' as const,
        seatKind: 'STANDARD' as const,
      })),
    });
    expect(totalMinor).toBe(lines.reduce((s, l) => s + l.amountMinor, 0n));
  });

  it('orders lines by passenger ordinal regardless of input order', () => {
    const { lines } = calculatePrice({
      baseFareMinor: 100_000n,
      rules: [],
      passengers: [
        { ordinal: 2, type: 'ADULT', seatKind: null },
        { ordinal: 1, type: 'ADULT', seatKind: null },
      ],
    });
    expect(lines.map((l) => l.passengerOrdinal)).toEqual([1, 2]);
  });

  it('rejects an empty passenger list', () => {
    expect(() => calculatePrice({ baseFareMinor: 1n, rules: [], passengers: [] })).toThrow(
      RangeError,
    );
  });

  it('computes the per-adult search price', () => {
    expect(perAdultPrice(500_000n, IN_RULES)).toBe(582_500n);
  });
});
