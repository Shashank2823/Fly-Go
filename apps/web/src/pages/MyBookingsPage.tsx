import { ArrowRight, ChevronLeft, ChevronRight, Luggage } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { type BookingSummary, useMyBookings } from '../api/bookings';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { BOOKING_STATUS, nextStepUrl } from '../lib/booking-status';
import { cn } from '../lib/cn';
import { CABIN_LABELS, formatDay, formatMoney, localDate, localTime } from '../lib/format';

const FILTERS = {
  all: { label: 'All', match: () => true },
  confirmed: { label: 'Confirmed', match: (b: BookingSummary) => b.status === 'CONFIRMED' },
  progress: {
    label: 'In progress',
    match: (b: BookingSummary) => b.status === 'PENDING' || b.status === 'PAYMENT_PENDING',
  },
  closed: {
    label: 'Expired & released',
    match: (b: BookingSummary) => ['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(b.status),
  },
} as const;
type Filter = keyof typeof FILTERS;

function TripRow({ b }: { b: BookingSummary }) {
  const s = BOOKING_STATUS[b.status];
  const href =
    b.status === 'PENDING' ? nextStepUrl(b.reference, b.status, true) : `/bookings/${b.reference}`;
  return (
    <Link
      to={href}
      className="group grid gap-4 rounded-card border border-line/70 bg-surface p-5 shadow-card transition hover:shadow-lift sm:grid-cols-[auto_1fr_auto] sm:items-center"
    >
      <div className="flex size-12 flex-col items-center justify-center rounded-xl bg-navy-900 text-white">
        <span className="text-[10px] uppercase">
          {formatDay(localDate(b.flight.departure.local)).split(/[ ,]/)[0]}
        </span>
        <span className="text-sm font-bold">{localDate(b.flight.departure.local).slice(8)}</span>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-bold">
          {b.flight.origin.city} <ArrowRight className="size-4 text-saffron-500" aria-hidden />{' '}
          {b.flight.destination.city}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {formatDay(localDate(b.flight.departure.local))} ·{' '}
          <span className="font-mono">{localTime(b.flight.departure.local)}</span> ·{' '}
          {b.flight.airline.name} <span className="font-mono">{b.flight.flightNumber}</span> ·{' '}
          {CABIN_LABELS[b.cabin]}
        </p>
        <p className="mt-1 font-mono text-xs text-muted">
          {b.reference} · {b.travellerCount} traveller{b.travellerCount > 1 ? 's' : ''}
          {b.seats.length > 0 && ` · seats ${b.seats.join(', ')}`}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <Badge tone={s.tone}>{s.label}</Badge>
        {b.total && <span className="font-bold text-navy-900">{formatMoney(b.total)}</span>}
      </div>
    </Link>
  );
}

export function MyBookingsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const bookings = useMyBookings(page);
  const rows = bookings.data?.data.filter(FILTERS[filter].match) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">My trips</h1>
          <p className="text-sm text-muted">All your bookings, newest first.</p>
        </div>
        <div
          role="tablist"
          aria-label="Filter trips"
          className="flex flex-wrap gap-1 rounded-xl border border-line/70 bg-surface p-1"
        >
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'h-9 rounded-lg px-3 text-sm font-semibold',
                filter === f ? 'bg-navy-900 text-white' : 'text-muted hover:text-navy-900',
              )}
            >
              {FILTERS[f].label}
            </button>
          ))}
        </div>
      </div>

      {bookings.isError && <Alert>Could not load your trips.</Alert>}
      <div className="space-y-3" aria-busy={bookings.isFetching}>
        {bookings.isPending &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        {rows.map((b) => (
          <TripRow key={b.reference} b={b} />
        ))}
        {bookings.data && rows.length === 0 && (
          <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
            <Luggage className="mx-auto size-10 text-navy-200" aria-hidden />
            <p className="mt-3 font-bold">{filter === 'all' ? 'No trips yet' : 'Nothing here'}</p>
            <p className="mt-1 text-sm text-muted">When you book a flight it will appear here.</p>
            <Link
              to="/"
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-saffron-600 px-4 text-sm font-semibold text-white hover:bg-saffron-700"
            >
              Search flights
            </Link>
          </div>
        )}
      </div>

      {bookings.data && bookings.data.page.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {bookings.data.page.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= bookings.data.page.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
