import { toZonedIso } from '../../common/time/zoned-time';
import type { Airline, Airport, FlightStatus } from '../../generated/prisma/client';
import type { AirportRefDto, FlightTimeDto } from './dto/flight.responses';

export const flightTime = (instant: Date, timezone: string): FlightTimeDto => ({
  utc: instant.toISOString(),
  local: toZonedIso(instant, timezone),
  timezone,
});

export const minutesBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 60_000);

const airportRef = (a: Airport): AirportRefDto => ({
  iata: a.iataCode,
  city: a.city,
  name: a.name,
});

export interface FlightHeaderSource {
  id: string;
  flightNumber: string;
  departureAt: Date;
  arrivalAt: Date;
  status: FlightStatus;
  airline: Airline;
  origin: Airport;
  destination: Airport;
  aircraft: { aircraftType: { model: string } };
}

export class FlightHeaderDto {
  id!: string;
  airline!: { code: string; name: string };
  flightNumber!: string;
  aircraft!: string;
  origin!: AirportRefDto;
  destination!: AirportRefDto;
  departure!: FlightTimeDto;
  arrival!: FlightTimeDto;
  durationMinutes!: number;
  status!: FlightStatus;
}

/** Price-independent flight description shared by flight details and bookings. */
export function toFlightHeader(f: FlightHeaderSource): FlightHeaderDto {
  return {
    id: f.id,
    airline: { code: f.airline.iataCode, name: f.airline.name },
    flightNumber: f.flightNumber,
    aircraft: f.aircraft.aircraftType.model,
    origin: airportRef(f.origin),
    destination: airportRef(f.destination),
    departure: flightTime(f.departureAt, f.origin.timezone),
    arrival: flightTime(f.arrivalAt, f.destination.timezone),
    durationMinutes: minutesBetween(f.departureAt, f.arrivalAt),
    status: f.status,
  };
}
