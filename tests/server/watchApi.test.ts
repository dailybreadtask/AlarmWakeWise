import { parseDevice, parseDeviceId, parseIds, parseWatch } from '../../server/watchApi';

const now = new Date('2026-11-02T06:00:00Z');
const good = {
  id: '3f2b9c1e-4a5d-4f6e-8b7c-9d0e1f2a3b4c',
  deviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  fromCrs: 'EDB',
  toCrs: 'GLQ',
  trainId: '202611028012345',
  departsAt: '2026-11-02T07:57:00Z',
  arrivesAt: '2026-11-02T08:40:00Z',
  deadlineAt: '2026-11-02T09:00:00Z',
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: null,
  wakeAt: '2026-11-02T07:17:00Z',
  timezone: 'Europe/London',
};

describe('parseDevice', () => {
  it('accepts a push token and lower-cases it', () => {
    expect(parseDevice({ token: 'ABCDEF0123456789ABCDEF0123456789', environment: 'sandbox' })).toEqual({ ok: true, value: { token: 'abcdef0123456789abcdef0123456789', environment: 'sandbox' } });
  });
  it('refuses a token that is not hex, or an unknown environment', () => {
    expect(parseDevice({ token: 'not a token', environment: 'sandbox' })).toEqual({ ok: false, error: 'bad_token' });
    expect(parseDevice({ token: 'abcdef0123456789abcdef0123456789', environment: 'staging' })).toEqual({ ok: false, error: 'bad_environment' });
  });
});

describe('parseWatch', () => {
  it('accepts a journey for tomorrow', () => {
    const parsed = parseWatch(good, now);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ fromCrs: 'EDB', toCrs: 'GLQ', leaveAfterWakeMinutes: 40, earliestWakeAt: null });
  });
  it('refuses odd stations, ids, times and numbers', () => {
    expect(parseWatch({ ...good, fromCrs: 'edb' }, now)).toEqual({ ok: false, error: 'bad_station' });
    expect(parseWatch({ ...good, id: 'nope' }, now)).toEqual({ ok: false, error: 'bad_id' });
    expect(parseWatch({ ...good, departsAt: '2026-12-25T07:00:00Z' }, now)).toEqual({ ok: false, error: 'bad_time' });
    expect(parseWatch({ ...good, departsAt: '2026-10-01T07:00:00Z' }, now)).toEqual({ ok: false, error: 'bad_time' });
    expect(parseWatch({ ...good, bufferMinutes: -5 }, now)).toEqual({ ok: false, error: 'bad_minutes' });
    expect(parseWatch({ ...good, timezone: 'Europe/London; DROP TABLE' }, now)).toEqual({ ok: false, error: 'bad_timezone' });
    expect(parseWatch(null, now)).toEqual({ ok: false, error: 'bad_id' });
  });
});

describe('parseIds and parseDeviceId', () => {
  it('need real uuids', () => {
    expect(parseIds({ id: good.id, deviceId: good.deviceId }).ok).toBe(true);
    expect(parseIds({ id: good.id }).ok).toBe(false);
    expect(parseDeviceId({ deviceId: good.deviceId })).toEqual({ ok: true, value: good.deviceId });
    expect(parseDeviceId({ deviceId: 'x' }).ok).toBe(false);
  });
});
