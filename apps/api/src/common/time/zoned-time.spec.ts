import {
  offsetMinutes,
  toZonedIso,
  zonedDate,
  zonedDayRangeUtc,
  zonedTimeToUtc,
} from './zoned-time';

describe('zoned time helpers', () => {
  it('handles a fixed half-hour offset (Asia/Kolkata)', () => {
    expect(zonedTimeToUtc('2026-10-20', '06:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-20T00:30:00.000Z',
    );
    expect(offsetMinutes(new Date('2026-10-20T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });

  it('formats local ISO strings with offsets', () => {
    const instant = new Date('2026-10-20T00:30:00Z');
    expect(toZonedIso(instant, 'Asia/Kolkata')).toBe('2026-10-20T06:00:00+05:30');
    expect(toZonedIso(instant, 'Europe/London')).toBe('2026-10-20T01:30:00+01:00');
  });

  it('returns the local calendar date, which can differ from the UTC date', () => {
    expect(zonedDate(new Date('2026-10-20T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-21');
  });

  it('computes a normal 24h local day range', () => {
    const { start, end } = zonedDayRangeUtc('2026-10-20', 'Asia/Kolkata');
    expect(start.toISOString()).toBe('2026-10-19T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-20T18:30:00.000Z');
  });

  it('computes a 25h day when DST ends (Europe/London, 2026-10-25)', () => {
    const { start, end } = zonedDayRangeUtc('2026-10-25', 'Europe/London');
    expect(start.toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it('computes a 23h day when DST starts (America/New_York, 2026-03-08)', () => {
    const { start, end } = zonedDayRangeUtc('2026-03-08', 'America/New_York');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it('shifts a wall-clock time skipped by DST forward', () => {
    // 02:30 does not exist in New York on 2026-03-08.
    expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });
});
