import { ambiguousHours, guardClockTimes } from '../../server/clockGuard';
import type { Interpretation } from '../../src/domain/interpretation';

function reading(time: string | null): Interpretation {
  return {
    schemaVersion: 3,
    goal: 'Be at work',
    intentType: 'purpose_alarm',
    confidence: 0.9,
    commitments: [{ outcome: 'Arrive at work', deadline: { date: null, time, dateWords: null, inMinutes: null, timeAssumed: false }, placeLabel: null }],
    requests: [],
    questions: [],
  };
}

describe('ambiguousHours', () => {
  it('flags a bare hour from 1 to 11 with no a.m. or p.m.', () => {
    expect([...ambiguousHours('Be at work for 7')]).toEqual([7]);
    expect([...ambiguousHours('Wake me at 8')]).toEqual([8]);
    expect([...ambiguousHours('Get to work by 9 tomorrow')]).toEqual([9]);
  });

  it('does not flag a time when the words say which part of the day', () => {
    expect(ambiguousHours("Be at my mum's by 6 tonight").size).toBe(0);
    expect(ambiguousHours('Pick up the kids at 3 in the afternoon').size).toBe(0);
  });

  it('does not flag times that say which half of the day', () => {
    expect(ambiguousHours('Be at work for 9am tomorrow').size).toBe(0);
    expect(ambiguousHours('Dinner at 6pm').size).toBe(0);
    expect(ambiguousHours('Train at 14:30').size).toBe(0);
    expect(ambiguousHours('Bake a cake by noon').size).toBe(0);
  });
});

describe('guardClockTimes', () => {
  it('assumes the morning for 5 to 11 and marks the time as an assumption', () => {
    const result = guardClockTimes('Be at work for 7', reading('07:00'));
    expect(result.commitments[0].deadline).toMatchObject({ time: '07:00', timeAssumed: true });
    expect(result.questions).toEqual([]);
  });

  it('assumes the evening for 1 to 4', () => {
    const result = guardClockTimes('Pick the kids up at 3', reading('03:00'));
    expect(result.commitments[0].deadline).toMatchObject({ time: '15:00', timeAssumed: true });
  });

  it('keeps a time the person made clear', () => {
    const value = reading('09:00');
    expect(guardClockTimes('Be at work for 9am tomorrow', value)).toBe(value);
  });

  it('keeps a 24-hour time, since it cannot be a.m. or p.m. by mistake', () => {
    const value = reading('18:00');
    expect(guardClockTimes('Dinner at 18:00', value)).toBe(value);
  });
});

describe('the rule overrides the model on bare hours', () => {
  it('corrects an afternoon time the model gave for a bare early hour', () => {
    const result = guardClockTimes('Wake me at 5:45', reading('17:45'));
    expect(result.commitments[0].deadline).toMatchObject({ time: '05:45', timeAssumed: true });
  });

  it('does not read a duration as a clock time', () => {
    expect(ambiguousHours('I want to study for 2 hours before the test').size).toBe(0);
  });
});
