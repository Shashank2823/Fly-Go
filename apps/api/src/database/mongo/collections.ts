import type { ObjectId } from 'mongodb';

/**
 * MongoDB holds document-shaped, non-transactional data (docs §7). Every write is an
 * idempotent upsert keyed by a deterministic id, made by a worker after PostgreSQL committed.
 */
export const Collections = {
  TicketSnapshots: 'ticket_snapshots',
  EmailMessages: 'email_messages',
  Notifications: 'notifications',
} as const;

/** Immutable copy of exactly what was printed on a ticket version. */
export interface TicketSnapshotDoc {
  _id?: ObjectId;
  bookingId: string;
  version: number;
  reference: string;
  ticketNumber: string;
  issuedAt: Date;
  templateVersion: number;
  cabin: string;
  flight: {
    airline: { code: string; name: string };
    flightNumber: string;
    aircraft: string;
    origin: { iata: string; city: string; name: string };
    destination: { iata: string; city: string; name: string };
    departureLocal: string;
    arrivalLocal: string;
    durationMinutes: number;
  };
  passengers: {
    ordinal: number;
    type: string;
    firstName: string;
    lastName: string;
    seatLabel: string | null;
  }[];
  price: {
    lines: { description: string; passengerOrdinal: number | null; amountMinor: string }[];
    totalMinor: string;
    currency: string;
  };
  payment: { status: string; amountMinor: string; currency: string; paidAt: Date | null };
  contactEmail: string | null;
  createdAt: Date;
}

export type EmailStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'RETRY_SCHEDULED' | 'FAILED';

export interface EmailAttempt {
  at: Date;
  outcome: 'SENT' | 'TRANSIENT_ERROR' | 'PERMANENT_ERROR';
  error?: string;
  providerMessageId?: string;
}

/** One logical email and its delivery history. SENT means accepted by SMTP, not delivered. */
export interface EmailMessageDoc {
  _id?: ObjectId;
  dedupeKey: string;
  type: 'BOOKING_CONFIRMATION';
  templateVersion: number;
  bookingId: string;
  reference: string;
  userId: string;
  to: string;
  subject: string;
  status: EmailStatus;
  attempts: EmailAttempt[];
  lockedUntil: Date | null;
  sentAt: Date | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  'BOOKING_CONFIRMED' | 'TICKET_READY' | 'BOOKING_EXPIRED' | 'PAYMENT_FAILED' | 'PAYMENT_REFUNDED';

export interface NotificationDoc {
  _id?: ObjectId;
  dedupeKey: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingReference: string | null;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}
