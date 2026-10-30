/**
 * Deterministic check on the model's clock times. A bare hour, with no a.m.,
 * p.m. or a part-of-day word, could mean either half of the day. The person
 * may not have said which, so the app assumes the likely one and marks it as
 * an assumption they can change: morning for 5 to 11 (early alarms), evening for 1 to 4.
 */
import type { Interpretation } from '../src/domain/interpretation';

const BARE_HOUR = /\b(?:at|by|for|till|until|before|after|around|to|it)\s+(\d{1,2})(?::(\d{2}))?(?![\d:])(?![a-z])(?!\s*(?:a\.?m\.?|p\.?m\.?)\b)(?!\s*(?:hours?|hrs?|minutes?|mins?|days?|weeks?|seconds?)\b)/gi;
const PART_OF_DAY = /\b(tonight|tonite|evening|afternoon|morning|night|noon|midnight)\b/i;

/** Bare hours in the text that could be a.m. or p.m. A part-of-day word settles the matter. */
export function ambiguousHours(text: string): Set<number> {
  const hours = new Set<number>();
  if (PART_OF_DAY.test(text)) return hours;
  for (const m of text.matchAll(BARE_HOUR)) {
    const hour = Number(m[1]);
    if (hour >= 1 && hour <= 11) hours.add(hour);
  }
  return hours;
}

/** The assumed 24-hour time for a bare hour: morning for 5 to 11, evening for 1 to 4. */
export function assumedHour(hour: number): number {
  return hour >= 5 ? hour : hour + 12;
}

/** The 24-hour times a bare-hour phrase implies under the assumption rule, e.g. "at 6:30" gives 06:30 (morning). */
export function assumedClocks(text: string): string[] {
  if (PART_OF_DAY.test(text)) return [];
  const out: string[] = [];
  for (const m of text.matchAll(BARE_HOUR)) {
    const hour = Number(m[1]);
    if (hour < 1 || hour > 11) continue;
    out.push(`${String(assumedHour(hour)).padStart(2, '0')}:${m[2] ?? '00'}`);
  }
  return out;
}

/** Applies the assumption to a stated time that could be a.m. or p.m., and marks it. */
export function guardClockTimes(text: string, value: Interpretation): Interpretation {
  const ambiguous = ambiguousHours(text);
  if (ambiguous.size === 0) return value;
  const commitments = value.commitments.map((c) => {
    const time = c.deadline.time;
    if (!time) return c;
    // The rule decides the half of the day for a bare hour, whatever the model chose.
    const hour = Number(time.slice(0, 2));
    const bareHour = [...ambiguous].find((h) => h % 12 === hour % 12);
    if (bareHour === undefined) return c;
    const adjusted = `${String(assumedHour(bareHour)).padStart(2, '0')}${time.slice(2)}`;
    return { ...c, deadline: { ...c.deadline, time: adjusted, timeAssumed: true } };
  });
  return { ...value, commitments };
}
