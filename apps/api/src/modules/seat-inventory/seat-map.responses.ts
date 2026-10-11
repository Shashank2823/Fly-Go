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

export class SeatMapResponse {
  flightId!: string;
  cabins!: SeatMapCabinDto[];
  seats!: SeatDto[];
  /** How long a seat hold lasts once seats are reserved. */
  holdTtlSeconds!: number;
  /** Informational snapshot; availability is re-validated when seats are held. */
  generatedAt!: string;
}
