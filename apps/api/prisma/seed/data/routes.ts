import type { AirportCode } from './airports';

export interface RouteSpec {
  a: AirportCode;
  b: AirportCode;
  /** Block time in minutes. */
  minutes: number;
  international?: boolean;
}

/** Each route is flown in both directions. */
export const ROUTES: RouteSpec[] = [
  { a: 'DEL', b: 'BOM', minutes: 130 },
  { a: 'DEL', b: 'BLR', minutes: 170 },
  { a: 'DEL', b: 'MAA', minutes: 165 },
  { a: 'DEL', b: 'CCU', minutes: 135 },
  { a: 'DEL', b: 'HYD', minutes: 135 },
  { a: 'DEL', b: 'GOX', minutes: 150 },
  { a: 'DEL', b: 'COK', minutes: 195 },
  { a: 'DEL', b: 'AMD', minutes: 95 },
  { a: 'DEL', b: 'PNQ', minutes: 125 },
  { a: 'DEL', b: 'JAI', minutes: 60 },
  { a: 'DEL', b: 'LKO', minutes: 70 },
  { a: 'DEL', b: 'SXR', minutes: 85 },
  { a: 'DEL', b: 'ATQ', minutes: 70 },
  { a: 'DEL', b: 'IXC', minutes: 60 },
  { a: 'DEL', b: 'GAU', minutes: 150 },
  { a: 'BOM', b: 'BLR', minutes: 100 },
  { a: 'BOM', b: 'MAA', minutes: 115 },
  { a: 'BOM', b: 'HYD', minutes: 85 },
  { a: 'BOM', b: 'CCU', minutes: 160 },
  { a: 'BOM', b: 'GOX', minutes: 70 },
  { a: 'BOM', b: 'COK', minutes: 110 },
  { a: 'BOM', b: 'AMD', minutes: 70 },
  { a: 'BLR', b: 'MAA', minutes: 60 },
  { a: 'BLR', b: 'HYD', minutes: 75 },
  { a: 'BLR', b: 'CCU', minutes: 155 },
  { a: 'BLR', b: 'COK', minutes: 65 },
  { a: 'BLR', b: 'PNQ', minutes: 95 },
  { a: 'MAA', b: 'TRV', minutes: 75 },
  { a: 'CCU', b: 'GAU', minutes: 75 },
  { a: 'DEL', b: 'DXB', minutes: 220, international: true },
  { a: 'BOM', b: 'DXB', minutes: 190, international: true },
  { a: 'COK', b: 'DOH', minutes: 255, international: true },
  { a: 'DEL', b: 'DOH', minutes: 245, international: true },
  { a: 'BOM', b: 'SIN', minutes: 330, international: true },
  { a: 'BLR', b: 'SIN', minutes: 270, international: true },
  { a: 'MAA', b: 'SIN', minutes: 245, international: true },
  { a: 'DEL', b: 'BKK', minutes: 255, international: true },
  { a: 'CCU', b: 'BKK', minutes: 160, international: true },
  { a: 'DEL', b: 'KTM', minutes: 95, international: true },
  { a: 'MAA', b: 'CMB', minutes: 75, international: true },
  { a: 'DEL', b: 'LHR', minutes: 600, international: true },
  { a: 'BOM', b: 'LHR', minutes: 590, international: true },
];

/** Local departure times to pick from (origin airport time). */
export const DEPARTURE_SLOTS = ['06:10', '08:45', '11:20', '14:05', '17:35', '20:50'] as const;
