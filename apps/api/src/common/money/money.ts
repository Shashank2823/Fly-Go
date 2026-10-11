/** Integer money helpers. Amounts are BIGINT minor units (paise for INR); never floats. */

export interface Money {
  amountMinor: string;
  currency: string;
}

/** half-up rounding of amount × basisPoints / 10_000 for non-negative amounts. */
export function applyBasisPoints(amountMinor: bigint, basisPoints: bigint): bigint {
  if (amountMinor < 0n || basisPoints < 0n) throw new RangeError('Negative money input');
  return (amountMinor * basisPoints + 5_000n) / 10_000n;
}

/** Serialises for JSON (BigInt is not JSON-safe; strings keep full precision). */
export function toMoney(amountMinor: bigint, currency: string): Money {
  return { amountMinor: amountMinor.toString(), currency };
}
