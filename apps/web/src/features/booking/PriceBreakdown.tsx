import type { PriceLine } from '../../api/bookings';
import { formatMoney, type Money } from '../../lib/format';

/** Itemised fare grouped by passenger, with the total as the sum of the lines. */
export function PriceBreakdown({
  lines,
  total,
  names,
  totalLabel = 'Total',
}: {
  lines: PriceLine[];
  total: Money;
  names?: Record<number, string>;
  totalLabel?: string;
}) {
  const groups = new Map<number | null, PriceLine[]>();
  for (const l of lines)
    groups.set(l.passengerOrdinal, [...(groups.get(l.passengerOrdinal) ?? []), l]);
  return (
    <div>
      <dl className="space-y-4 text-sm">
        {[...groups.entries()].map(([ordinal, group]) => (
          <div key={ordinal ?? 'booking'}>
            <dt className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
              {ordinal ? (names?.[ordinal] ?? `Passenger ${ordinal}`) : 'Booking'}
            </dt>
            {group.map((l, i) => (
              <dd key={i} className="flex justify-between gap-3 py-0.5">
                <span className="text-muted">{l.description.split(' · ')[0]}</span>
                <span className="shrink-0 font-medium">{formatMoney(l.amount)}</span>
              </dd>
            ))}
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-semibold">{totalLabel}</span>
        <span className="text-2xl font-extrabold text-navy-900">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
