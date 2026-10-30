import { earliestWakeFor, localToUtc } from '../../src/domain/time';

describe('localToUtc', () => {
  it('converts a winter London time (GMT, UTC+0)', () => {
    const r = localToUtc('2026-10-29', '09:00', 'Europe/London');
    expect(r).toEqual({ ok: true, at: new Date('2026-10-29T09:00:00Z') });
  });

  it('converts a summer London time (BST, UTC+1)', () => {
    const r = localToUtc('2026-07-01', '09:00', 'Europe/London');
    expect(r).toEqual({ ok: true, at: new Date('2026-07-01T08:00:00Z') });
  });

  it('uses the offset in force on the day, across the autumn change', () => {
    // Clocks go back on 25 Oct 2026. 09:00 is GMT on the 26th, BST on the 24th.
    expect(localToUtc('2026-10-24', '09:00', 'Europe/London')).toEqual({ ok: true, at: new Date('2026-10-24T08:00:00Z') });
    expect(localToUtc('2026-10-26', '09:00', 'Europe/London')).toEqual({ ok: true, at: new Date('2026-10-26T09:00:00Z') });
  });

  it('rejects a local time that does not exist when clocks go forward', () => {
    // 01:30 on 29 Mar 2026 is skipped in London.
    expect(localToUtc('2026-03-29', '01:30', 'Europe/London')).toEqual({ ok: false, reason: 'nonexistent' });
  });

  it('rejects a local time that happens twice when clocks go back', () => {
    // 01:30 on 25 Oct 2026 happens twice in London.
    expect(localToUtc('2026-10-25', '01:30', 'Europe/London')).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('works in a timezone without daylight saving', () => {
    expect(localToUtc('2026-10-29', '09:00', 'Asia/Kolkata')).toEqual({ ok: true, at: new Date('2026-10-29T03:30:00Z') });
  });
});

describe('earliestWakeFor', () => {
  it('uses the limit on the day of the event, in local time', () => {
    // 06:15 on Thursday 29 Oct 2026 in London (GMT, UTC+0).
    expect(earliestWakeFor(new Date('2026-10-29T09:00:00Z'), '06:15', 'Europe/London')).toEqual(new Date('2026-10-29T06:15:00Z'));
  });

  it('keeps the same local time across the clock change', () => {
    // 06:15 on Monday 26 Oct 2026 is GMT, after the change on 25 Oct.
    expect(earliestWakeFor(new Date('2026-10-26T09:00:00Z'), '06:15', 'Europe/London')).toEqual(new Date('2026-10-26T06:15:00Z'));
  });

  it('is null when no limit is set', () => {
    expect(earliestWakeFor(new Date('2026-10-29T09:00:00Z'), null, 'Europe/London')).toBeNull();
  });
});
