import { journeyText, proposalText } from '../../src/journey/journeyText';
import type { JourneyAssessment, SavedJourney } from '../../src/journey/journeyCheck';

const j: SavedJourney = {
  trainId: 'T0757',
  departsAt: new Date('2026-10-30T07:57:00Z'),
  arrivesAt: new Date('2026-10-30T08:34:00Z'),
  deadlineAt: new Date('2026-10-30T09:00:00Z'),
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: null,
  wakeAt: new Date('2026-10-30T07:10:00Z'),
  timezone: 'Europe/London',
};

const base: JourneyAssessment = { status: 'on_time', expectedDepartAt: null, alternatives: [], proposal: null };

describe('journeyText', () => {
  it('names the source and the time it was checked', () => {
    const t = journeyText(base, j, '2026-10-30T07:20:00Z');
    expect(t.headline).toBe('On time');
    expect(t.detail).toContain('Checked 07:20 with National Rail Enquiries.');
  });

  it('keeps the wake-up unchanged when a delay still works', () => {
    const t = journeyText({ ...base, status: 'delayed_still_ok', expectedDepartAt: new Date('2026-10-30T08:02:00Z') }, j, null);
    expect(t.headline).toBe('Delayed, but you still make it');
    expect(t.detail).toContain('Your wake-up stays as it is.');
  });

  it('does not guess when the train is not on the board', () => {
    const t = journeyText({ ...base, status: 'not_on_board' }, j, null);
    expect(t.detail).toContain('I will not guess.');
  });

  it('describes a proposal with its times, without changing anything', () => {
    expect(proposalText({ trainId: 'T0812', departsAt: new Date('2026-10-30T08:12:00Z'), wakeAt: new Date('2026-10-30T07:32:00Z') }, 'Europe/London')).toBe(
      'A later train, leaving at 08:12, still gets you there. To catch it, move your alarm to 07:32.',
    );
  });
});
