import { IsInt, Min } from 'class-validator';
import type { Money } from '../../../common/money/money';
import type { BookingStatus, PaymentStatus } from '../../../generated/prisma/client';

export class InitiatePaymentDto {
  /** The priceVersion returned by checkout; a mismatch means the price changed (409 PRICE_CHANGED). */
  @IsInt()
  @Min(1)
  priceVersion!: number;
}

export class PaymentStatusDto {
  paymentId!: string;
  status!: PaymentStatus;
  amount!: Money;
  failureCode!: string | null;
  bookingStatus!: BookingStatus;
  updatedAt!: string;
}
