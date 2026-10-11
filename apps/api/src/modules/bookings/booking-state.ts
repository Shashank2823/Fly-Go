import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import type { BookingStatus } from '../../generated/prisma/client';

/** Valid booking transitions (docs §10.1). Payment-driven transitions land in Phase 5. */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['PAYMENT_PENDING', 'EXPIRED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'PENDING', 'EXPIRED'],
  CONFIRMED: ['CANCELLED', 'REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      'INVALID_BOOKING_STATE',
      HttpStatus.CONFLICT,
      `Booking cannot move from ${from} to ${to}`,
      {
        from,
        to,
      },
    );
  }
}

export const isTerminal = (s: BookingStatus) => TRANSITIONS[s].length === 0;
