import { chooseTrain, instantFor, type BoardDeparture } from '../../src/domain/railJourney';

const tz = 'Europe/London';
const base: BoardDeparture = { trainId: 'T', serviceDate: '2026-10-29', scheduled: '07:57', expected: 'On time', arrivesScheduled: '08:34', arrivesExpected: 'On time', status: 'On time', platform: '2' };
const window = { deadlineAt: new Date('2026-10-29T09:00:00Z'), bufferMinutes: 10, earliestDepartAt: new Date('2026-10-29T06:00:00Z'), timezone: tz };

describe('instantFor', () => {
  it('converts a board time in London time, winter and summer', () => {
    expect(instantFor('2026-10-29', '07:57', tz)).toEqual(new Date('2026-10-29T07:57:00Z'));
    expect(instantFor('2026-07-01', '07:57', tz)).toEqual(new Date('2026-07-01T06:57:00Z'));
  });

  it('returns null when the date or time is not known', () => {
    expect(instantFor(null, '07:57', tz)).toBeNull();
    expect(instantFor('2026-10-29', null, tz)).toBeNull();
  });
});

describe('chooseTrain', () => {
  it('picks the latest train that gets there before the deadline minus the buffer', () => {
    const early = { ...base, trainId: 'EARLY', scheduled: '07:27', arrivesScheduled: '08:04' };
    const late = { ...base, trainId: 'LATE', scheduled: '08:12', arrivesScheduled: '08:49' };
    const latest = { ...base, trainId: 'TOO-LATE', scheduled: '08:40', arrivesScheduled: '09:10' };
    const choice = chooseTrain([early, late, latest], window);
    expect(choice?.trainId).toBe('LATE');
    expect(choice?.arrivesAt).toEqual(new Date('2026-10-29T08:49:00Z'));
  });

  it('uses the expected time when the feed reports a different one', () => {
    const choice = chooseTrain([{ ...base, expected: '08:02', arrivesExpected: '08:40' }], window);
    expect(choice?.departsAt).toEqual(new Date('2026-10-29T08:02:00Z'));
  });

  it('skips cancelled and delayed trains, since their times are not known', () => {
    expect(chooseTrain([{ ...base, expected: 'Cancelled', status: 'Cancelled' }], window)).toBeNull();
    expect(chooseTrain([{ ...base, expected: 'Delayed' }], window)).toBeNull();
  });

  it('skips a train that leaves before the person can be ready', () => {
    const choice = chooseTrain([base], { ...window, earliestDepartAt: new Date('2026-10-29T08:00:00Z') });
    expect(choice).toBeNull();
  });

  it('returns nothing when no train reaches the destination in time', () => {
    expect(chooseTrain([{ ...base, arrivesScheduled: '09:30' }], window)).toBeNull();
  });
});
