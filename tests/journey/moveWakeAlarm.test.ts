import { moveWakeAlarm } from '../../src/journey/moveWakeAlarm';
import type { AlarmBridge } from '../../src/alarm/alarmScheduler';

function bridgeWith(opts: { scheduleFails?: boolean; cancelFails?: boolean } = {}) {
  const calls: string[] = [];
  const bridge: AlarmBridge = {
    isSupported: () => true,
    getAuthorization: () => 'authorized',
    requestAuthorization: async () => 'authorized',
    schedule: async (request) => {
      calls.push(`schedule:${request.id}`);
      if (opts.scheduleFails) throw new Error('refused');
      return { usedSound: 'systemDefault' };
    },
    cancel: async (id) => {
      calls.push(`cancel:${id}`);
      if (opts.cancelFails) throw new Error('gone');
    },
    scheduled: async () => [],
  };
  return { bridge, calls };
}

const input = { oldNativeId: 'old', newNativeId: 'new', wakeAt: new Date(2026, 9, 30, 7, 30), title: 'WakeWise alarm' };

describe('moveWakeAlarm', () => {
  it('sets the new alarm first, then cancels the old one', async () => {
    const { bridge, calls } = bridgeWith();
    expect(await moveWakeAlarm({ ...input, bridge })).toEqual({ ok: true, cancelledOld: true });
    expect(calls).toEqual(['schedule:new', 'cancel:old']);
  });

  it('keeps the old alarm if the new one cannot be set', async () => {
    const { bridge, calls } = bridgeWith({ scheduleFails: true });
    expect(await moveWakeAlarm({ ...input, bridge })).toEqual({ ok: false, error: 'native_failed', oldKept: true });
    expect(calls).toEqual(['schedule:new']);
  });

  it('says so if the old alarm could not be cancelled, since the person is still woken', async () => {
    const { bridge } = bridgeWith({ cancelFails: true });
    expect(await moveWakeAlarm({ ...input, bridge })).toEqual({ ok: true, cancelledOld: false });
  });
});
