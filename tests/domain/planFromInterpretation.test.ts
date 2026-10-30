import { planFromInterpretation } from '../../src/domain/planFromInterpretation';
import type { Interpretation } from '../../src/domain/interpretation';

const now = new Date('2026-10-28T20:00:00Z');
const options = { timezone: 'Europe/London', now, earliestWakeAt: null };

function reading(overrides: Partial<Interpretation> = {}): Interpretation {
  return {
    schemaVersion: 3,
    goal: 'Be at work by 9 tomorrow',
    intentType: 'purpose_alarm',
    confidence: 0.9,
    commitments: [{ outcome: 'Arrive at work', deadline: { date: '2026-10-29', time: '09:00', dateWords: 'tomorrow', inMinutes: null, timeAssumed: false }, placeLabel: 'work' }],
    requests: [],
    questions: [],
    ...overrides,
  };
}

describe('planFromInterpretation', () => {
  it('plans a task with no journey, using the estimated defaults and saying so', () => {
    const result = planFromInterpretation(reading({ commitments: [{ outcome: 'Cake ready', deadline: { date: '2026-10-29', time: '12:00', dateWords: null, inMinutes: null, timeAssumed: false }, placeLabel: null }] }), options);
    if (!result.ok || !result.outcome.ok) throw new Error('expected a plan');
    expect(result.outcome.timeline.find((t) => t.id === 'get-ready')?.source).toBe('estimated');
    // 12:00 - 10 min spare - 30 min to get ready = 11:20 (GMT, so local = UTC).
    expect(result.outcome.wakeAt).toEqual(new Date('2026-10-29T11:20:00Z'));
  });

  it('asks for the journey length rather than inventing one', () => {
    const result = planFromInterpretation(reading({ requests: [{ capability: 'rail', reason: 'Train to work', params: { from: 'home station', to: 'work station' } }] }), options);
    expect(result).toEqual({ ok: false, questions: [{ field: 'minutes', question: 'How long does the journey take?' }] });
  });

  it('uses a journey length the person has given', () => {
    const result = planFromInterpretation(reading({ requests: [{ capability: 'rail', reason: 'Train to work', params: { minutes: 37 } }] }), options);
    if (!result.ok || !result.outcome.ok) throw new Error('expected a plan');
    expect(result.outcome.timeline.find((t) => t.id === 'travel')?.source).toBe('user');
  });

  it('asks for the time when only a day is given', () => {
    const result = planFromInterpretation(reading({ commitments: [{ outcome: 'Cake ready', deadline: { date: '2026-10-29', time: null, dateWords: 'tomorrow', inMinutes: null, timeAssumed: false }, placeLabel: null }] }), options);
    expect(result).toEqual({ ok: false, questions: [{ field: 'deadline', question: 'What time do you need to be there?' }] });
  });

  it('asks for the day when only a weekday is given', () => {
    const result = planFromInterpretation(reading({ commitments: [{ outcome: 'Water plants', deadline: { date: null, time: null, dateWords: 'Sunday', inMinutes: null, timeAssumed: false }, placeLabel: null }] }), options);
    expect(result).toEqual({ ok: false, questions: [{ field: 'deadline', question: 'Which day do you mean by "Sunday"?' }] });
  });

  it('asks when the time does not exist on the clocks', () => {
    const result = planFromInterpretation(reading({ commitments: [{ outcome: 'Train', deadline: { date: '2026-03-29', time: '01:30', dateWords: null, inMinutes: null, timeAssumed: false }, placeLabel: null }] }), { ...options, now: new Date('2026-03-28T20:00:00Z') });
    expect(result.ok).toBe(false);
  });

  it('asks for a commitment when there is none', () => {
    expect(planFromInterpretation(reading({ commitments: [] }), options)).toEqual({ ok: false, questions: [{ field: 'deadline', question: 'When do you need to be ready for this?' }] });
  });

  it('reports an impossible plan from the planner, such as a wake time already past', () => {
    const result = planFromInterpretation(reading(), { ...options, now: new Date('2026-10-29T08:30:00Z') });
    if (!result.ok) throw new Error('expected the plan to be built');
    expect(result.outcome).toEqual({ ok: false, reason: 'wake_in_past' });
  });
});

describe('relative times', () => {
  it('counts "in N minutes" from now', () => {
    const result = planFromInterpretation(
      reading({
        intentType: 'purpose_alarm',
        commitments: [{ outcome: 'Cake ready', deadline: { date: null, time: null, dateWords: 'in 90 minutes', inMinutes: 90, timeAssumed: false }, placeLabel: null }],
      }),
      { ...options, now: new Date('2026-10-28T20:00:00Z') },
    );
    if (!result.ok || !result.outcome.ok) throw new Error('expected a plan');
    // Ready 90 min from now, minus 10 min spare and 30 min to get ready.
    expect(result.outcome.wakeAt).toEqual(new Date('2026-10-28T20:50:00Z'));
  });
});

describe('timer steps', () => {
  it('turns a requested timer into a step the plan places before the finish', () => {
    const result = planFromInterpretation(
      reading({
        commitments: [{ outcome: 'Cake ready', deadline: { date: null, time: null, dateWords: 'in 90 minutes', inMinutes: 90, timeAssumed: false }, placeLabel: null }],
        requests: [{ capability: 'timer', reason: 'Bake', params: { minutes: 25 } }],
      }),
      { ...options, now: new Date('2026-10-28T20:00:00Z') },
    );
    if (!result.ok || !result.outcome.ok) throw new Error('expected a plan');
    const bake = result.outcome.timeline.find((t) => t.kind === 'timer');
    expect(bake).toMatchObject({ label: 'Bake', minutes: 25, source: 'user' });
  });
});
