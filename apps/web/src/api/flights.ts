import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Money } from '../lib/format';
import type { FlightSearch } from '../lib/search-params';
import { apiRequest } from './client';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  timezone: string;
}

export interface FlightTime {
  utc: string;
  local: string;
  timezone: string;
}

export interface FlightHeader {
  id: string;
  airline: { code: string; name: string };
  flightNumber: string;
  aircraft: string;
  origin: { iata: string; city: string; name: string };
  destination: { iata: string; city: string; name: string };
  departure: FlightTime;
  arrival: FlightTime;
  durationMinutes: number;
  status: string;
}

export interface FlightSummary extends FlightHeader {
  cabin: string;
  pricePerAdult: Money;
  seatsAvailable: number;
}

export interface FlightDetail extends FlightSummary {
  cabins: { cabin: string; pricePerAdult: Money; baseFare: Money; seatsAvailable: number }[];
}

export interface FlightSearchResponse {
  data: FlightSummary[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
  market: { code: string; currency: string };
}

export type SeatState = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED' | 'HELD_BY_YOU';

export interface Seat {
  label: string;
  row: number;
  column: string;
  cabin: string;
  kind: 'STANDARD' | 'EXTRA_LEGROOM' | 'EXIT_ROW';
  features: string[];
  state: SeatState;
  surcharge: Money | null;
}

export interface SeatMap {
  flightId: string;
  cabins: { cabin: string; firstRow: number; lastRow: number; columns: (string | null)[] }[];
  seats: Seat[];
  holdTtlSeconds: number;
  generatedAt: string;
}

/** Reference data: the full airport list is small, so it is fetched once and filtered locally. */
export function useAirports() {
  return useQuery({
    queryKey: ['airports'],
    queryFn: () => apiRequest<Airport[]>('/airports'),
    staleTime: 60 * 60_000,
  });
}

export function useFlightSearch(search: FlightSearch | null) {
  return useQuery({
    queryKey: ['flights', 'search', search],
    enabled: !!search,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const s = search!;
      const q = new URLSearchParams({
        from: s.from,
        to: s.to,
        date: s.date,
        passengers: String(s.adults + s.children),
        cabin: s.cabin,
        sort: s.sort,
        order: 'asc',
        page: String(s.page),
        pageSize: '10',
      });
      return apiRequest<FlightSearchResponse>(`/flights?${q.toString()}`, { signal });
    },
  });
}

export function useFlight(flightId: string | undefined) {
  return useQuery({
    queryKey: ['flights', 'detail', flightId],
    enabled: !!flightId,
    queryFn: () => apiRequest<FlightDetail>(`/flights/${flightId}`),
  });
}

/** Live seat availability — refreshed periodically and never trusted for the final decision. */
export function useSeatMap(flightId: string | undefined) {
  return useQuery({
    queryKey: ['flights', 'seat-map', flightId],
    enabled: !!flightId,
    queryFn: () => apiRequest<SeatMap>(`/flights/${flightId}/seat-map`),
    refetchInterval: 15_000,
    staleTime: 0,
  });
}
