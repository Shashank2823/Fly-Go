import { describe, expect, it } from 'vitest';
import {
  addMoney,
  dayOffset,
  formatDuration,
  formatMoney,
  localTime,
  passengerSummary,
  shiftDate,
} from './format';

describe('formatMoney', () => {
  it('formats INR with Indian digit grouping and hides zero paise', () => {
    expect(formatMoney({ amountMinor: '12345600', currency: 'INR' })).toBe('₹1,23,456');
  });
  it('shows paise when present', () => {
    expect(formatMoney({ amountMinor: '898550', currency: 'INR' })).toBe('₹8,985.50');
  });
  it('adds minor-unit amounts exactly', () => {
    expect(
      addMoney(
        [
          { amountMinor: '10', currency: 'INR' },
          { amountMinor: '20', currency: 'INR' },
        ],
        'INR',
      ),
    ).toEqual({
      amountMinor: '30',
      currency: 'INR',
    });
  });
});

describe('time helpers', () => {
  it('reads the airport-local wall clock regardless of browser timezone', () => {
    expect(localTime('2026-10-15T14:15:00+01:00')).toBe('14:15');
  });
  it('detects overnight arrivals', () => {
    expect(dayOffset('2026-10-15T22:30:00+05:30', '2026-10-16T01:10:00+04:00')).toBe(1);
    expect(dayOffset('2026-10-15T08:45:00+05:30', '2026-10-15T14:15:00+01:00')).toBe(0);
  });
  it('formats durations', () => {
    expect(formatDuration(130)).toBe('2h 10m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(600)).toBe('10h 00m');
  });
  it('shifts dates across month ends', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('passengerSummary', () => {
  it('pluralises', () => {
    expect(passengerSummary({ adults: 2, children: 1, infants: 1 })).toBe(
      '2 adults, 1 child, 1 infant',
    );
  });
});
