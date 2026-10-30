import { step, type StepResult, type TransitionTable } from './machines';

export const INTENT_STATES = ['captured', 'interpreted', 'clarifying', 'planned', 'confirmed', 'discarded'] as const;
export type IntentState = (typeof INTENT_STATES)[number];

export const INTENT_EVENTS = ['interpret_ok', 'needs_answer', 'answer', 'plan_ready', 'edit', 'confirm', 'discard'] as const;
export type IntentEvent = (typeof INTENT_EVENTS)[number];

export const INTENT_TRANSITIONS: TransitionTable<IntentState, IntentEvent> = {
  captured: { interpret_ok: 'interpreted', needs_answer: 'clarifying', discard: 'discarded' },
  interpreted: { needs_answer: 'clarifying', plan_ready: 'planned', discard: 'discarded' },
  clarifying: { answer: 'interpreted', discard: 'discarded' },
  planned: { edit: 'planned', confirm: 'confirmed', discard: 'discarded' },
  confirmed: {},
  discarded: {},
};

/** The person's request as captured. The raw text is kept only on the device. */
export interface Intent {
  id: string;
  rawText: string;
  state: IntentState;
  /** Unresolved questions the app must ask before planning. Never invented answers. */
  openQuestions: string[];
  timezone: string;
  createdAt: string;
}

export function advanceIntent(intent: Intent, event: IntentEvent): StepResult<IntentState> {
  return step(INTENT_TRANSITIONS, intent.state, event);
}
