export interface Money {
  amountMinor: string;
  currency: string;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** ₹8,985.50 — shows paise only when non-zero. Amounts arrive as minor-unit strings. */
export function formatMoney(m: Money): string {
  const minor = BigInt(m.amountMinor);
  const fraction = minor % 100n !== 0n;
  const key = `${m.currency}:${fraction}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: fraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(Number(minor) / 100);
}

export function addMoney(items: Money[], currency: string): Money {
  return {
    amountMinor: items.reduce((s, m) => s + BigInt(m.amountMinor), 0n).toString(),
    currency,
  };
}

/**
 * Times arrive as airport-local ISO strings with offsets ("2026-10-14T06:10:00+05:30").
 * We read the wall-clock parts directly so the browser's own timezone never shifts them.
 */
export const localTime = (iso: string) => iso.slice(11, 16);
export const localDate = (iso: string) => iso.slice(0, 10);

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longDayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Wed, 14 Oct" for a YYYY-MM-DD date. */
export const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));
export const formatLongDay = (date: string) => longDayFormat.format(new Date(`${date}T00:00:00Z`));

/** Calendar days between departure and arrival local dates (e.g. +1 for overnight). */
export function dayOffset(departureLocal: string, arrivalLocal: string): number {
  const a = Date.parse(`${localDate(departureLocal)}T00:00:00Z`);
  const b = Date.parse(`${localDate(arrivalLocal)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export const CABIN_LABELS: Record<string, string> = {
  ECONOMY: 'Economy',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Business',
  FIRST: 'First',
};

export function passengerSummary(p: { adults: number; children: number; infants: number }): string {
  const parts = [`${p.adults} adult${p.adults > 1 ? 's' : ''}`];
  if (p.children) parts.push(`${p.children} child${p.children > 1 ? 'ren' : ''}`);
  if (p.infants) parts.push(`${p.infants} infant${p.infants > 1 ? 's' : ''}`);
  return parts.join(', ');
}

/** YYYY-MM-DD in the browser's local calendar (used for date inputs). */
export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
