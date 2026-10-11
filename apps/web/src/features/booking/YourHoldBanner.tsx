import { ArrowRight, Timer } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Link } from 'react-router';
import { useReleaseHold } from '../../api/bookings';
import type { YourHold } from '../../api/flights';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { useHoldRemaining } from './use-hold-remaining';

interface Props {
  hold: YourHold;
  serverTime: string;
  receivedAt: number;
  highlighted: boolean;
  onReleased: () => void;
}

/**
 * Shown on the seat map when the traveller already holds seats on this flight (e.g. they
 * navigated away after holding). Lets them resume that booking or release the seats.
 */
export const YourHoldBanner = forwardRef<HTMLDivElement, Props>(function YourHoldBanner(
  { hold, serverTime, receivedAt, highlighted, onReleased },
  ref,
) {
  const release = useReleaseHold(hold.reference);
  const [confirming, setConfirming] = useState(false);
  const remaining = useHoldRemaining(hold.holdExpiresAt, serverTime, receivedAt);
  const mm = String(Math.floor((remaining ?? 0) / 60)).padStart(2, '0');
  const ss = String((remaining ?? 0) % 60).padStart(2, '0');
  const canRelease = hold.status === 'PENDING';

  if (remaining === 0) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={`Your held seats, booking ${hold.reference}`}
      className={cn(
        'rounded-card border-2 bg-saffron-50 p-4 transition-shadow',
        highlighted ? 'border-saffron-500 shadow-lift' : 'border-saffron-100',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-saffron-700">
            You’re already holding seats on this flight
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
            {hold.seats.map((s) => (
              <span
                key={s}
                className="rounded-md bg-saffron-600 px-2 py-0.5 font-mono text-xs font-semibold text-white"
              >
                {s}
              </span>
            ))}
            <span className="text-muted">
              Booking <span className="font-mono font-semibold text-ink">{hold.reference}</span>
            </span>
          </p>
        </div>
        <p className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 font-mono text-sm font-semibold text-saffron-700">
          <Timer className="size-4" aria-hidden />
          <span aria-label={`${mm} minutes ${ss} seconds left`}>
            {mm}:{ss}
          </span>
        </p>
      </div>

      {!confirming ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/book/${hold.reference}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-saffron-600 px-4 text-sm font-semibold text-white hover:bg-saffron-700"
          >
            Continue with {hold.seats.length > 1 ? 'these seats' : 'this seat'}{' '}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          {canRelease && (
            <Button variant="danger" size="sm" className="h-10" onClick={() => setConfirming(true)}>
              Release & choose again
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-danger/20 bg-surface p-3">
          <p className="text-sm text-danger">
            Release {hold.seats.join(', ')}? Other travellers will be able to take{' '}
            {hold.seats.length > 1 ? 'them' : 'it'}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={release.isPending}
              onClick={() => release.mutate(undefined, { onSuccess: onReleased })}
            >
              {release.isPending ? 'Releasing…' : 'Yes, release'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
          </div>
          {release.isError && (
            <p className="mt-2 text-xs text-danger">
              Could not release the seats. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
});
