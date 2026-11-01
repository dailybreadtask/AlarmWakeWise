/**
 * Watches saved journeys against the live rail feed and tells the person when something changed. It only ever
 * sends a push: moving the alarm stays the person's decision, made in the app. One push per change, not one per check.
 */
import { assessJourney, type JourneyAssessment, type SavedJourney } from '../src/journey/journeyCheck';
import type { BoardDeparture } from '../src/domain/railJourney';
import type { PushPayload, PushResult, PushTarget } from './push';
import type { ActiveWatch, WatchStore } from './watchStore';

const clock = (at: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at);

/** A journey is over once its deadline has passed, with an allowance for late running. */
const OVER_AFTER_MS = 2 * 60 * 60_000;

export const savedJourneyOf = (w: ActiveWatch): SavedJourney => ({
  trainId: w.trainId,
  departsAt: new Date(w.departsAt),
  arrivesAt: new Date(w.arrivesAt),
  deadlineAt: new Date(w.deadlineAt),
  leaveAfterWakeMinutes: w.leaveAfterWakeMinutes,
  bufferMinutes: w.bufferMinutes,
  earliestWakeAt: w.earliestWakeAt ? new Date(w.earliestWakeAt) : null,
  wakeAt: new Date(w.wakeAt),
  timezone: w.timezone,
});

/**
 * The words of a push, or null when nothing needs the person's attention. A delay that still works needs nothing.
 * The message says what changed and what is on offer, and that nothing has moved yet.
 */
export function alertFor(assessment: JourneyAssessment, journey: SavedJourney): PushPayload | null {
  const tz = journey.timezone;
  const train = clock(journey.departsAt, tz);
  const { status, proposal } = assessment;
  if (status !== 'at_risk' && status !== 'cancelled') return null;
  const what = status === 'cancelled' ? `Your ${train} train is cancelled.` : `Your ${train} train is running late.`;
  const title = status === 'cancelled' ? 'Your train is cancelled' : 'Your train is delayed';
  if (proposal) {
    return {
      title,
      body: `${what} The ${clock(proposal.departsAt, tz)} still gets you there if you wake at ${clock(proposal.wakeAt, tz)}. Open WakeWise to approve the change. Your alarm has not moved.`,
      data: { kind: 'journey' },
    };
  }
  return { title, body: `${what} No later train gets you there in time. Open WakeWise to see your options. Your alarm has not moved.`, data: { kind: 'journey' } };
}

export interface CycleDeps {
  store: WatchStore;
  /** The live departures from one station to another, or null when the feed cannot answer. */
  board: (fromCrs: string, toCrs: string) => BoardDeparture[] | null;
  push: (target: PushTarget, payload: PushPayload) => Promise<PushResult>;
  now: Date;
}

export interface CycleResult {
  checked: number;
  notified: number;
  finished: number;
}

/** One pass over every active watch. Safe to run often: a push is sent only when the status changes into one that needs attention. */
export async function runWatchCycle(deps: CycleDeps): Promise<CycleResult> {
  const { store, board, push, now } = deps;
  const result: CycleResult = { checked: 0, notified: 0, finished: 0 };
  for (const watch of await store.activeWatches()) {
    if (now.getTime() > new Date(watch.deadlineAt).getTime() + OVER_AFTER_MS) {
      await store.finishWatch(watch.id);
      result.finished++;
      continue;
    }
    const departures = board(watch.fromCrs, watch.toCrs);
    if (!departures) continue;
    const journey = savedJourneyOf(watch);
    const assessment = assessJourney(journey, departures, now);
    result.checked++;

    const alert = alertFor(assessment, journey);
    if (!alert) {
      // Back to fine: forget the last push, so a later change is told again.
      await store.recordAssessment(watch.id, assessment.status, null, now);
      continue;
    }
    if (watch.lastNotifiedStatus === assessment.status) {
      await store.recordAssessment(watch.id, assessment.status, undefined, now);
      continue;
    }
    const sent = await push({ token: watch.device.apnsToken, environment: watch.device.environment }, alert);
    if (sent.ok) {
      result.notified++;
      await store.recordAssessment(watch.id, assessment.status, assessment.status, now);
    } else {
      // A token Apple no longer knows is forgotten. Any other failure is tried again at the next check.
      if (sent.invalidToken) await store.deleteDeviceByToken(watch.device.apnsToken);
      await store.recordAssessment(watch.id, assessment.status, undefined, now);
    }
  }
  return result;
}
