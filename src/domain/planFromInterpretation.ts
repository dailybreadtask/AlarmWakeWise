import type { Interpretation, QuestionField } from './interpretation';
import { planBackwards, type PlanOutcome, type PlanRequest, type PlanStepSpec } from './planner';
import { resolveDeadline } from './resolveDeadline';

/** Defaults the person can change. Labelled as estimates on screen. */
export const DEFAULT_GET_READY_MINUTES = 30;
export const DEFAULT_BUFFER_MINUTES = 10;

const JOURNEY_CAPABILITIES = ['rail', 'transit', 'road', 'flight'];

export interface PlanQuestion {
  field: QuestionField;
  question: string;
}

export type PlanBuild = { ok: true; request: PlanRequest } | { ok: false; questions: PlanQuestion[] };

export interface PlanBuildOptions {
  timezone: string;
  now: Date;
  earliestWakeAt: Date | null;
  /** Overrides the estimated defaults, for when the person edits them. */
  getReadyMinutes?: number;
  bufferMinutes?: number;
  /** A typical journey time from an estimate. When given, it is used and labelled as an estimate. */
  journeyMinutes?: number;
}

/**
 * Turns a reading into the inputs for the planner. Anything the reading does
 * not give us becomes a question. Nothing is guessed.
 */
export function buildPlanRequest(interpretation: Interpretation, options: PlanBuildOptions): PlanBuild {
  const commitment = interpretation.commitments[0];
  if (!commitment) return { ok: false, questions: [{ field: 'deadline', question: 'When do you need to be ready for this?' }] };

  const resolved = resolveDeadline(commitment.deadline, options.timezone, options.now);
  if (!resolved.ok) return { ok: false, questions: [{ field: 'deadline', question: resolved.question }] };

  const steps: PlanStepSpec[] = [{ id: 'get-ready', label: 'Get ready', kind: 'prep', minutes: options.getReadyMinutes ?? DEFAULT_GET_READY_MINUTES, source: 'estimated' }];

  // A timer the person asked for (e.g. bake for 25 minutes) becomes a step, so the plan can place it.
  interpretation.requests.forEach((r, i) => {
    if (r.capability === 'timer' && typeof r.params.minutes === 'number') {
      steps.push({ id: `timer-${i}`, label: r.reason, kind: 'timer', minutes: r.params.minutes, source: 'user' });
    }
  });

  const journeys = interpretation.requests.filter((r) => JOURNEY_CAPABILITIES.includes(r.capability));
  if (journeys.length > 0) {
    if (options.journeyMinutes !== undefined) {
      steps.push({ id: 'travel', label: 'Travel', kind: 'travel', minutes: options.journeyMinutes, source: 'estimated' });
    } else {
      const minutes = journeys.map((r) => r.params.minutes).find((m): m is number => typeof m === 'number');
      if (minutes === undefined) return { ok: false, questions: [{ field: 'minutes', question: 'How long does the journey take?' }] };
      steps.push({ id: 'travel', label: 'Travel', kind: 'travel', minutes, source: 'user' });
    }
  }

  return {
    ok: true,
    request: {
      eventAt: resolved.at,
      bufferMinutes: options.bufferMinutes ?? DEFAULT_BUFFER_MINUTES,
      steps,
      earliestWakeAt: options.earliestWakeAt,
      now: options.now,
    },
  };
}

/** One call from a reading to a plan or to the questions it needs. */
export function planFromInterpretation(interpretation: Interpretation, options: PlanBuildOptions): { ok: true; outcome: PlanOutcome } | { ok: false; questions: PlanQuestion[] } {
  const built = buildPlanRequest(interpretation, options);
  if (!built.ok) return built;
  return { ok: true, outcome: planBackwards(built.request) };
}
