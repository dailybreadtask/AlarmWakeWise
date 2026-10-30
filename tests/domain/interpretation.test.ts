import { validateInterpretation, type Interpretation } from '../../src/domain/interpretation';

/** A valid reply for the spec's commute example. The time is not given, so it stays null. */
function commute(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 3,
    goal: 'Be at work by 9am tomorrow',
    intentType: 'purpose_alarm',
    confidence: 0.9,
    commitments: [
      {
        outcome: 'Arrive at work',
        deadline: { date: '2026-10-30', time: '09:00', dateWords: 'tomorrow', inMinutes: null, timeAssumed: false },
        placeLabel: 'work',
      },
    ],
    requests: [
      { capability: 'rail', reason: 'Train journey to work', params: { from: 'home station', to: 'work station' } },
    ],
    questions: [],
    ...overrides,
  };
}

describe('interpretation schema', () => {
  it('accepts a valid commute reply', () => {
    const result = validateInterpretation(commute());
    expect(result.ok).toBe(true);
  });

  it('keeps a missing time as null rather than inventing one', () => {
    const reply = commute({
      commitments: [{ outcome: 'Cake ready', deadline: { date: null, time: null, dateWords: 'Sunday', inMinutes: null, timeAssumed: false }, placeLabel: null }],
      confidence: 0.5,
      questions: [{ field: 'deadline', question: 'What time should the cake be ready?' }],
    });
    const result = validateInterpretation(reply);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.commitments[0].deadline.time).toBeNull();
  });

  it('rejects a request for an unsupported capability (fail closed)', () => {
    const result = validateInterpretation(commute({ requests: [{ capability: 'send_email', reason: 'x', params: {} }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/not a supported capability/);
  });

  it('rejects a date that has the right shape but does not exist', () => {
    const reply = commute({
      commitments: [{ outcome: 'Pay bill', deadline: { date: '2026-02-30', time: null, dateWords: null, inMinutes: null, timeAssumed: false }, placeLabel: null }],
    });
    expect(validateInterpretation(reply).ok).toBe(false);
  });

  it('rejects an impossible time', () => {
    const reply = commute({
      commitments: [{ outcome: 'Pay bill', deadline: { date: null, time: '25:00', dateWords: null, inMinutes: null, timeAssumed: false }, placeLabel: null }],
    });
    expect(validateInterpretation(reply).ok).toBe(false);
  });

  it('rejects unknown top-level and nested fields', () => {
    expect(validateInterpretation({ ...commute(), schedule_alarm: true }).ok).toBe(false);
    const nested = commute({ requests: [{ capability: 'weather', reason: 'x', params: { place: 'home', lat: 55.9 } }] });
    expect(validateInterpretation(nested).ok).toBe(false);
  });

  it('rejects a reply with the wrong schema version', () => {
    expect(validateInterpretation(commute({ schemaVersion: 1 })).ok).toBe(false);
  });

  it('rejects low confidence with no clarifying question', () => {
    const result = validateInterpretation(commute({ confidence: 0.3, questions: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/low confidence/);
  });

  it('accepts an unsupported request with low confidence and no questions', () => {
    const reply = commute({ intentType: 'unsupported', confidence: 0.2, commitments: [], requests: [], questions: [] });
    expect(validateInterpretation(reply).ok).toBe(true);
  });

  it('rejects more requests than the bound allows', () => {
    const requests = Array.from({ length: 7 }, () => ({ capability: 'weather', reason: 'x', params: { place: 'home' } }));
    expect(validateInterpretation(commute({ requests })).ok).toBe(false);
  });

  it('rejects a non-object reply', () => {
    expect(validateInterpretation('be at work by 9').ok).toBe(false);
    expect(validateInterpretation(null).ok).toBe(false);
  });

  it('keeps the typed value on success', () => {
    const result = validateInterpretation(commute());
    if (!result.ok) throw new Error('expected a valid reply');
    const value: Interpretation = result.value;
    expect(value.requests[0].capability).toBe('rail');
  });
});
