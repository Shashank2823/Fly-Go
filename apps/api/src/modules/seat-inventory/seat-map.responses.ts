import type { Money } from '../../common/money/money';
import type { CabinClass, SeatKind } from '../../generated/prisma/client';

/** Seat state as seen by the viewer. Expired holds are reported as AVAILABLE. */
export type ViewerSeatState = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED' | 'HELD_BY_YOU';

export class SeatMapCabinDto {
  cabin!: CabinClass;
  firstRow!: number;
  lastRow!: number;
  /** Seat letters left to right; null marks an aisle. */
  columns!: (string | null)[];
}

export class SeatDto {
  label!: string;
  row!: number;
  column!: string;
  cabin!: CabinClass;
  kind!: SeatKind;
  features!: string[];
  state!: ViewerSeatState;
  /** Extra charge for this seat in the viewer's market; null for standard seats. */
  surcharge!: Money | null;
}

/** A booking of the viewer's that currently holds seats on this flight. */
export class YourHoldDto {
  reference!: string;
  status!: 'PENDING' | 'PAYMENT_PENDING';
  seats!: string[];
  holdExpiresAt!: string;
}

export class SeatMapResponse {
  flightId!: string;
  cabins!: SeatMapCabinDto[];
  seats!: SeatDto[];
  /** Signed-in viewer's own active holds on this flight (empty for visitors). */
  yourHolds!: YourHoldDto[];
  /** How long a seat hold lasts once seats are reserved. */
  holdTtlSeconds!: number;
  /** Informational snapshot; availability is re-validated when seats are held. */
  generatedAt!: string;
}
