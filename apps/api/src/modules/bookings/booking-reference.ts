import { randomInt } from 'node:crypto';

/** Unambiguous alphabet (no 0/O, 1/I); matches the bookings_reference_chk constraint. */
export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_LENGTH = 6;

/** Cryptographically random 6-char reference (~1.07 billion combinations). */
export function newBookingReference(): string {
  let ref = '';
  for (let i = 0; i < REFERENCE_LENGTH; i++)
    ref += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return ref;
}

export const isBookingReference = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);
