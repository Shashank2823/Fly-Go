import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Money } from '../lib/format';
import { apiRequest } from './client';
import type { FlightHeader } from './flights';

export interface BookingDetail {
  reference: string;
  status:
    | 'PENDING'
    | 'PAYMENT_PENDING'
    | 'CONFIRMED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'REFUND_PENDING'
    | 'REFUNDED';
  cabin: string;
  holdExpiresAt: string | null;
  serverTime: string;
  passengers: { adults: number; children: number; infants: number };
  flight: FlightHeader;
  seats: { label: string; cabin: string; kind: string; features: string[] }[];
  priceEstimate: {
    lines: {
      kind: string;
      code: string;
      description: string;
      passengerOrdinal: number | null;
      amount: Money;
    }[];
    total: Money;
    isEstimate: true;
  } | null;
  createdAt: string;
}

export interface CreateHoldInput {
  flightId: string;
  cabin: string;
  passengers: { adults: number; children: number; infants: number };
  seats: string[];
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
    },
  });
}

export function useBooking(reference: string | undefined) {
  return useQuery({
    queryKey: bookingKey(reference ?? ''),
    enabled: !!reference,
    queryFn: () => apiRequest<BookingDetail>(`/bookings/${reference}`),
  });
}

export function useReleaseHold(reference: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>(`/bookings/${reference}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKey(reference) }),
  });
}
