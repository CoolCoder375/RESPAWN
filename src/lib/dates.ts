// Dates are handled as local calendar days ("YYYY-MM-DD") in the user's timezone.
// The client computes "today" and sends it with writes, so the daily reset needs no server cron.

export const SEASON_LENGTH = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The device's IANA timezone, e.g. "Asia/Kolkata". */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The local calendar day for `date` in `timezone`, as "YYYY-MM-DD". */
export function localDay(timezone: string, date: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Shift a "YYYY-MM-DD" day by `delta` days. */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The "Day X" number of the season: 1 on the start day.
 * Can be < 1 (season not started) or > SEASON_LENGTH (season finished); callers decide how to show it.
 */
export function dayOfSeason(seasonStart: string, today: string): number {
  return daysBetween(seasonStart, today) + 1;
}
