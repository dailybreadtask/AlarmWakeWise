import { step, type StepResult, type TransitionTable } from './machines';

export const PLAN_STATES = ['draft', 'proposed', 'approved', 'superseded'] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export const PLAN_EVENTS = ['propose', 'edit', 'approve', 'supersede'] as const;
export type PlanEvent = (typeof PLAN_EVENTS)[number];

/**
 * An approved plan stays in effect while a change is being proposed. A change
 * creates a new version rather than editing the approved one in place.
 */
export const PLAN_TRANSITIONS: TransitionTable<PlanState, PlanEvent> = {
  draft: { propose: 'proposed' },
  proposed: { edit: 'draft', approve: 'approved' },
  approved: { supersede: 'superseded' },
  superseded: {},
};

export type StepSource = 'estimated' | 'user' | 'provider';

export interface PlanStep {
  id: string;
  label: string;
  kind: 'prep' | 'travel' | 'reminder' | 'timer';
  minutes: number;
  source: StepSource;
  /** Facts this step relies on, by id. Empty for estimates. */
  factIds: string[];
}

export interface Plan {
  id: string;
  commitmentId: string;
  version: number;
  state: PlanState;
  steps: PlanStep[];
  /** Stated assumptions, shown to the person and editable. */
  assumptions: string[];
  /** Instant of the event the plan works back from, in UTC. */
  eventAt: string;
  /** Instant to wake, computed by deterministic code. Null until computed. */
  wakeAt: string | null;
}

export function advancePlan(plan: Plan, event: PlanEvent): StepResult<PlanState> {
  return step(PLAN_TRANSITIONS, plan.state, event);
}
