import { describe, expect, it } from 'vitest';
import { timeAgo } from './notification-meta';

describe('timeAgo', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  it.each([
    ['2026-10-14T11:59:50Z', 'just now'],
    ['2026-10-14T11:55:00Z', '5 minutes ago'],
    ['2026-10-14T09:00:00Z', '3 hours ago'],
    ['2026-10-13T12:00:00Z', 'yesterday'],
  ])('%s → %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});
