import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AirportRow {
  iata_code: string;
  name: string;
  city: string;
  country_code: string;
  timezone: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class AirportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Exact IATA match first, then city prefix, then fuzzy (pg_trgm) name/city matches. */
  search(q: string, limit: number): Promise<AirportRow[]> {
    const like = escapeLike(q);
    return this.prisma.$queryRaw<AirportRow[]>`
      SELECT iata_code, name, city, country_code, timezone
      FROM airports
      WHERE iata_code = upper(${q})
         OR city ILIKE ${like + '%'}
         OR name ILIKE ${'%' + like + '%'}
         OR city % ${q}
      ORDER BY (iata_code = upper(${q})) DESC,
               (city ILIKE ${like + '%'}) DESC,
               similarity(city, ${q}) DESC,
               iata_code
      LIMIT ${limit}`;
  }

  list(): Promise<AirportRow[]> {
    return this.prisma.$queryRaw<AirportRow[]>`
      SELECT iata_code, name, city, country_code, timezone FROM airports ORDER BY city, iata_code`;
  }

  findByIata(codes: string[]) {
    return this.prisma.airport.findMany({ where: { iataCode: { in: codes } } });
  }
}
