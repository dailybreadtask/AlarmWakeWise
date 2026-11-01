/**
 * Converts a local date and time in a named timezone to a UTC instant.
 * Fails when the local time does not exist (clocks go forward) or happens
 * twice (clocks go back). The planner must ask rather than guess in those cases.
 */
export type LocalToUtc = { ok: true; at: Date } | { ok: false; reason: 'nonexistent' | 'ambiguous' };

const HOUR = 3_600_000;

/** Offset in minutes of `timezone` from UTC at the instant `at`. */
function offsetMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function localToUtc(date: string, time: string, timezone: string): LocalToUtc {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hh, mm);

  // Try the offsets in force a day either side of the wall-clock time.
  const candidates = new Set<number>();
  for (const probe of [wallClock - 24 * HOUR, wallClock + 24 * HOUR]) {
    const instant = wallClock - offsetMinutes(new Date(probe), timezone) * 60_000;
    if (offsetMinutes(new Date(instant), timezone) * 60_000 + instant === wallClock) candidates.add(instant);
  }
  if (candidates.size === 0) return { ok: false, reason: 'nonexistent' };
  if (candidates.size > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, at: new Date([...candidates][0]) };
}

/** The local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDateOf(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/**
 * The earliest the person may be woken for an event: their "never wake before"
 * time on the day of the event, in the local timezone. Null when none is set.
 */
export function earliestWakeFor(eventAt: Date, earliestWake: string | null, timezone: string): Date | null {
  if (!earliestWake) return null;
  const local = localToUtc(localDateOf(eventAt, timezone), earliestWake, timezone);
  return local.ok ? local.at : null;
}

/** The next time the local clock reads hour:minute: today if still ahead, otherwise tomorrow. */
export function nextOccurrence(hour: number, minute: number, now: Date): Date {
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}
