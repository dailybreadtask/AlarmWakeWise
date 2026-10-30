/**
 * Checks a saved train journey against the live board. Pure logic: it decides
 * whether the journey still works, and if not, which later train does. It never
 * moves an alarm. A change is only ever a proposal the person approves.
 */
import type { BoardDeparture } from '../domain/railJourney';
import { instantFor } from '../domain/railJourney';

export interface SavedJourney {
  trainId: string;
  /** The train's scheduled departure from the origin, as an instant. */
  departsAt: Date;
  /** Arrival at the destination that the plan was built for, as an instant. */
  arrivesAt: Date;
  /** Latest time the person must arrive, before any spare time. */
  deadlineAt: Date;
  /** Minutes from waking to leaving the house, including getting ready and the walk. */
  leaveAfterWakeMinutes: number;
  bufferMinutes: number;
  /** Earliest the person may be woken. */
  earliestWakeAt: Date | null;
  wakeAt: Date;
  timezone: string;
}

export type JourneyStatus = 'on_time' | 'delayed_still_ok' | 'at_risk' | 'cancelled' | 'not_on_board';

export interface WakeAlternative {
  trainId: string;
  departsAt: Date;
  arrivesAt: Date;
  /** The wake time that would catch this train. */
  wakeAt: Date;
}

export interface JourneyAssessment {
  status: JourneyStatus;
  /** Expected departure of the planned train, when the feed gives one. */
  expectedDepartAt: Date | null;
  /** Later trains that still make the deadline, with the wake time each needs. Empty when none do. */
  alternatives: WakeAlternative[];
  /** A proposal exists only when the journey needs a change and an alternative works. */
  proposal: WakeAlternative | null;
}

const departureOf = (d: BoardDeparture, tz: string) => instantFor(d.serviceDate, d.expected === 'On time' ? d.scheduled : /^\d\d:\d\d$/.test(d.expected) ? d.expected : null, tz);

export function assessJourney(journey: SavedJourney, board: BoardDeparture[], now: Date): JourneyAssessment {
  const latestArrival = new Date(journey.deadlineAt.getTime() - journey.bufferMinutes * 60_000);
  const mine = board.find((d) => d.trainId === journey.trainId);
  const alternativesFor = (exclude: string) => {
    const earliestDepart = new Date(now.getTime() + journey.leaveAfterWakeMinutes * 60_000);
    return board
      .filter((d) => d.trainId !== exclude)
      .flatMap((d) => {
        const dep = departureOf(d, journey.timezone);
        const arr = instantFor(d.serviceDate, d.arrivesExpected === 'On time' ? d.arrivesScheduled : d.arrivesExpected, journey.timezone);
        if (!dep || !arr || d.status === 'Cancelled' || d.expected === 'Cancelled') return [];
        if (arr > latestArrival || dep < earliestDepart) return [];
        const wakeAt = new Date(dep.getTime() - journey.leaveAfterWakeMinutes * 60_000);
        if (journey.earliestWakeAt && wakeAt < journey.earliestWakeAt) return [];
        return [{ trainId: d.trainId, departsAt: dep, arrivesAt: arr, wakeAt }];
      })
      .sort((a, b) => b.departsAt.getTime() - a.departsAt.getTime());
  };

  if (!mine) {
    // Not on the board: unknown, so say so. Do not guess.
    return { status: 'not_on_board', expectedDepartAt: null, alternatives: [], proposal: null };
  }
  if (mine.expected === 'Cancelled' || mine.status === 'Cancelled') {
    const alternatives = alternativesFor(journey.trainId);
    const proposal = alternatives.find((a) => a.wakeAt.getTime() !== journey.wakeAt.getTime()) ?? null;
    return { status: 'cancelled', expectedDepartAt: null, alternatives, proposal };
  }

  const expectedDepart = departureOf(mine, journey.timezone);
  const expectedArrive = instantFor(mine.serviceDate, mine.arrivesExpected === 'On time' ? mine.arrivesScheduled : mine.arrivesExpected, journey.timezone);
  if (!expectedDepart || !expectedArrive) {
    return { status: 'not_on_board', expectedDepartAt: null, alternatives: [], proposal: null };
  }
  if (expectedArrive <= latestArrival) {
    const late = expectedDepart.getTime() > journey.departsAt.getTime();
    return { status: late ? 'delayed_still_ok' : 'on_time', expectedDepartAt: expectedDepart, alternatives: [], proposal: null };
  }
  const alternatives = alternativesFor(journey.trainId);
  const proposal = alternatives[0] ?? null;
  return { status: 'at_risk', expectedDepartAt: expectedDepart, alternatives, proposal };
}

