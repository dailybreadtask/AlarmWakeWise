import type { Sum } from './sums';

/**
 * The challenge after the alarm is stopped. Three sums must be solved to
 * finish. A person who cannot do sums can always leave without them: the
 * accessible option is part of the flow, not a fallback.
 */
export const SUMS_TO_SOLVE = 3;

export interface ChallengeState {
  sums: Sum[];
  /** Index of the sum on screen. Equals SUMS_TO_SOLVE when finished. */
  current: number;
  wrongAttempts: number;
  /** How the person finished: all sums, or the accessible way out. */
  finishedBy: 'sums' | 'accessible' | null;
}

export type ChallengeEvent = { type: 'answer'; choice: number } | { type: 'leaveWithoutSums' };

export function startChallenge(sums: Sum[]): ChallengeState {
  return { sums, current: 0, wrongAttempts: 0, finishedBy: null };
}

export function challengeStep(state: ChallengeState, event: ChallengeEvent): ChallengeState {
  if (state.finishedBy) return state;
  if (event.type === 'leaveWithoutSums') return { ...state, finishedBy: 'accessible' };
  const sum = state.sums[state.current];
  if (event.choice !== sum.answer) return { ...state, wrongAttempts: state.wrongAttempts + 1 };
  const current = state.current + 1;
  return { ...state, current, finishedBy: current === SUMS_TO_SOLVE ? 'sums' : null };
}
