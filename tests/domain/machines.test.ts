import { advanceAction, idempotencyKeyFor, type Action } from '../../src/domain/action';
import { advanceIntent, type Intent } from '../../src/domain/intent';
import { advanceMonitor, isMonitoring, type Monitor } from '../../src/domain/monitor';
import { advancePlan, type Plan } from '../../src/domain/plan';
import { advanceProposal, mayMoveAlarm, type ChangeProposal } from '../../src/domain/proposal';

const base = { timezone: 'Europe/London', createdAt: '2026-10-28T08:00:00Z' };

function intent(state: Intent['state']): Intent {
  return { id: 'i1', rawText: 'be at work by 9', state, openQuestions: [], ...base };
}

function plan(state: Plan['state']): Plan {
  return { id: 'p1', commitmentId: 'c1', version: 1, state, steps: [], assumptions: [], eventAt: '2026-10-29T09:00:00Z', wakeAt: null };
}

function action(state: Action['state']): Action {
  return { id: 'a1', planId: 'p1', planVersion: 1, kind: 'alarm', state, scheduledAt: '2026-10-29T06:00:00Z', idempotencyKey: 'k', nativeId: null };
}

function monitor(overrides: Partial<Monitor>): Monitor {
  return {
    id: 'm1',
    planId: 'p1',
    capability: 'rail',
    state: 'active',
    startsAt: '2026-10-29T05:00:00Z',
    endsAt: '2026-10-29T09:00:00Z',
    cadenceSeconds: 300,
    lastCheckAt: '2026-10-29T06:00:00Z',
    lastObservedAt: '2026-10-29T06:00:00Z',
    freshnessSeconds: 600,
    ...overrides,
  };
}

describe('intent machine', () => {
  it('walks from capture to confirmation through clarification', () => {
    const asked = advanceIntent(intent('captured'), 'needs_answer');
    expect(asked).toEqual({ ok: true, state: 'clarifying' });
    expect(advanceIntent(intent('clarifying'), 'answer')).toEqual({ ok: true, state: 'interpreted' });
    expect(advanceIntent(intent('planned'), 'confirm')).toEqual({ ok: true, state: 'confirmed' });
  });

  it('rejects confirming before a plan exists', () => {
    expect(advanceIntent(intent('captured'), 'confirm')).toEqual({ ok: false, state: 'captured', reason: 'invalid_transition' });
  });

  it('keeps confirmed and discarded intents closed', () => {
    expect(advanceIntent(intent('confirmed'), 'discard').ok).toBe(false);
    expect(advanceIntent(intent('discarded'), 'answer').ok).toBe(false);
  });
});

describe('plan machine', () => {
  it('approves only a proposed plan', () => {
    expect(advancePlan(plan('draft'), 'approve').ok).toBe(false);
    expect(advancePlan(plan('proposed'), 'approve')).toEqual({ ok: true, state: 'approved' });
  });

  it('keeps an approved plan unchanged by editing it', () => {
    expect(advancePlan(plan('approved'), 'edit').ok).toBe(false);
  });
});

describe('action machine', () => {
  it('moves through native scheduling and records only OS-confirmed success', () => {
    expect(advanceAction(action('approved'), 'schedule_request')).toEqual({ ok: true, state: 'scheduling' });
    expect(advanceAction(action('scheduling'), 'os_confirmed')).toEqual({ ok: true, state: 'scheduled' });
  });

  it('never reaches scheduled without a scheduling step', () => {
    expect(advanceAction(action('approved'), 'os_confirmed').ok).toBe(false);
  });

  it('allows a retry only after failure', () => {
    expect(advanceAction(action('failed'), 'retry')).toEqual({ ok: true, state: 'scheduling' });
    expect(advanceAction(action('scheduled'), 'retry').ok).toBe(false);
  });

  it('derives the same idempotency key for the same plan version and action', () => {
    expect(idempotencyKeyFor('p1', 2, 'a1')).toBe('p1:v2:a1');
    expect(idempotencyKeyFor('p1', 2, 'a1')).toBe(idempotencyKeyFor('p1', 2, 'a1'));
  });
});

describe('monitor machine and monitoring claim', () => {
  it('moves to degraded on a failed check and back on success', () => {
    expect(advanceMonitor(monitor({ state: 'active' }), 'check_failed')).toEqual({ ok: true, state: 'degraded' });
    expect(advanceMonitor(monitor({ state: 'degraded' }), 'check_ok')).toEqual({ ok: true, state: 'active' });
  });

  it('claims monitoring only inside the window with a fresh observation', () => {
    const now = new Date('2026-10-29T06:05:00Z');
    expect(isMonitoring(monitor({}), now)).toBe(true);
  });

  it('does not claim monitoring when the last observation is stale', () => {
    const now = new Date('2026-10-29T06:30:00Z');
    expect(isMonitoring(monitor({}), now)).toBe(false);
  });

  it('does not claim monitoring before the window opens or after it closes', () => {
    expect(isMonitoring(monitor({}), new Date('2026-10-29T04:59:00Z'))).toBe(false);
    expect(isMonitoring(monitor({}), new Date('2026-10-29T09:00:00Z'))).toBe(false);
  });

  it('does not claim monitoring when degraded or never observed', () => {
    const now = new Date('2026-10-29T06:05:00Z');
    expect(isMonitoring(monitor({ state: 'degraded' }), now)).toBe(false);
    expect(isMonitoring(monitor({ lastObservedAt: null }), now)).toBe(false);
  });
});

describe('change proposal', () => {
  function proposal(state: ChangeProposal['state'], chosen: string | null): ChangeProposal {
    return { id: 'x', planId: 'p1', trigger: 'rail delay', state, changedFactIds: [], alternatives: [], chosenAlternativeId: chosen };
  }

  it('keeps the original alarm when a proposal is only pending', () => {
    expect(mayMoveAlarm(proposal('pending', 'alt1'), true)).toBe(false);
  });

  it('moves the alarm only when accepted, chosen and confirmed by the OS', () => {
    expect(mayMoveAlarm(proposal('accepted', 'alt1'), true)).toBe(true);
    expect(mayMoveAlarm(proposal('accepted', 'alt1'), false)).toBe(false);
    expect(mayMoveAlarm(proposal('accepted', null), true)).toBe(false);
  });

  it('returns to pending when applying fails, so the original stays in effect', () => {
    expect(advanceProposal(proposal('accepted', 'alt1'), 'apply_failed')).toEqual({ ok: true, state: 'pending' });
  });
});
