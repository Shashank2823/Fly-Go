import { randomInt } from 'node:crypto';

/** 13-digit e-ticket number: a fixed "976" issuer prefix plus 10 random digits. */
export function newTicketNumber(): string {
  let digits = '976';
  for (let i = 0; i < 10; i++) digits += randomInt(10).toString();
  return digits;
}
