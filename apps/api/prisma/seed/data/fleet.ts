import type { CabinClass, SeatKind } from '../../../src/generated/prisma/client';

/** Fictional carriers ("X" codes) — never presented as real airlines. */
export const AIRLINES = [
  { iataCode: 'XI', name: 'Indus Skyways' },
  { iataCode: 'XM', name: 'Monsoon Air' },
  { iataCode: 'XS', name: 'Saffron Airlines' },
] as const;

export interface CabinSpec {
  cabin: CabinClass;
  firstRow: number;
  lastRow: number;
  /** Seat letters left to right; "_" is an aisle. */
  columnPattern: string;
}

export interface LayoutSpec {
  model: string;
  manufacturer: string;
  name: string;
  cabins: CabinSpec[];
  /** Row → seat kind overrides (default STANDARD). */
  rowKinds: Record<number, SeatKind>;
  /** Aircraft per airline. */
  fleetSize: number;
}

export const LAYOUTS: LayoutSpec[] = [
  {
    model: 'A320neo',
    manufacturer: 'Airbus',
    name: 'A320neo — 8 Business / 168 Economy',
    cabins: [
      { cabin: 'BUSINESS', firstRow: 1, lastRow: 2, columnPattern: 'AC_DF' },
      { cabin: 'ECONOMY', firstRow: 3, lastRow: 30, columnPattern: 'ABC_DEF' },
    ],
    rowKinds: { 3: 'EXTRA_LEGROOM', 4: 'EXTRA_LEGROOM', 12: 'EXIT_ROW', 13: 'EXIT_ROW' },
    fleetSize: 8,
  },
  {
    model: '787-9',
    manufacturer: 'Boeing',
    name: '787-9 — 30 Business / 261 Economy',
    cabins: [
      { cabin: 'BUSINESS', firstRow: 1, lastRow: 5, columnPattern: 'AC_DF_HK' },
      { cabin: 'ECONOMY', firstRow: 10, lastRow: 38, columnPattern: 'ABC_DEF_GHK' },
    ],
    rowKinds: { 10: 'EXTRA_LEGROOM', 11: 'EXTRA_LEGROOM', 24: 'EXIT_ROW' },
    fleetSize: 3,
  },
];

/** Expands a cabin pattern into seats with WINDOW/AISLE features. */
export function seatsForCabin(spec: CabinSpec, rowKinds: Record<number, SeatKind>) {
  const chars = spec.columnPattern.split('');
  const letters = chars.filter((c) => c !== '_');
  const seats: {
    rowNumber: number;
    columnLetter: string;
    cabin: CabinClass;
    kind: SeatKind;
    features: string[];
  }[] = [];
  for (let row = spec.firstRow; row <= spec.lastRow; row++) {
    chars.forEach((c, i) => {
      if (c === '_') return;
      const features: string[] = [];
      if (c === letters[0] || c === letters[letters.length - 1]) features.push('WINDOW');
      if (chars[i - 1] === '_' || chars[i + 1] === '_') features.push('AISLE');
      seats.push({
        rowNumber: row,
        columnLetter: c,
        cabin: spec.cabin,
        kind: rowKinds[row] ?? 'STANDARD',
        features,
      });
    });
  }
  return seats;
}
