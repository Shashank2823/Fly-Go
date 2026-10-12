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

export class TravellerDto {
  ordinal!: number;
  type!: 'ADULT' | 'CHILD' | 'INFANT';
  firstName!: string;
  lastName!: string;
  dateOfBirth!: string;
  nationality!: string | null;
  seatLabel!: string | null;
}

export class FinalPriceDto {
  priceVersion!: number;
  lines!: PriceLineDto[];
  total!: Money;
}

export class BookingPaymentDto {
  paymentId!: string;
  status!: string;
  amount!: Money;
  failureCode!: string | null;
  succeededAt!: string | null;
}

export class BookingTicketDto {
  status!: string;
  ticketNumber!: string;
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
  /** Passenger details (empty until entered). */
  travellers!: TravellerDto[];
  contact!: { email: string | null; phone: string | null };
  /** The binding price from checkout; null until checkout (or after passengers change). */
  price!: FinalPriceDto | null;
  /** Most recent payment attempt. */
  payment!: BookingPaymentDto | null;
  ticket!: BookingTicketDto | null;
  confirmedAt!: string | null;
  createdAt!: string;
}

export class BookingSummaryDto {
  reference!: string;
  status!: BookingDetailDto['status'];
  cabin!: CabinClass;
  flight!: FlightHeaderDto;
  seats!: string[];
  travellerCount!: number;
  total!: Money | null;
  holdExpiresAt!: string | null;
  createdAt!: string;
}

export class BookingListDto {
  data!: BookingSummaryDto[];
  page!: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
