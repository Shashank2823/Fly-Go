import type { BookingStatus } from '../api/bookings';

type Tone = 'neutral' | 'success' | 'danger' | 'navy' | 'saffron' | 'amber';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'In progress', tone: 'saffron' },
  PAYMENT_PENDING: { label: 'Payment processing', tone: 'amber' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Released', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'amber' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

/** Where to send someone who opens a booking, based on its state. */
export function nextStepUrl(
  reference: string,
  status: BookingStatus,
  hasTravellers: boolean,
): string {
  if (status === 'PENDING')
    return hasTravellers ? `/book/${reference}/checkout` : `/book/${reference}/passengers`;
  if (status === 'PAYMENT_PENDING') return `/book/${reference}/checkout`;
  return `/bookings/${reference}`;
}
