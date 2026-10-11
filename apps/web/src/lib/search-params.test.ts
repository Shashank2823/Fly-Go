import { describe, expect, it } from 'vitest';
import { parseSearch, toSearchParams } from './search-params';

describe('flight search params', () => {
  it('round-trips a search through the URL', () => {
    const search = {
      from: 'DEL',
      to: 'BOM',
      date: '2026-10-20',
      adults: 2,
      children: 1,
      infants: 1,
      cabin: 'BUSINESS',
      sort: 'price',
      page: 2,
    } as const;
    expect(parseSearch(toSearchParams(search))).toEqual(search);
  });

  it('applies defaults and normalises codes', () => {
    expect(parseSearch(new URLSearchParams('from=del&to=bom&date=2026-10-20'))).toMatchObject({
      from: 'DEL',
      to: 'BOM',
      adults: 1,
      children: 0,
      infants: 0,
      cabin: 'ECONOMY',
      sort: 'departure',
      page: 1,
    });
  });

  it('rejects missing or contradictory essentials', () => {
    expect(parseSearch(new URLSearchParams('from=DEL&date=2026-10-20'))).toBeNull();
    expect(parseSearch(new URLSearchParams('from=DEL&to=DEL&date=2026-10-20'))).toBeNull();
    expect(
      parseSearch(new URLSearchParams('from=DEL&to=BOM&date=2026-10-20&adults=5&children=5')),
    ).toBeNull();
  });

  it('caps infants at the number of adults and ignores junk values', () => {
    expect(
      parseSearch(new URLSearchParams('from=DEL&to=BOM&date=2026-10-20&infants=4&cabin=CARGO')),
    ).toMatchObject({
      infants: 1,
      cabin: 'ECONOMY',
    });
  });
});
