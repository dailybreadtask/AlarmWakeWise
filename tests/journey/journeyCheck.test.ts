import { assessJourney, type SavedJourney } from '../../src/journey/journeyCheck';
import type { BoardDeparture } from '../../src/domain/railJourney';

const tz = 'Europe/London';
const day = '2026-10-30';

const journey: SavedJourney = {
  trainId: 'T0757',
  departsAt: new Date(`${day}T07:57:00Z`),
  arrivesAt: new Date(`${day}T08:34:00Z`),
  deadlineAt: new Date(`${day}T09:00:00Z`),
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: null,
  wakeAt: new Date(`${day}T07:10:00Z`),
  timezone: tz,
};

const train = (trainId: string, scheduled: string, expected: string, arrScheduled: string, arrExpected: string, status = 'On time'): BoardDeparture => ({
  trainId,
  serviceDate: day,
  scheduled,
  expected,
  arrivesScheduled: arrScheduled,
  arrivesExpected: arrExpected,
  status,
  platform: null,
});

const now = new Date(`${day}T07:20:00Z`);

describe('assessJourney', () => {
  it('reports on time when the train runs to schedule', () => {
    const a = assessJourney(journey, [train('T0757', '07:57', 'On time', '08:34', 'On time')], now);
    expect(a).toMatchObject({ status: 'on_time', proposal: null });
  });

  it('keeps the plan when a delay still gets the person there', () => {
    const a = assessJourney(journey, [train('T0757', '07:57', '08:02', '08:34', '08:39')], now);
    expect(a.status).toBe('delayed_still_ok');
    expect(a.proposal).toBeNull();
  });

  it('proposes a later train with the earlier-or-later wake it needs when the delay makes the plan fail', () => {
    const board = [
      train('T0757', '07:57', '08:40', '08:34', '09:20'),
      train('T0812', '08:12', 'On time', '08:49', 'On time'),
    ];
    const a = assessJourney(journey, board, now);
    expect(a.status).toBe('at_risk');
    expect(a.proposal).toMatchObject({ trainId: 'T0812' });
    expect(a.proposal?.wakeAt).toEqual(new Date(`${day}T07:32:00Z`));
  });

  it('proposes an alternative when the train is cancelled', () => {
    const board = [
      train('T0757', '07:57', 'Cancelled', '08:34', 'Cancelled', 'Cancelled'),
      train('T0812', '08:12', 'On time', '08:49', 'On time'),
    ];
    const a = assessJourney(journey, board, now);
    expect(a).toMatchObject({ status: 'cancelled', proposal: { trainId: 'T0812' } });
  });

  it('proposes nothing when no later train makes the deadline', () => {
    const board = [train('T0757', '07:57', 'Cancelled', '08:34', 'Cancelled', 'Cancelled')];
    const a = assessJourney(journey, board, now);
    expect(a).toMatchObject({ status: 'cancelled', alternatives: [], proposal: null });
  });

  it('does not guess when the train is missing from the board', () => {
    expect(assessJourney(journey, [], now)).toMatchObject({ status: 'not_on_board', proposal: null });
  });

  it('never proposes a wake earlier than the person set as the limit', () => {
    const board = [
      train('T0757', '07:57', '08:40', '08:34', '09:20'),
      train('T0812', '08:12', 'On time', '08:49', 'On time'),
    ];
    const limited = { ...journey, earliestWakeAt: new Date(`${day}T07:40:00Z`) };
    const a = assessJourney(limited, board, now);
    expect(a.proposal).toBeNull();
  });
});
