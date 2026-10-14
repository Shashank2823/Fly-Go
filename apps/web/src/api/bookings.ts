import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Money } from '../lib/format';
import { apiRequest } from './client';
import type { FlightHeader } from './flights';

export type BookingStatus =
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface PriceLine {
  kind: string;
  code: string;
  description: string;
  passengerOrdinal: number | null;
  amount: Money;
}

export interface Traveller {
  ordinal: number;
  type: PassengerType;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string | null;
  seatLabel: string | null;
}

export interface BookingDetail {
  reference: string;
  status: BookingStatus;
  cabin: string;
  holdExpiresAt: string | null;
  serverTime: string;
  passengers: { adults: number; children: number; infants: number };
  flight: FlightHeader;
  seats: { label: string; cabin: string; kind: string; features: string[] }[];
  priceEstimate: { lines: PriceLine[]; total: Money; isEstimate: true } | null;
  travellers: Traveller[];
  contact: { email: string | null; phone: string | null };
  price: { priceVersion: number; lines: PriceLine[]; total: Money } | null;
  payment: {
    paymentId: string;
    status: string;
    amount: Money;
    failureCode: string | null;
    succeededAt: string | null;
  } | null;
  ticket: { status: string; ticketNumber: string } | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface BookingSummary {
  reference: string;
  status: BookingStatus;
  cabin: string;
  flight: FlightHeader;
  seats: string[];
  travellerCount: number;
  total: Money | null;
  holdExpiresAt: string | null;
  createdAt: string;
}

export interface CheckoutQuote {
  priceVersion: number;
  lines: PriceLine[];
  total: Money;
  holdExpiresAt: string;
  serverTime: string;
}

export interface PaymentStatus {
  paymentId: string;
  status:
    | 'INITIATED'
    | 'PROCESSING'
    | 'REQUIRES_ACTION'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED';
  amount: Money;
  failureCode: string | null;
  bookingStatus: BookingStatus;
  updatedAt: string;
}

export interface CreateHoldInput {
  flightId: string;
  cabin: string;
  passengers: { adults: number; children: number; infants: number };
  seats: string[];
}

export interface PassengersInput {
  contact: { email: string; phone: string };
  passengers: {
    ordinal: number;
    type: PassengerType;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality?: string;
    seatLabel?: string;
  }[];
}

export const bookingKey = (ref: string) => ['bookings', ref] as const;

export function useCreateHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateHoldInput; idempotencyKey: string }) =>
      apiRequest<BookingDetail>('/bookings', { method: 'POST', body: input, idempotencyKey }),
    onSuccess: (booking) => {
      queryClient.setQueryData(bookingKey(booking.reference), booking);
      void queryClient.invalidateQueries({ queryKey: ['flights', 'seat-map', booking.flight.id] });
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] });
    },
  });
}

export function useBooking(
  reference: string | undefined,
  opts: { pollWhilePaying?: boolean; pollForTicket?: boolean } = {},
) {
  return useQuery({
    queryKey: bookingKey(reference ?? ''),
    enabled: !!reference,
    queryFn: () => apiRequest<BookingDetail>(`/bookings/${reference}`),
    refetchInterval: (q) => {
      const b = q.state.data;
      if (opts.pollWhilePaying && b?.status === 'PAYMENT_PENDING') return 1_500;
      // The e-ticket is generated in the background right after confirmation.
      if (
        opts.pollForTicket &&
        b?.status === 'CONFIRMED' &&
        b.ticket &&
        b.ticket.status !== 'ISSUED'
      )
        return 2_000;
      return false;
    },
    // Keep checking even if the traveller switches tabs mid-payment (stops once settled).
    refetchIntervalInBackground: true,
  });
}

export function useMyBookings(page: number) {
  return useQuery({
    queryKey: ['bookings', 'list', page],
    queryFn: () =>
      apiRequest<{
        data: BookingSummary[];
        page: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>(`/bookings?page=${page}&pageSize=10`),
    placeholderData: keepPreviousData,
  });
}

export function useReleaseHold(reference: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>(`/bookings/${reference}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKey(reference) });
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] });
    },
  });
}

export function useUpdatePassengers(reference: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PassengersInput) =>
      apiRequest<BookingDetail>(`/bookings/${reference}/passengers`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (booking) => queryClient.setQueryData(bookingKey(reference), booking),
  });
}

export function useCheckout(reference: string) {
  return useMutation({
    mutationFn: () =>
      apiRequest<CheckoutQuote>(`/bookings/${reference}/checkout`, { method: 'POST' }),
  });
}

export function useStartPayment(reference: string) {
  return useMutation({
    mutationFn: ({
      priceVersion,
      idempotencyKey,
    }: {
      priceVersion: number;
      idempotencyKey: string;
    }) =>
      apiRequest<PaymentStatus>(`/bookings/${reference}/payments`, {
        method: 'POST',
        body: { priceVersion },
        idempotencyKey,
      }),
  });
}

/** Polls a payment until it reaches a final state. */
export function usePaymentStatus(reference: string, paymentId: string | null) {
  return useQuery({
    queryKey: ['bookings', reference, 'payments', paymentId],
    enabled: !!paymentId,
    queryFn: () => apiRequest<PaymentStatus>(`/bookings/${reference}/payments/${paymentId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED' || s === 'REFUNDED'
        ? false
        : 1_000;
    },
    // Short-lived poll that must not pause when the tab is in the background.
    refetchIntervalInBackground: true,
  });
}
