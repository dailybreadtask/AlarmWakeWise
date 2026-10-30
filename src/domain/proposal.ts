import { step, type StepResult, type TransitionTable } from './machines';

export const PROPOSAL_STATES = ['pending', 'accepted', 'applied', 'declined', 'expired'] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const PROPOSAL_EVENTS = ['accept', 'apply_ok', 'apply_failed', 'decline', 'expire'] as const;
export type ProposalEvent = (typeof PROPOSAL_EVENTS)[number];

export const PROPOSAL_TRANSITIONS: TransitionTable<ProposalState, ProposalEvent> = {
  pending: { accept: 'accepted', decline: 'declined', expire: 'expired' },
  accepted: { apply_ok: 'applied', apply_failed: 'pending' },
  applied: {},
  declined: {},
  expired: {},
};

export interface Alternative {
  id: string;
  label: string;
  /** The wake time this alternative would set, UTC. */
  wakeAt: string;
}

export interface ChangeProposal {
  id: string;
  planId: string;
  trigger: string;
  state: ProposalState;
  changedFactIds: string[];
  alternatives: Alternative[];
  /** The alternative the person accepted, if any. */
  chosenAlternativeId: string | null;
}

export function advanceProposal(proposal: ChangeProposal, event: ProposalEvent): StepResult<ProposalState> {
  return step(PROPOSAL_TRANSITIONS, proposal.state, event);
}

/**
 * Whether a committed alarm may move. Only an accepted proposal, applied by the
 * native scheduler, counts. An unaccepted proposal never moves an alarm.
 */
export function mayMoveAlarm(proposal: ChangeProposal, nativeConfirmed: boolean): boolean {
  return proposal.state === 'accepted' && proposal.chosenAlternativeId !== null && nativeConfirmed;
}
