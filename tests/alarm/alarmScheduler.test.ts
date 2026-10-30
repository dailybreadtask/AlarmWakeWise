import { ensureAuthorized, reconcile, scheduleAlarm, toNativeRequest, type AlarmBridge, type AuthState } from '../../src/alarm/alarmScheduler';

function fakeBridge(overrides: Partial<AlarmBridge> & { auth?: AuthState; supported?: boolean } = {}) {
  const calls: string[] = [];
  let auth: AuthState = overrides.auth ?? 'authorized';
  const bridge: AlarmBridge = {
    isSupported: () => overrides.supported ?? true,
    getAuthorization: () => auth,
    requestAuthorization: async () => {
      calls.push('request');
      auth = 'authorized';
      return auth;
    },
    schedule:
      overrides.schedule ??
      (async (req) => {
        calls.push(`schedule:${req.id}`);
        return { usedSound: 'systemDefault' };
      }),
    cancel: async () => undefined,
    scheduled: overrides.scheduled ?? (async () => []),
  };
  return { bridge, calls };
}

const spec = { nativeId: '7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b', wakeAt: new Date(2026, 9, 29, 6, 50), title: 'Wake up' };

describe('alarm scheduler', () => {
  it('asks for permission only when it has not been decided', async () => {
    const { bridge, calls } = fakeBridge({ auth: 'notDetermined' });
    expect(await ensureAuthorized(bridge)).toBe('authorized');
    expect(calls).toEqual(['request']);
  });

  it('does not ask again when permission was refused', async () => {
    const { bridge, calls } = fakeBridge({ auth: 'denied' });
    expect(await ensureAuthorized(bridge)).toBe('denied');
    expect(calls).toEqual([]);
  });

  it('reports unsupported where AlarmKit is not available', async () => {
    const { bridge } = fakeBridge({ supported: false });
    expect(await scheduleAlarm(bridge, spec)).toEqual({ ok: false, error: 'unsupported' });
  });

  it('refuses to schedule without permission', async () => {
    const { bridge, calls } = fakeBridge({ auth: 'denied' });
    expect(await scheduleAlarm(bridge, spec)).toEqual({ ok: false, error: 'not_authorized' });
    expect(calls).toEqual([]);
  });

  it('reports success only when the bridge accepted the alarm', async () => {
    const { bridge, calls } = fakeBridge();
    expect(await scheduleAlarm(bridge, spec)).toEqual({ ok: true, usedSound: 'systemDefault' });
    expect(calls).toEqual([`schedule:${spec.nativeId}`]);
  });

  it('reports a native failure rather than claiming the alarm is set', async () => {
    const { bridge } = fakeBridge({ schedule: async () => { throw new Error('limit'); } });
    expect(await scheduleAlarm(bridge, spec)).toEqual({ ok: false, error: 'native_failed' });
  });

  it('sends the wake time as the local hour and minute', () => {
    expect(toNativeRequest(spec)).toMatchObject({ hour: 6, minute: 50, weekdays: [], snoozeMinutes: 0 });
  });

  it('reports expected alarms the OS no longer holds, without changing anything', async () => {
    const { bridge, calls } = fakeBridge({ scheduled: async () => [{ id: 'kept', state: 'scheduled' }] });
    expect(await reconcile(bridge, ['kept', 'gone'])).toEqual({ missing: ['gone'] });
    expect(calls).toEqual([]);
  });
});
