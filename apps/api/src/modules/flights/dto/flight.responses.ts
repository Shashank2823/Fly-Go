import type { Money } from '../../../common/money/money';
import type { CabinClass, FlightStatus } from '../../../generated/prisma/client';

export class AirportRefDto {
  iata!: string;
  city!: string;
  name!: string;
}

/** An instant with its airport-local representation (docs §6.6). */
export class FlightTimeDto {
  /** ISO-8601 UTC instant. */
  utc!: string;
  /** ISO-8601 local wall-clock time with offset. */
  local!: string;
  timezone!: string;
}

export class FlightSummaryDto {
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
  cabin!: CabinClass;
  /** Per adult in a standard seat, incl. taxes and fees. Final price is computed at checkout. */
  pricePerAdult!: Money;
  /** Informational; seats are only guaranteed once held. */
  seatsAvailable!: number;
}

export class CabinOfferDto {
  cabin!: CabinClass;
  pricePerAdult!: Money;
  baseFare!: Money;
  seatsAvailable!: number;
}

export class FlightDetailDto extends FlightSummaryDto {
  cabins!: CabinOfferDto[];
}

export class PageMeta {
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
}

export class FlightSearchResponse {
  data!: FlightSummaryDto[];
  page!: PageMeta;
  /** Market the prices are quoted in. */
  market!: { code: string; currency: string };
}
