import type { Money } from '../../../common/money/money';
import { PriceLineDto } from './booking.responses';

export class CheckoutDto {
  /** Send this back when paying; it changes whenever the price is recomputed differently. */
  priceVersion!: number;
  lines!: PriceLineDto[];
  total!: Money;
  holdExpiresAt!: string;
  serverTime!: string;
}
