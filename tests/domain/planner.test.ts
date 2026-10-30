import { planBackwards, type PlanRequest } from '../../src/domain/planner';

const base: PlanRequest = {
  eventAt: new Date('2026-10-29T09:00:00Z'),
  bufferMinutes: 14,
  steps: [
    { id: 'get-ready', label: 'Get ready', kind: 'prep', minutes: 45, source: 'user' },
    { id: 'walk', label: 'Walk to the station', kind: 'travel', minutes: 14, source: 'estimated' },
    { id: 'train', label: 'Train', kind: 'travel', minutes: 37, source: 'user' },
  ],
  earliestWakeAt: null,
  now: new Date('2026-10-28T20:00:00Z'),
};

describe('planBackwards', () => {
  it('works back from the event through the buffer and every step', () => {
    const result = planBackwards(base);
    if (!result.ok) throw new Error('expected a plan');
    // 09:00 - 14 min buffer = 08:46 arrival; minus 96 min of steps = 07:10 wake.
    expect(result.wakeAt).toEqual(new Date('2026-10-29T07:10:00Z'));
    expect(result.spareMinutes).toBe(14);
  });

  it('lays the steps out in order, ending at the arrival time', () => {
    const result = planBackwards(base);
    if (!result.ok) throw new Error('expected a plan');
    const starts = result.timeline.map((t) => [t.id, t.startsAt.toISOString()]);
    expect(starts).toEqual([
      ['wake', '2026-10-29T07:10:00.000Z'],
      ['get-ready', '2026-10-29T07:10:00.000Z'],
      ['walk', '2026-10-29T07:55:00.000Z'],
      ['train', '2026-10-29T08:09:00.000Z'],
      ['arrive', '2026-10-29T08:46:00.000Z'],
    ]);
  });

  it('keeps the source of each assumption so the person can see what is estimated', () => {
    const result = planBackwards(base);
    if (!result.ok) throw new Error('expected a plan');
    expect(result.timeline.find((t) => t.id === 'walk')?.source).toBe('estimated');
    expect(result.timeline.find((t) => t.id === 'train')?.source).toBe('user');
  });

  it('refuses a wake time that has already passed', () => {
    expect(planBackwards({ ...base, now: new Date('2026-10-29T07:30:00Z') })).toEqual({ ok: false, reason: 'wake_in_past' });
  });

  it('refuses a wake time earlier than the limit the person set', () => {
    expect(planBackwards({ ...base, earliestWakeAt: new Date('2026-10-29T07:30:00Z') })).toEqual({ ok: false, reason: 'wake_before_limit' });
  });

  it('refuses an empty plan and one longer than a day', () => {
    expect(planBackwards({ ...base, steps: [] })).toEqual({ ok: false, reason: 'no_steps' });
    const long = { ...base, steps: [{ id: 'x', label: 'x', kind: 'prep' as const, minutes: 25 * 60, source: 'user' as const }] };
    expect(planBackwards(long)).toEqual({ ok: false, reason: 'longer_than_a_day' });
  });

  it('gives the same wake time across the UK clock change', () => {
    // Durations are absolute, so the wake time is 14 min + 96 min before the event whichever side of the change it falls.
    const result = planBackwards({ ...base, eventAt: new Date('2026-10-26T09:00:00Z'), now: new Date('2026-10-25T20:00:00Z') });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.wakeAt).toEqual(new Date('2026-10-26T07:10:00Z'));
  });
});
