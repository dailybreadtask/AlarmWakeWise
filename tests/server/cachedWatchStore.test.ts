import { CachedWatchStore, REFRESH_AFTER_MS } from '../../server/cachedWatchStore';
import type { ActiveWatch, WatchInput, WatchStore } from '../../server/watchStore';

const base: ActiveWatch = {
  id: 'w1',
  deviceId: 'd1',
  fromCrs: 'EDB',
  toCrs: 'GLQ',
  trainId: 'T1',
  departsAt: new Date('2026-11-02T07:57:00Z'),
  arrivesAt: new Date('2026-11-02T08:40:00Z'),
  deadlineAt: new Date('2026-11-02T09:00:00Z'),
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: null,
  wakeAt: new Date('2026-11-02T07:17:00Z'),
  timezone: 'Europe/London',
  lastNotifiedStatus: null,
  device: { id: 'd1', apnsToken: 'tok', environment: 'sandbox' },
};

/** A database that counts how often it is asked. */
function counting(rows: ActiveWatch[]) {
  const calls: string[] = [];
  const inner: WatchStore = {
    upsertDevice: async () => (calls.push('upsertDevice'), 'd1'),
    upsertWatch: async () => void calls.push('upsertWatch'),
    countActive: async () => (calls.push('countActive'), 0),
    cancelWatch: async () => void calls.push('cancelWatch'),
    deleteDevice: async () => void calls.push('deleteDevice'),
    deleteDeviceByToken: async () => void calls.push('deleteDeviceByToken'),
    activeWatches: async () => (calls.push('activeWatches'), rows.map((r) => ({ ...r }))),
    activeWatch: async (id) => (calls.push('activeWatch'), rows.find((r) => r.id === id) ?? null),
    recordAssessment: async () => void calls.push('recordAssessment'),
    finishWatch: async () => void calls.push('finishWatch'),
    purge: async () => (calls.push('purge'), 0),
  };
  return { inner, calls };
}

describe('CachedWatchStore', () => {
  it('asks the database once, however often the cycle runs', async () => {
    const { inner, calls } = counting([base]);
    const store = new CachedWatchStore(inner);
    for (let i = 0; i < 50; i++) await store.activeWatches();
    expect(calls).toEqual(['activeWatches']);
  });

  it('reads again after the refresh time, and not before', async () => {
    const { inner, calls } = counting([base]);
    let t = 1_000;
    const store = new CachedWatchStore(inner, () => t);
    await store.activeWatches();
    t += REFRESH_AFTER_MS - 1;
    await store.activeWatches();
    expect(calls).toEqual(['activeWatches']);
    t += 1;
    await store.activeWatches();
    expect(calls).toEqual(['activeWatches', 'activeWatches']);
  });

  it('does not write "checked, nothing changed" to the database', async () => {
    const { inner, calls } = counting([base]);
    const store = new CachedWatchStore(inner);
    await store.activeWatches();
    await store.recordAssessment('w1', 'on_time', undefined, new Date());
    await store.recordAssessment('w1', 'on_time', null, new Date());
    expect(calls).toEqual(['activeWatches']);
  });

  it('writes a change in what the person was told, once, and remembers it', async () => {
    const { inner, calls } = counting([base]);
    const store = new CachedWatchStore(inner);
    await store.activeWatches();
    await store.recordAssessment('w1', 'at_risk', 'at_risk', new Date());
    await store.recordAssessment('w1', 'at_risk', 'at_risk', new Date());
    expect(calls).toEqual(['activeWatches', 'recordAssessment']);
    expect((await store.activeWatches())[0].lastNotifiedStatus).toBe('at_risk');
    await store.recordAssessment('w1', 'on_time', null, new Date());
    expect(calls.filter((c) => c === 'recordAssessment')).toHaveLength(2);
  });

  it('keeps going when the database cannot be reached while recording', async () => {
    const { inner } = counting([base]);
    inner.recordAssessment = async () => {
      throw new Error('quota');
    };
    inner.finishWatch = async () => {
      throw new Error('quota');
    };
    const store = new CachedWatchStore(inner);
    await store.activeWatches();
    await expect(store.recordAssessment('w1', 'at_risk', 'at_risk', new Date())).resolves.toBeUndefined();
    await expect(store.finishWatch('w1')).resolves.toBeUndefined();
    expect(await store.activeWatches()).toEqual([]);
  });

  it('adds a saved watch by reading just that one back', async () => {
    const rows: ActiveWatch[] = [];
    const { inner, calls } = counting(rows);
    const store = new CachedWatchStore(inner);
    expect(await store.activeWatches()).toEqual([]);
    rows.push(base);
    await store.upsertWatch(base as WatchInput);
    expect((await store.activeWatches()).map((w) => w.id)).toEqual(['w1']);
    expect(calls).toEqual(['activeWatches', 'upsertWatch', 'activeWatch']);
  });

  it('forgets a watch that was cancelled, finished, or whose device was deleted', async () => {
    const two = { ...base, id: 'w2', deviceId: 'd2', device: { id: 'd2', apnsToken: 'tok2', environment: 'sandbox' as const } };
    const three = { ...base, id: 'w3', deviceId: 'd3', device: { id: 'd3', apnsToken: 'tok3', environment: 'sandbox' as const } };
    const { inner } = counting([base, two, three]);
    const store = new CachedWatchStore(inner);
    await store.activeWatches();
    await store.cancelWatch('w1', 'wrong-device');
    expect(await store.activeWatches()).toHaveLength(3);
    await store.cancelWatch('w1', 'd1');
    await store.deleteDevice('d2');
    await store.deleteDeviceByToken('tok3');
    expect(await store.activeWatches()).toEqual([]);
  });
});
