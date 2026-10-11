import { isBookingReference, newBookingReference, REFERENCE_ALPHABET } from './booking-reference';

describe('booking references', () => {
  it('generates 6-char references that satisfy the database constraint', () => {
    for (let i = 0; i < 2_000; i++) expect(isBookingReference(newBookingReference())).toBe(true);
  });

  it('never uses ambiguous characters', () => {
    expect(REFERENCE_ALPHABET).not.toMatch(/[01IO]/);
    expect(REFERENCE_ALPHABET).toHaveLength(32);
  });

  it('rejects malformed references', () => {
    for (const bad of ['K7QX2', 'K7QX2MM', 'k7qx2m', 'O0I1LL', 'K7QX-M'])
      expect(isBookingReference(bad)).toBe(false);
  });
});
