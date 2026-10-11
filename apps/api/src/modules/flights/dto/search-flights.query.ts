import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { TrimUpper } from '../../../common/validation/transforms';
import { CabinClass } from '../../../generated/prisma/client';

export const FLIGHT_SORTS = ['price', 'departure', 'duration'] as const;
export type FlightSort = (typeof FLIGHT_SORTS)[number];

export class SearchFlightsQuery {
  /** Origin airport IATA code. */
  @TrimUpper()
  @Matches(/^[A-Z]{3}$/, { message: 'from must be a 3-letter IATA code' })
  from!: string;

  /** Destination airport IATA code. */
  @TrimUpper()
  @Matches(/^[A-Z]{3}$/, { message: 'to must be a 3-letter IATA code' })
  to!: string;

  /** Departure date (YYYY-MM-DD) in the origin airport's local time. */
  @IsDateString({ strict: true }, { message: 'date must be YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  /** Passengers needing a seat (adults + children). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  passengers: number = 1;

  @IsOptional()
  @TrimUpper()
  @IsEnum(CabinClass)
  cabin: CabinClass = CabinClass.ECONOMY;

  @IsOptional()
  @IsIn(FLIGHT_SORTS)
  sort: FlightSort = 'departure';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}
