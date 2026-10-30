import { localToUtc } from './time';

/** One departure from the live rail board, as the server returns it. */
export interface BoardDeparture {
  trainId: string;
  serviceDate: string | null;
  scheduled: string;
  /** "On time", "HH:mm" when the feed expects a different time, "Delayed" or "Cancelled". */
  expected: string;
  arrivesScheduled: string | null;
  arrivesExpected: string | null;
  status: string;
  platform: string | null;
}

export interface JourneyChoice {
  trainId: string;
  departsAt: Date;
  arrivesAt: Date;
  platform: string | null;
  status: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The clock time to use for a train event. "On time" means the scheduled time;
 * an HH:mm means the feed's expected time. Anything else is not known, so null.
 */
function clockFor(scheduled: string | null, reported: string | null): string | null {
  if (reported === 'On time') return scheduled && HHMM.test(scheduled) ? scheduled : null;
  if (reported && HHMM.test(reported)) return reported;
  return null;
}

/** Converts a board time into an instant, using the train's service date and the local timezone. */
export function instantFor(serviceDate: string | null, clock: string | null, timezone: string): Date | null {
  if (!serviceDate || !clock) return null;
  const local = localToUtc(serviceDate, clock, timezone);
  return local.ok ? local.at : null;
}

/**
 * The latest train that reaches the destination in time. Latest, so the wake
 * time is as late as the journey allows. Trains with unknown or cancelled times
 * are skipped rather than guessed.
 */
export function chooseTrain(
  departures: BoardDeparture[],
  options: { deadlineAt: Date; bufferMinutes: number; earliestDepartAt: Date; timezone: string },
): JourneyChoice | null {
  const latestArrival = new Date(options.deadlineAt.getTime() - options.bufferMinutes * 60_000);
  let best: JourneyChoice | null = null;
  for (const d of departures) {
    if (d.status === 'Cancelled' || d.expected === 'Cancelled' || d.expected === 'Delayed') continue;
    const departsAt = instantFor(d.serviceDate, clockFor(d.scheduled, d.expected), options.timezone);
    const arrivesAt = instantFor(d.serviceDate, clockFor(d.arrivesScheduled, d.arrivesExpected), options.timezone);
    if (!departsAt || !arrivesAt) continue;
    if (arrivesAt > latestArrival || departsAt < options.earliestDepartAt) continue;
    if (!best || departsAt > best.departsAt) best = { trainId: d.trainId, departsAt, arrivesAt, platform: d.platform, status: d.status };
  }
  return best;
}
