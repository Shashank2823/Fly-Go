import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money/money';
import { zonedDayRangeUtc } from '../../common/time/zoned-time';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { AirportsRepository } from '../airports/airports.repository';
import { MarketsService } from '../markets/markets.service';
import { perAdultPrice } from '../pricing/price-calculator';
import type { FlightDetailDto, FlightSearchResponse } from './dto/flight.responses';
import type { SearchFlightsQuery } from './dto/search-flights.query';
import { flightTime as time, minutesBetween, toFlightHeader } from './flight.mapper';
import { BOOKING_CUTOFF_MINUTES, FlightsRepository } from './flights.repository';

const SEARCH_CACHE_SECONDS = 30;
const MAX_DAYS_AHEAD = 365;
const CABIN_ORDER = ['FIRST', 'BUSINESS', 'PREMIUM_ECONOMY', 'ECONOMY'] as const;

/**
 * Flight search and details. Prices are quoted in the caller's market (nationality, or the
 * default market for anonymous visitors) and are indicative until checkout.
 */
@Injectable()
export class FlightsService {
  constructor(
    private readonly flights: FlightsRepository,
    private readonly airports: AirportsRepository,
    private readonly markets: MarketsService,
    private readonly cache: CacheService,
  ) {}

  async search(q: SearchFlightsQuery, user?: AuthenticatedUser): Promise<FlightSearchResponse> {
    if (q.from === q.to) {
      throw new AppError(
        'SAME_AIRPORTS',
        HttpStatus.BAD_REQUEST,
        'Origin and destination must differ',
        undefined,
        [{ field: 'to', message: 'Destination must differ from origin' }],
      );
    }
    const airports = await this.airports.findByIata([q.from, q.to]);
    const origin = airports.find((a) => a.iataCode === q.from);
    const destination = airports.find((a) => a.iataCode === q.to);
    if (!origin || !destination) {
      throw new AppError(
        'AIRPORT_NOT_FOUND',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Unknown airport code',
        {
          unknown: [q.from, q.to].filter((c) => !airports.some((a) => a.iataCode === c)),
        },
      );
    }

    const { start, end } = zonedDayRangeUtc(q.date, origin.timezone);
    const now = Date.now();
    if (end.getTime() <= now + BOOKING_CUTOFF_MINUTES * 60_000) {
      throw new AppError(
        'DATE_IN_PAST',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Choose a date from today onwards',
        undefined,
        [{ field: 'date', message: 'Choose a date from today onwards' }],
      );
    }
    if (start.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) {
      throw new AppError(
        'DATE_TOO_FAR',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Flights can be searched up to ${MAX_DAYS_AHEAD} days ahead`,
      );
    }

    const market = await this.markets.resolve(user?.nationality);
    const cacheKey = CacheService.key('flight-search', { ...q, market: market.code });

    return this.cache.wrap(cacheKey, SEARCH_CACHE_SECONDS, async () => {
      const rules = await this.markets.activeRules(market.code);
      const rows = await this.flights.search({
        originId: origin.id,
        destinationId: destination.id,
        start,
        end,
        cabin: q.cabin,
        marketCode: market.code,
        seatsNeeded: q.passengers,
        sort: q.sort,
        order: q.order,
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      });
      const totalItems = rows.length ? Number(rows[0]!.total) : 0;

      return {
        data: rows.map((r) => ({
          id: r.id,
          airline: { code: r.airline_code, name: r.airline_name },
          flightNumber: r.flight_number,
          aircraft: r.aircraft_model,
          origin: { iata: origin.iataCode, city: origin.city, name: origin.name },
          destination: {
            iata: destination.iataCode,
            city: destination.city,
            name: destination.name,
          },
          departure: time(r.departure_at, origin.timezone),
          arrival: time(r.arrival_at, destination.timezone),
          durationMinutes: minutesBetween(r.departure_at, r.arrival_at),
          status: r.status,
          cabin: q.cabin,
          pricePerAdult: toMoney(perAdultPrice(r.base_fare_minor, rules), r.currency),
          seatsAvailable: r.seats_available,
        })),
        page: {
          page: q.page,
          pageSize: q.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / q.pageSize),
        },
        market,
      };
    });
  }

  async detail(id: string, user?: AuthenticatedUser): Promise<FlightDetailDto> {
    const flight = await this.flights.findDetail(id);
    if (!flight) throw new AppError('FLIGHT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Flight not found');

    const market = await this.markets.resolve(user?.nationality);
    const [fares, available, rules] = await Promise.all([
      this.flights.faresFor(id, market.code),
      this.flights.availableByCabin(id),
      this.markets.activeRules(market.code),
    ]);

    const cabins = fares
      .filter((f) => flight.seatLayout.cabins.some((c) => c.cabin === f.cabin))
      .sort((a, b) => CABIN_ORDER.indexOf(a.cabin) - CABIN_ORDER.indexOf(b.cabin))
      .map((f) => ({
        cabin: f.cabin,
        baseFare: toMoney(f.baseFareMinor, f.currency),
        pricePerAdult: toMoney(perAdultPrice(f.baseFareMinor, rules), f.currency),
        seatsAvailable: available.get(f.cabin) ?? 0,
      }));
    const economy = cabins.find((c) => c.cabin === 'ECONOMY') ?? cabins[cabins.length - 1];
    if (!economy) throw new AppError('FLIGHT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Flight not found');

    return {
      ...toFlightHeader(flight),
      cabin: economy.cabin,
      pricePerAdult: economy.pricePerAdult,
      seatsAvailable: economy.seatsAvailable,
      cabins,
    };
  }
}
