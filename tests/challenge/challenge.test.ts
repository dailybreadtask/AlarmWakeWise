import { challengeStep, startChallenge, SUMS_TO_SOLVE } from '../../src/challenge/challengeFlow';
import { makeSum, seededRandom } from '../../src/challenge/sums';

describe('sums', () => {
  it('makes four distinct choices with the right answer among them', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const sum = makeSum(seededRandom(seed));
      expect(sum.choices).toHaveLength(4);
      expect(new Set(sum.choices).size).toBe(4);
      expect(sum.choices).toContain(sum.answer);
    }
  });

  it('gives the same sum for the same seed, so tests are repeatable', () => {
    expect(makeSum(seededRandom(7))).toEqual(makeSum(seededRandom(7)));
  });

  it('keeps the answer correct for its question', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const sum = makeSum(seededRandom(seed));
      const [a, op, b] = sum.question.split(' ');
      const expected = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
      expect(sum.answer).toBe(expected);
    }
  });
});

describe('challenge flow', () => {
  const sums = [1, 2, 3].map((s) => makeSum(seededRandom(s)));

  it('finishes after the three sums are solved correctly', () => {
    let state = startChallenge(sums);
    for (let i = 0; i < SUMS_TO_SOLVE; i++) state = challengeStep(state, { type: 'answer', choice: sums[state.current].answer });
    expect(state).toMatchObject({ current: SUMS_TO_SOLVE, finishedBy: 'sums', wrongAttempts: 0 });
  });

  it('counts a wrong answer but keeps the same sum on screen', () => {
    const wrong = sums[0].choices.find((c) => c !== sums[0].answer) ?? 0;
    const state = challengeStep(startChallenge(sums), { type: 'answer', choice: wrong });
    expect(state).toMatchObject({ current: 0, wrongAttempts: 1, finishedBy: null });
  });

  it('lets the person leave without sums, and records that they did', () => {
    const state = challengeStep(startChallenge(sums), { type: 'leaveWithoutSums' });
    expect(state.finishedBy).toBe('accessible');
  });

  it('does nothing once finished', () => {
    const done = challengeStep(startChallenge(sums), { type: 'leaveWithoutSums' });
    expect(challengeStep(done, { type: 'answer', choice: sums[0].answer })).toBe(done);
  });
});
