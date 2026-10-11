/**
 * Timezone helpers built on Intl (no dependencies). All instants are stored in UTC;
 * airports carry an IANA timezone used for display and for interpreting local dates.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. +330 for Asia/Kolkata). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Converts a local wall-clock time in `timeZone` to the UTC instant. For times skipped by a
 * DST transition the result is shifted forward, matching common airline scheduling practice.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Offsets either side of a possible DST transition give at most two candidates.
  const first = naiveUtc - offsetMinutes(new Date(naiveUtc), timeZone) * 60_000;
  const second = naiveUtc - offsetMinutes(new Date(first), timeZone) * 60_000;
  const candidates = [...new Set([first, second])].sort((a, b) => a - b);
  const matches = candidates.filter((c) => {
    const w = wallClock(new Date(c), timeZone);
    return w.year === y && w.month === m && w.day === d && w.hour === hh && w.minute === mm;
  });
  // Ambiguous (fall back): earliest occurrence. Non-existent (spring forward): shift forward.
  return new Date(matches[0] ?? candidates[candidates.length - 1]!);
}

/** UTC [start, end) of the calendar day `date` (YYYY-MM-DD) in `timeZone`. Handles 23h/25h days. */
export function zonedDayRangeUtc(date: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return {
    start: zonedTimeToUtc(date, '00:00', timeZone),
    end: zonedTimeToUtc(next, '00:00', timeZone),
  };
}

const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, '0');

/** ISO-8601 local time with offset, e.g. 2026-10-20T06:00:00+05:30. */
export function toZonedIso(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  const off = offsetMinutes(instant, timeZone);
  const sign = off >= 0 ? '+' : '-';
  return (
    `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}` +
    `${sign}${pad(Math.trunc(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** Calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function zonedDate(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}
