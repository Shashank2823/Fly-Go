import { assertTransition, canTransition, isTerminal } from './booking-state';

describe('booking state machine', () => {
  it.each([
    ['PENDING', 'PAYMENT_PENDING'],
    ['PENDING', 'EXPIRED'],
    ['PENDING', 'CANCELLED'],
    ['PAYMENT_PENDING', 'CONFIRMED'],
    ['PAYMENT_PENDING', 'PENDING'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['PENDING', 'CONFIRMED'], // must go through payment
    ['EXPIRED', 'PENDING'],
    ['CANCELLED', 'PENDING'],
    ['CONFIRMED', 'PENDING'],
    ['EXPIRED', 'CONFIRMED'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(/cannot move/);
  });

  it('treats expired and cancelled bookings as terminal', () => {
    expect(isTerminal('EXPIRED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
  });
});
