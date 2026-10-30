/**
 * Works back from the event. Pure and deterministic: the AI never sets a time.
 * Durations are absolute, so clock changes only affect how times are shown.
 */
export interface PlanStepSpec {
  id: string;
  label: string;
  kind: 'prep' | 'travel' | 'timer';
  minutes: number;
  /** estimated: a default the person can change. user: given by the person. */
  source: 'estimated' | 'user';
}

export interface PlanRequest {
  eventAt: Date;
  /** Spare time kept before the event. */
  bufferMinutes: number;
  /** In the order the person does them. */
  steps: PlanStepSpec[];
  /** The person's "never wake before" limit, if set. */
  earliestWakeAt: Date | null;
  now: Date;
  /** Label for the final point on the timeline. Defaults to "At the event". */
  eventLabel?: string;
}

export interface TimelineEntry {
  id: string;
  label: string;
  kind: PlanStepSpec['kind'] | 'wake' | 'arrive';
  startsAt: Date;
  minutes: number;
  source: PlanStepSpec['source'] | null;
}

export type PlanOutcome =
  | { ok: true; wakeAt: Date; timeline: TimelineEntry[]; spareMinutes: number }
  | { ok: false; reason: 'no_steps' | 'wake_in_past' | 'wake_before_limit' | 'longer_than_a_day' };

const MINUTE = 60_000;
const MAX_TOTAL_MINUTES = 24 * 60;

export function planBackwards(request: PlanRequest): PlanOutcome {
  if (request.steps.length === 0) return { ok: false, reason: 'no_steps' };
  const totalMinutes = request.steps.reduce((sum, s) => sum + s.minutes, 0);
  if (totalMinutes > MAX_TOTAL_MINUTES) return { ok: false, reason: 'longer_than_a_day' };

  const arriveAt = new Date(request.eventAt.getTime() - request.bufferMinutes * MINUTE);
  const wakeAt = new Date(arriveAt.getTime() - totalMinutes * MINUTE);
  if (wakeAt <= request.now) return { ok: false, reason: 'wake_in_past' };
  if (request.earliestWakeAt && wakeAt < request.earliestWakeAt) return { ok: false, reason: 'wake_before_limit' };

  const timeline: TimelineEntry[] = [{ id: 'wake', label: 'Wake up', kind: 'wake', startsAt: wakeAt, minutes: 0, source: null }];
  let cursor = wakeAt;
  for (const step of request.steps) {
    timeline.push({ id: step.id, label: step.label, kind: step.kind, startsAt: new Date(cursor), minutes: step.minutes, source: step.source });
    cursor = new Date(cursor.getTime() + step.minutes * MINUTE);
  }
  timeline.push({ id: 'arrive', label: request.eventLabel ?? 'At the event', kind: 'arrive', startsAt: arriveAt, minutes: request.bufferMinutes, source: 'user' });

  return { ok: true, wakeAt, timeline, spareMinutes: request.bufferMinutes };
}
