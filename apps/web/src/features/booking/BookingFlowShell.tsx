import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { BookingDetail } from '../../api/bookings';
import { Alert } from '../../components/ui/Alert';
import { BookingSteps, type BookingStep } from './BookingSteps';
import { FlightStrip } from './FlightStrip';
import { HoldCountdown } from './HoldCountdown';
import { useHoldRemaining } from './use-hold-remaining';

const HOLD_TOTAL_SECONDS = 600;

/**
 * Frame for the passenger and checkout steps: itinerary header, live hold countdown and step
 * indicator. Shows an "expired" state instead of the step once the hold has lapsed.
 */
export function BookingFlowShell({
  booking,
  receivedAt,
  step,
  children,
}: {
  booking: BookingDetail;
  receivedAt: number;
  step: BookingStep;
  children: ReactNode;
}) {
  const remaining = useHoldRemaining(booking.holdExpiresAt, booking.serverTime, receivedAt);
  const holdLive = booking.status === 'PENDING' || booking.status === 'PAYMENT_PENDING';
  const expired = booking.status === 'EXPIRED' || (booking.status === 'PENDING' && remaining === 0);
  const seatsAgainUrl = `/flights/${booking.flight.id}/seats?${new URLSearchParams({
    cabin: booking.cabin,
    adults: String(booking.passengers.adults),
    children: String(booking.passengers.children),
    infants: String(booking.passengers.infants),
  }).toString()}`;

  return (
    <div className="pb-24">
      <FlightStrip flight={booking.flight}>
        {holdLive && !expired && remaining !== null && booking.status === 'PENDING' && (
          <HoldCountdown seconds={remaining} total={HOLD_TOTAL_SECONDS} />
        )}
      </FlightStrip>
      <div className="border-b border-line/70 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <BookingSteps current={step} />
          <p className="font-mono text-xs text-muted">
            Booking{' '}
            <span className="font-semibold tracking-wider text-navy-900">{booking.reference}</span>
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-8">
        {expired ? (
          <Alert>
            <p className="font-semibold">Your seat hold has expired</p>
            <p>
              The seats were released for other travellers.{' '}
              <Link to={seatsAgainUrl} className="font-semibold underline">
                Choose seats again
              </Link>
            </p>
          </Alert>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
