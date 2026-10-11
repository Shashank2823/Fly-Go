import { Plane } from 'lucide-react';
import type { FlightSummary } from '../../api/flights';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { dayOffset, formatDuration, formatMoney, localTime } from '../../lib/format';

/** Boarding-pass styled result: itinerary stub on the left, perforated fare stub on the right. */
export function FlightCard({ flight, onSelect }: { flight: FlightSummary; onSelect: () => void }) {
  const plusDays = dayOffset(flight.departure.local, flight.arrival.local);
  const fewSeats = flight.seatsAvailable <= 9;

  return (
    <article
      aria-label={`${flight.airline.name} ${flight.flightNumber}, ${localTime(flight.departure.local)} to ${localTime(flight.arrival.local)}, ${formatMoney(flight.pricePerAdult)}`}
      className="relative grid overflow-hidden rounded-card border border-line/70 bg-surface shadow-card transition hover:shadow-lift md:grid-cols-[1fr_15rem]"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-lg bg-navy-900 font-mono text-[11px] font-semibold text-white">
            {flight.airline.code}
          </span>
          <span className="font-semibold">{flight.airline.name}</span>
          <span className="font-mono text-xs text-muted">
            {flight.flightNumber} · {flight.aircraft}
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
          <div>
            <p className="font-mono text-2xl font-semibold tracking-tight">
              {localTime(flight.departure.local)}
            </p>
            <p className="font-mono text-sm font-semibold text-navy-700">{flight.origin.iata}</p>
            <p className="max-w-28 truncate text-xs text-muted">{flight.origin.city}</p>
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <span className="text-xs font-medium text-muted">
              {formatDuration(flight.durationMinutes)}
            </span>
            <div className="relative flex w-full items-center">
              <span className="size-1.5 rounded-full bg-navy-200" />
              <span className="h-px flex-1 border-t border-dashed border-navy-200" />
              <Plane className="size-4 rotate-45 text-saffron-500" aria-hidden />
              <span className="h-px flex-1 border-t border-dashed border-navy-200" />
              <span className="size-1.5 rounded-full bg-navy-200" />
            </div>
            <span className="text-xs text-teal-700">Non-stop</span>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold tracking-tight">
              {localTime(flight.arrival.local)}
              {plusDays > 0 && (
                <sup className="ml-0.5 text-xs text-saffron-600" title="Arrives the next day">
                  +{plusDays}
                </sup>
              )}
            </p>
            <p className="font-mono text-sm font-semibold text-navy-700">
              {flight.destination.iata}
            </p>
            <p className="ml-auto max-w-28 truncate text-xs text-muted">
              {flight.destination.city}
            </p>
          </div>
        </div>
      </div>

      {/* Perforation: dashed divider with punched notches. */}
      <div className="relative flex flex-row items-center justify-between gap-4 border-t border-dashed border-line bg-canvas/60 p-5 md:flex-col md:items-stretch md:justify-center md:border-t-0 md:border-l">
        <span
          className="absolute -top-3 -left-3 hidden size-6 rounded-full border border-line/70 bg-canvas md:block"
          aria-hidden
        />
        <span
          className="absolute -bottom-3 -left-3 hidden size-6 rounded-full border border-line/70 bg-canvas md:block"
          aria-hidden
        />
        <div className="md:text-center">
          <p className="text-2xl font-extrabold tracking-tight text-navy-900">
            {formatMoney(flight.pricePerAdult)}
          </p>
          <p className="text-xs text-muted">per adult · incl. taxes & fees</p>
          {fewSeats && (
            <Badge tone="amber" className="mt-2">
              Only {flight.seatsAvailable} left
            </Badge>
          )}
        </div>
        <Button onClick={onSelect} className="shrink-0 md:w-full">
          Select seats
        </Button>
      </div>
    </article>
  );
}

export function FlightCardSkeleton() {
  return (
    <div
      className="grid overflow-hidden rounded-card border border-line/70 bg-surface md:grid-cols-[1fr_15rem]"
      aria-hidden
    >
      <div className="space-y-4 p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-navy-100/60" />
        <div className="flex items-center justify-between gap-6">
          <div className="h-12 w-20 animate-pulse rounded bg-navy-100/60" />
          <div className="h-2 flex-1 animate-pulse rounded bg-navy-100/60" />
          <div className="h-12 w-20 animate-pulse rounded bg-navy-100/60" />
        </div>
      </div>
      <div className="space-y-3 border-t border-dashed border-line bg-canvas/60 p-6 md:border-t-0 md:border-l">
        <div className="mx-auto h-7 w-28 animate-pulse rounded bg-navy-100/60" />
        <div className="h-11 animate-pulse rounded-xl bg-navy-100/60" />
      </div>
    </div>
  );
}
