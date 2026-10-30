import { step, type StepResult, type TransitionTable } from './machines';

export const ACTION_STATES = ['proposed', 'approved', 'scheduling', 'scheduled', 'failed', 'fired', 'cancelled'] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const ACTION_EVENTS = ['approve', 'schedule_request', 'os_confirmed', 'os_failed', 'fire', 'cancel', 'retry'] as const;
export type ActionEvent = (typeof ACTION_EVENTS)[number];

export const ACTION_TRANSITIONS: TransitionTable<ActionState, ActionEvent> = {
  proposed: { approve: 'approved', cancel: 'cancelled' },
  approved: { schedule_request: 'scheduling', cancel: 'cancelled' },
  scheduling: { os_confirmed: 'scheduled', os_failed: 'failed', cancel: 'cancelled' },
  scheduled: { fire: 'fired', cancel: 'cancelled' },
  failed: { retry: 'scheduling', cancel: 'cancelled' },
  fired: {},
  cancelled: {},
};

export type ActionKind = 'alarm' | 'timer' | 'reminder' | 'task' | 'notification';

export interface Action {
  id: string;
  planId: string;
  planVersion: number;
  kind: ActionKind;
  state: ActionState;
  scheduledAt: string;
  /**
   * Stable across retries: derived from plan id, plan version and action id.
   * The native scheduler must treat a repeated key as the same request.
   */
  idempotencyKey: string;
  /** Native identifier from the OS, present only after os_confirmed. */
  nativeId: string | null;
}

export function idempotencyKeyFor(planId: string, planVersion: number, actionId: string): string {
  return `${planId}:v${planVersion}:${actionId}`;
}

export function advanceAction(action: Action, event: ActionEvent): StepResult<ActionState> {
  return step(ACTION_TRANSITIONS, action.state, event);
}
