import { ArrowRight } from 'lucide-react';
import type { FlightHeader } from '../../api/flights';
import { dayOffset, formatDay, formatDuration, localDate, localTime } from '../../lib/format';

/** Compact navy itinerary header used across the booking flow. */
export function FlightStrip({
  flight,
  children,
}: {
  flight: FlightHeader;
  children?: React.ReactNode;
}) {
  const plus = dayOffset(flight.departure.local, flight.arrival.local);
  return (
    <section className="bg-navy-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
        <div>
          <p className="font-mono text-xs text-navy-200">
            {flight.airline.name} · {flight.flightNumber} · {flight.aircraft}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight">
            <span>
              {flight.origin.city}{' '}
              <span className="font-mono text-base text-navy-200">{flight.origin.iata}</span>
            </span>
            <ArrowRight className="size-5 text-saffron-400" aria-hidden />
            <span>
              {flight.destination.city}{' '}
              <span className="font-mono text-base text-navy-200">{flight.destination.iata}</span>
            </span>
          </h1>
          <p className="mt-1 text-sm text-navy-200">
            {formatDay(localDate(flight.departure.local))} ·{' '}
            <span className="font-mono">{localTime(flight.departure.local)}</span> →{' '}
            <span className="font-mono">{localTime(flight.arrival.local)}</span>
            {plus > 0 && <span className="text-saffron-400"> (+{plus} day)</span>} ·{' '}
            {formatDuration(flight.durationMinutes)} · local times
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}
