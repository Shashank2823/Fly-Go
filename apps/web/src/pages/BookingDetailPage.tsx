import { CheckCircle2, Download, Eye, FileClock, Loader2, Plane, TimerOff } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { type BookingDetail, useBooking } from '../api/bookings';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { PriceBreakdown } from '../features/booking/PriceBreakdown';
import { BOOKING_STATUS, nextStepUrl } from '../lib/booking-status';
import {
  CABIN_LABELS,
  dayOffset,
  formatDay,
  formatDuration,
  formatMoney,
  localDate,
  localTime,
} from '../lib/format';

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function TicketCard({ b }: { b: BookingDetail }) {
  const f = b.flight;
  const plus = dayOffset(f.departure.local, f.arrival.local);
  return (
    <article
      aria-label="E-ticket summary"
      className="self-start overflow-hidden rounded-card border border-line/70 bg-surface shadow-lift"
    >
      <header className="flex items-center justify-between bg-navy-900 px-6 py-4 text-white">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-saffron-400 uppercase">
            E-ticket · {CABIN_LABELS[b.cabin]}
          </p>
          <p className="mt-1 text-sm text-navy-200">
            {f.airline.name} · <span className="font-mono">{f.flightNumber}</span> · {f.aircraft}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-navy-200">Booking ref</p>
          <p className="font-mono text-xl font-semibold tracking-[0.15em]">{b.reference}</p>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-6">
        <div>
          <p className="font-mono text-4xl font-semibold text-navy-900">{f.origin.iata}</p>
          <p className="text-sm text-muted">{f.origin.city}</p>
          <p className="mt-2 font-mono text-lg font-semibold">{localTime(f.departure.local)}</p>
          <p className="text-xs text-muted">{formatDay(localDate(f.departure.local))}</p>
        </div>
        <div className="flex flex-col items-center text-muted">
          <Plane className="size-5 rotate-45 text-saffron-500" aria-hidden />
          <span className="mt-1 text-xs">{formatDuration(f.durationMinutes)}</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-semibold text-navy-900">{f.destination.iata}</p>
          <p className="text-sm text-muted">{f.destination.city}</p>
          <p className="mt-2 font-mono text-lg font-semibold">
            {localTime(f.arrival.local)}
            {plus > 0 && <sup className="text-xs text-saffron-600">+{plus}</sup>}
          </p>
          <p className="text-xs text-muted">{formatDay(localDate(f.arrival.local))}</p>
        </div>
      </div>

      <div className="relative border-t border-dashed border-line px-6 py-5">
        <span
          className="absolute -top-3 -left-3 size-6 rounded-full border border-line/70 bg-canvas"
          aria-hidden
        />
        <span
          className="absolute -top-3 -right-3 size-6 rounded-full border border-line/70 bg-canvas"
          aria-hidden
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th className="pb-2 font-semibold">Passenger</th>
              <th className="pb-2 font-semibold">Type</th>
              <th className="pb-2 text-right font-semibold">Seat</th>
            </tr>
          </thead>
          <tbody>
            {b.travellers.map((t) => (
              <tr key={t.ordinal} className="border-t border-line/60">
                <td className="py-2 font-semibold">
                  {t.lastName.toUpperCase()} / {t.firstName}
                </td>
                <td className="py-2 text-muted">{t.type.toLowerCase()}</td>
                <td className="py-2 text-right font-mono font-semibold">{t.seatLabel ?? 'Lap'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 bg-canvas/70 px-6 py-4 text-sm">
        <span>
          Ticket <span className="font-mono font-semibold">{b.ticket?.ticketNumber ?? '—'}</span>
        </span>
        <span className="flex items-center gap-2">
          <Badge tone="success">Paid {b.payment ? formatMoney(b.payment.amount) : ''}</Badge>
          {b.confirmedAt && (
            <span className="text-xs text-muted">
              Confirmed {dateTime.format(new Date(b.confirmedAt))}
            </span>
          )}
        </span>
      </footer>
    </article>
  );
}

export function BookingDetailPage() {
  const { reference = '' } = useParams();
  const ref = reference.toUpperCase();
  const [params] = useSearchParams();
  const booking = useBooking(ref, { pollWhilePaying: true });

  if (booking.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-20" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (booking.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          {booking.error instanceof ApiError && booking.error.status === 404
            ? 'We couldn’t find this booking.'
            : 'Could not load this booking.'}
        </Alert>
      </div>
    );
  }

  const b = booking.data;
  const status = BOOKING_STATUS[b.status];
  const justConfirmed = params.get('confirmed') === '1' && b.status === 'CONFIRMED';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {justConfirmed ? (
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <CheckCircle2 className="size-8" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold">Booking confirmed!</h1>
              <p className="text-sm text-muted">
                Your trip to {b.flight.destination.city} is booked. A confirmation goes to{' '}
                {b.contact.email}.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Booking {b.reference}
            </p>
            <h1 className="text-2xl font-extrabold">
              {b.flight.origin.city} → {b.flight.destination.city}
            </h1>
          </div>
        )}
        <Badge tone={status.tone} className="text-sm">
          {status.label}
        </Badge>
      </div>

      {b.status === 'CONFIRMED' && (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <TicketCard b={b} />
          <aside className="space-y-4">
            <Card className="space-y-3">
              <h2 className="font-bold">Your e-ticket</h2>
              <p className="flex items-start gap-2 text-sm text-muted">
                <FileClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                Your PDF e-ticket is being prepared. Viewing and downloading it arrives in the next
                build phase.
              </p>
              <Button variant="secondary" className="w-full" disabled>
                <Eye className="size-4" aria-hidden /> View ticket
              </Button>
              <Button variant="outline" className="w-full" disabled>
                <Download className="size-4" aria-hidden /> Download PDF
              </Button>
            </Card>
            {b.price && (
              <Card>
                <h2 className="mb-4 font-bold">Fare breakdown</h2>
                <PriceBreakdown
                  lines={b.price.lines}
                  total={b.price.total}
                  names={Object.fromEntries(
                    b.travellers.map((t) => [t.ordinal, `${t.firstName} ${t.lastName}`]),
                  )}
                  totalLabel="Total paid"
                />
              </Card>
            )}
          </aside>
        </div>
      )}

      {b.status === 'PENDING' && (
        <Card className="space-y-4">
          <p className="text-sm text-muted">
            This booking isn’t finished yet. Your seats (
            {b.seats.map((s) => s.label).join(', ') || '—'}) are held until{' '}
            {b.holdExpiresAt ? dateTime.format(new Date(b.holdExpiresAt)) : '—'}.
          </p>
          <Link
            to={nextStepUrl(b.reference, b.status, b.travellers.length > 0)}
            className="inline-flex h-11 items-center rounded-xl bg-saffron-600 px-5 text-sm font-semibold text-white hover:bg-saffron-700"
          >
            Continue booking
          </Link>
        </Card>
      )}

      {b.status === 'PAYMENT_PENDING' && (
        <Alert tone="info">
          <span className="flex items-center gap-2 font-semibold">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Payment is being processed
          </span>
          This page updates automatically.
        </Alert>
      )}

      {(b.status === 'EXPIRED' || b.status === 'CANCELLED') && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-semibold">
            <TimerOff className="size-4" aria-hidden />{' '}
            {b.status === 'EXPIRED'
              ? 'This booking expired before payment.'
              : 'You released this booking.'}
          </p>
          {b.payment?.status === 'REFUNDED' && (
            <Alert tone="info">
              A payment was received after your seats were released, so it has been refunded in
              full.
            </Alert>
          )}
          <p className="text-sm text-muted">No charge was made for these seats.</p>
          <Link to="/" className="inline-flex text-sm font-semibold text-navy-700 hover:underline">
            Search flights again
          </Link>
        </Card>
      )}
    </div>
  );
}
