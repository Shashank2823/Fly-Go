import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type CabinClass, type FlightStatus } from '../../generated/prisma/client';
import type { FlightSort } from './dto/search-flights.query';

/** Flights departing sooner than this cannot be booked. */
export const BOOKING_CUTOFF_MINUTES = 60;

export interface FlightSearchRow {
  id: string;
  flight_number: string;
  departure_at: Date;
  arrival_at: Date;
  status: FlightStatus;
  airline_code: string;
  airline_name: string;
  aircraft_model: string;
  base_fare_minor: bigint;
  currency: string;
  seats_available: number;
  total: bigint;
}

export interface FlightSearchParams {
  originId: string;
  destinationId: string;
  start: Date;
  end: Date;
  cabin: CabinClass;
  marketCode: string;
  seatsNeeded: number;
  sort: FlightSort;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** Seats that are free right now — expired holds count as free (docs §9.4). */
const AVAILABLE_SEAT = Prisma.sql`(s.status = 'AVAILABLE' OR (s.status = 'HELD' AND s.hold_expires_at < now()))`;

@Injectable()
export class FlightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  search(p: FlightSearchParams): Promise<FlightSearchRow[]> {
    // Whitelisted sort expressions only — never interpolate user input into ORDER BY.
    const sortExpr = {
      price: Prisma.sql`ff.base_fare_minor`,
      departure: Prisma.sql`f.departure_at`,
      duration: Prisma.sql`(f.arrival_at - f.departure_at)`,
    }[p.sort];
    const direction = p.order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    return this.prisma.$queryRaw<FlightSearchRow[]>`
      SELECT f.id, f.flight_number, f.departure_at, f.arrival_at, f.status,
             al.iata_code AS airline_code, al.name AS airline_name, aty.model AS aircraft_model,
             ff.base_fare_minor, ff.currency, avail.n AS seats_available,
             COUNT(*) OVER () AS total
      FROM flights f
      JOIN airlines al ON al.id = f.airline_id
      JOIN aircraft ac ON ac.id = f.aircraft_id
      JOIN aircraft_types aty ON aty.id = ac.aircraft_type_id
      JOIN flight_fares ff ON ff.flight_id = f.id
                          AND ff.cabin = ${p.cabin}::cabin_class
                          AND ff.market_code = ${p.marketCode}
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM flight_seats s
        WHERE s.flight_id = f.id AND s.cabin = ${p.cabin}::cabin_class AND ${AVAILABLE_SEAT}
      ) avail
      WHERE f.origin_airport_id = ${p.originId}::uuid
        AND f.destination_airport_id = ${p.destinationId}::uuid
        AND f.departure_at >= ${p.start} AND f.departure_at < ${p.end}
        AND f.departure_at > now() + make_interval(mins => ${BOOKING_CUTOFF_MINUTES})
        AND f.status IN ('SCHEDULED', 'DELAYED')
        AND avail.n >= ${p.seatsNeeded}
      ORDER BY ${sortExpr} ${direction}, f.departure_at ASC, f.id ASC
      LIMIT ${p.limit} OFFSET ${p.offset}`;
  }

  findDetail(id: string) {
    return this.prisma.flight.findUnique({
      where: { id },
      include: {
        airline: true,
        origin: true,
        destination: true,
        aircraft: { include: { aircraftType: true } },
        seatLayout: { include: { cabins: { orderBy: { firstRow: 'asc' } } } },
      },
    });
  }

  faresFor(flightId: string, marketCode: string) {
    return this.prisma.flightFare.findMany({ where: { flightId, marketCode } });
  }

  async availableByCabin(flightId: string): Promise<Map<CabinClass, number>> {
    const rows = await this.prisma.$queryRaw<{ cabin: CabinClass; n: number }[]>`
      SELECT s.cabin, COUNT(*)::int AS n FROM flight_seats s
      WHERE s.flight_id = ${flightId}::uuid AND ${AVAILABLE_SEAT}
      GROUP BY s.cabin`;
    return new Map(rows.map((r) => [r.cabin, r.n]));
  }
}
