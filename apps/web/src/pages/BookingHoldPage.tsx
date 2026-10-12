import { CheckCircle2, Clock, Lock, TimerOff } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { useBooking, useReleaseHold } from '../api/bookings';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { FlightStrip } from '../features/booking/FlightStrip';
import { HoldCountdown } from '../features/booking/HoldCountdown';
import { useHoldRemaining } from '../features/booking/use-hold-remaining';
import { CABIN_LABELS, formatMoney, passengerSummary } from '../lib/format';

const HOLD_TOTAL_SECONDS = 600;

export function BookingHoldPage() {
  const { reference = '' } = useParams();
  const booking = useBooking(reference.toUpperCase());
  const release = useReleaseHold(reference.toUpperCase());
  const [confirmRelease, setConfirmRelease] = useState(false);
  const remaining = useHoldRemaining(
    booking.data?.holdExpiresAt ?? null,
    booking.data?.serverTime ?? new Date().toISOString(),
    booking.dataUpdatedAt || Date.now(),
  );

  if (booking.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (booking.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          {booking.error instanceof ApiError && booking.error.status === 404
            ? 'We couldn’t find this booking.'
            : 'Could not load this booking. Please try again.'}
        </Alert>
      </div>
    );
  }

  const b = booking.data;
  if (b.status === 'CONFIRMED' || b.status === 'REFUNDED')
    return <Navigate to={`/bookings/${b.reference}`} replace />;
  if (b.status === 'PAYMENT_PENDING')
    return <Navigate to={`/book/${b.reference}/checkout`} replace />;
  const expired = b.status === 'EXPIRED' || (b.status === 'PENDING' && remaining === 0);
  const released = b.status === 'CANCELLED';
  const active = b.status === 'PENDING' && !expired;
  const seatsAgainUrl = `/flights/${b.flight.id}/seats?${new URLSearchParams({
    cabin: b.cabin,
    adults: String(b.passengers.adults),
    children: String(b.passengers.children),
    infants: String(b.passengers.infants),
  }).toString()}`;

  return (
    <div className="pb-16">
      <FlightStrip flight={b.flight}>
        {active && remaining !== null && (
          <HoldCountdown seconds={remaining} total={HOLD_TOTAL_SECONDS} />
        )}
      </FlightStrip>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {active && (
            <Alert tone="success">
              <strong>Your seats are held.</strong> Complete passenger details and payment before
              the timer runs out — after that the seats are released for other travellers.
            </Alert>
          )}
          {expired && (
            <Alert>
              <span className="flex items-center gap-2 font-semibold">
                <TimerOff className="size-4" aria-hidden /> This hold has expired
              </span>
              The seats were released. You can choose seats again — availability may have changed.
            </Alert>
          )}
          {released && <Alert tone="info">You released these seats. Nothing was charged.</Alert>}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Booking reference
                </p>
                <p className="font-mono text-2xl font-semibold tracking-[0.15em] text-navy-900">
                  {b.reference}
                </p>
              </div>
              <Badge tone={active ? 'saffron' : expired ? 'danger' : 'neutral'}>
                {active
                  ? 'Awaiting details & payment'
                  : expired
                    ? 'Expired'
                    : b.status === 'CANCELLED'
                      ? 'Released'
                      : b.status}
              </Badge>
            </div>
            <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Travellers</dt>
                <dd className="font-semibold">{passengerSummary(b.passengers)}</dd>
              </div>
              <div>
                <dt className="text-muted">Cabin</dt>
                <dd className="font-semibold">{CABIN_LABELS[b.cabin]}</dd>
              </div>
              <div>
                <dt className="text-muted">Seats</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {b.seats.length ? (
                    b.seats.map((s) => (
                      <span
                        key={s.label}
                        className="rounded-md bg-navy-900 px-2 py-0.5 font-mono text-xs font-semibold text-white"
                      >
                        {s.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          {active && (
            <Card className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                <Clock className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-bold">Next: passenger details & payment</h2>
                <p className="mt-1 text-sm text-muted">
                  Add each traveller’s details, review the final price and pay before the timer runs
                  out.
                </p>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {b.priceEstimate && active && (
            <Card>
              <h2 className="font-bold">Price estimate</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {b.priceEstimate.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-muted">{l.description}</span>
                    <span className="shrink-0 font-medium">{formatMoney(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                <span className="font-semibold">Estimated total</span>
                <span className="text-xl font-extrabold text-navy-900">
                  {formatMoney(b.priceEstimate.total)}
                </span>
              </div>
              <p className="mt-2 flex gap-1.5 text-xs text-muted">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Final price is fixed at
                checkout.
              </p>
            </Card>
          )}

          <Card className="space-y-3">
            {active ? (
              <>
                <Link
                  to={`/book/${b.reference}/passengers`}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-saffron-600 text-sm font-semibold text-white hover:bg-saffron-700"
                >
                  <CheckCircle2 className="size-4" aria-hidden /> Continue to passenger details
                </Link>
                {!confirmRelease ? (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => setConfirmRelease(true)}
                  >
                    Release seats
                  </Button>
                ) : (
                  <div className="rounded-xl border border-danger/20 bg-danger-50 p-3">
                    <p className="text-sm text-danger">
                      Release {b.seats.map((s) => s.label).join(', ')} for other travellers?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={release.isPending}
                        onClick={() => release.mutate()}
                      >
                        {release.isPending ? 'Releasing…' : 'Yes, release'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmRelease(false)}>
                        Keep seats
                      </Button>
                    </div>
                  </div>
                )}
                {release.isError && <Alert>Could not release the seats. Please try again.</Alert>}
              </>
            ) : (
              <Link
                to={seatsAgainUrl}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-saffron-600 text-sm font-semibold text-white hover:bg-saffron-700"
              >
                Choose seats again
              </Link>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
