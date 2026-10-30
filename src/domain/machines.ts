/**
 * A state machine as a transition table. Any event that is not listed for the
 * current state is rejected and the state does not change.
 */
export type TransitionTable<S extends string, E extends string> = Readonly<Record<S, Partial<Record<E, S>>>>;

export type StepResult<S extends string> = { ok: true; state: S } | { ok: false; state: S; reason: 'invalid_transition' };

export function step<S extends string, E extends string>(table: TransitionTable<S, E>, state: S, event: E): StepResult<S> {
  const next = table[state][event];
  return next === undefined ? { ok: false, state, reason: 'invalid_transition' } : { ok: true, state: next };
}
