import type { Seat } from '../../api/flights';
import { formatMoney } from '../../lib/format';

export type SeatVisual =
  'selected' | 'available' | 'held' | 'mine' | 'booked' | 'blocked' | 'other-cabin';

export function seatVisual(seat: Seat, selected: boolean, cabin: string): SeatVisual {
  if (selected) return 'selected';
  if (seat.cabin !== cabin) return 'other-cabin';
  switch (seat.state) {
    case 'AVAILABLE':
      return 'available';
    case 'HELD':
      return 'held';
    case 'HELD_BY_YOU':
      return 'mine';
    case 'BOOKED':
      return 'booked';
    default:
      return 'blocked';
  }
}

export const isSelectable = (seat: Seat, cabin: string) =>
  seat.cabin === cabin && seat.state === 'AVAILABLE';

const STATE_TEXT: Record<SeatVisual, string> = {
  selected: 'selected',
  available: 'available',
  held: 'temporarily held by another traveller',
  mine: 'held by you in another booking',
  booked: 'booked',
  blocked: 'unavailable',
  'other-cabin': 'in a different cabin',
};

/** Screen-reader description, e.g. "Seat 12A, window, extra legroom, available, ₹2,000 extra". */
export function seatAriaLabel(seat: Seat, visual: SeatVisual): string {
  const parts = [`Seat ${seat.label}`];
  if (seat.features.includes('WINDOW')) parts.push('window');
  if (seat.features.includes('AISLE')) parts.push('aisle');
  if (seat.kind === 'EXTRA_LEGROOM') parts.push('extra legroom');
  if (seat.kind === 'EXIT_ROW') parts.push('exit row');
  parts.push(STATE_TEXT[visual]);
  if (seat.surcharge && (visual === 'available' || visual === 'selected'))
    parts.push(`${formatMoney(seat.surcharge)} extra`);
  return parts.join(', ');
}
