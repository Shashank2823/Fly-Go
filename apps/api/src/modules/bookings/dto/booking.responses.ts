import type { Money } from '../../../common/money/money';
import type {
  BookingStatus,
  CabinClass,
  PriceLineKind,
  SeatKind,
} from '../../../generated/prisma/client';
import { FlightHeaderDto } from '../../flights/flight.mapper';

export class BookingSeatDto {
  label!: string;
  cabin!: CabinClass;
  kind!: SeatKind;
  features!: string[];
}

export class PriceLineDto {
  kind!: PriceLineKind;
  code!: string;
  description!: string;
  passengerOrdinal!: number | null;
  amount!: Money;
}

export class PriceEstimateDto {
  lines!: PriceLineDto[];
  total!: Money;
  /** The binding price is computed at checkout once passenger details are known. */
  isEstimate!: true;
}

export class BookingDetailDto {
  reference!: string;
  status!: BookingStatus;
  cabin!: CabinClass;
  /** When unpaid held seats are released. Null once the hold no longer applies. */
  holdExpiresAt!: string | null;
  /** Server clock at response time, so clients can correct countdowns for skew. */
  serverTime!: string;
  passengers!: { adults: number; children: number; infants: number };
  flight!: FlightHeaderDto;
  /** Seats currently held/booked by this booking. */
  seats!: BookingSeatDto[];
  priceEstimate!: PriceEstimateDto | null;
  createdAt!: string;
}
