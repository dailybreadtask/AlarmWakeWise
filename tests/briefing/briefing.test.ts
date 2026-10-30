import { briefingSpeech, buildBriefing } from '../../src/briefing/briefing';
import type { PlanOutcome } from '../../src/domain/planner';

const plan: Extract<PlanOutcome, { ok: true }> = {
  ok: true,
  wakeAt: new Date('2026-10-30T06:50:00Z'),
  spareMinutes: 10,
  timeline: [
    { id: 'wake', label: 'Wake up', kind: 'wake', startsAt: new Date('2026-10-30T06:50:00Z'), minutes: 0, source: null },
    { id: 'get-ready', label: 'Get ready', kind: 'prep', startsAt: new Date('2026-10-30T06:50:00Z'), minutes: 30, source: 'estimated' },
    { id: 'walk', label: 'Walk to the station', kind: 'travel', startsAt: new Date('2026-10-30T07:30:00Z'), minutes: 10, source: 'estimated' },
  ],
};

describe('buildBriefing', () => {
  it('gives the next step from the plan, with its source', () => {
    const lines = buildBriefing({ goal: 'Work', timezone: 'Europe/London', now: new Date('2026-10-30T07:00:00Z'), plan, train: null });
    expect(lines[0]).toEqual({ text: 'Next: Walk to the station at 07:30.', source: 'Your plan' });
  });

  it('gives the live train with its source and the time it was checked', () => {
    const lines = buildBriefing({
      goal: 'Work',
      timezone: 'Europe/London',
      now: new Date('2026-10-30T07:00:00Z'),
      plan: null,
      train: { label: 'Train 07:57', departsAt: new Date('2026-10-30T07:57:00Z'), status: 'On time', asOf: '2026-10-30T06:58:00Z' },
    });
    expect(lines[0].text).toBe('Train 07:57 leaves at 07:57, on time, checked 06:58.');
    expect(lines[0].source).toBe('National Rail Enquiries (live)');
  });

  it('says plainly when weather is not connected, rather than leaving it out', () => {
    const lines = buildBriefing({ goal: 'Work', timezone: 'Europe/London', now: new Date('2026-10-30T07:00:00Z'), plan: null, train: null });
    expect(lines.map((l) => l.source)).toEqual(['Weather']);
    expect(lines[0].text).toMatch(/not connected/);
  });

  it('reads the lines aloud in order', () => {
    const lines = buildBriefing({ goal: 'Work', timezone: 'Europe/London', now: new Date('2026-10-30T07:00:00Z'), plan, train: null });
    expect(briefingSpeech(lines)).toBe('Next: Walk to the station at 07:30. Weather is not connected yet, so I cannot tell you about rain.');
  });
});
