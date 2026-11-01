import { runWatchCycle, alertFor, savedJourneyOf } from '../../server/watcher';
import { assessJourney } from '../../src/journey/journeyCheck';
import type { ActiveWatch, WatchStore } from '../../server/watchStore';
import type { PushPayload, PushResult, PushTarget } from '../../server/push';
import type { BoardDeparture } from '../../src/domain/railJourney';

const watch: ActiveWatch = {
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

const train = (id: string, scheduled: string, expected: string, arrives: string, arrivesExpected = 'On time', status = 'On time'): BoardDeparture => ({
  trainId: id,
  serviceDate: '2026-11-02',
  scheduled,
  expected,
  arrivesScheduled: arrives,
  arrivesExpected,
  status,
  platform: null,
});

const fine = [train('T1', '07:57', 'On time', '08:40')];
const late = [train('T1', '07:57', '08:25', '08:40', '09:10', 'Expected 08:25'), train('T2', '08:15', 'On time', '08:48')];
const cancelled = [train('T1', '07:57', 'Cancelled', '08:40', 'Cancelled', 'Cancelled'), train('T2', '08:15', 'On time', '08:48')];
const cancelledNoAlt = [train('T1', '07:57', 'Cancelled', '08:40', 'Cancelled', 'Cancelled')];

function fakeStore(watches: ActiveWatch[]) {
  const log = { assessed: [] as [string, string, string | null | undefined][], finished: [] as string[], deleted: [] as string[] };
  const store: WatchStore = {
    upsertDevice: async () => 'd1',
    upsertWatch: async () => undefined,
    countActive: async () => 0,
    cancelWatch: async () => undefined,
    deleteDevice: async () => undefined,
    deleteDeviceByToken: async (t) => void log.deleted.push(t),
    activeWatches: async () => watches,
    recordAssessment: async (id, status, notified) => void log.assessed.push([id, status, notified]),
    finishWatch: async (id) => void log.finished.push(id),
    purge: async () => 0,
  };
  return { store, log };
}

const now = new Date('2026-11-02T06:00:00Z');

describe('alertFor', () => {
  const journey = savedJourneyOf(watch);

  it('offers a later train and says nothing has moved', () => {
    const alert = alertFor(assessJourney(journey, late, now), journey);
    expect(alert?.title).toBe('Your train is delayed');
    expect(alert?.body).toBe('Your 07:57 train is running late. The 08:15 still gets you there if you wake at 07:35. Open WakeWise to approve the change. Your alarm has not moved.');
  });

  it('says so when a train is cancelled and another works', () => {
    expect(alertFor(assessJourney(journey, cancelled, now), journey)?.title).toBe('Your train is cancelled');
  });

  it('is honest when no later train works', () => {
    expect(alertFor(assessJourney(journey, cancelledNoAlt, now), journey)?.body).toMatch(/No later train gets you there in time/);
  });

  it('stays quiet when the train is on time', () => {
    expect(alertFor(assessJourney(journey, fine, now), journey)).toBeNull();
  });
});

describe('runWatchCycle', () => {
  const sendOk = () => {
    const sent: { target: PushTarget; payload: PushPayload }[] = [];
    const push = async (target: PushTarget, payload: PushPayload): Promise<PushResult> => {
      sent.push({ target, payload });
      return { ok: true };
    };
    return { push, sent };
  };

  it('sends one push when the train becomes late, and records it', async () => {
    const { store, log } = fakeStore([watch]);
    const { push, sent } = sendOk();
    const result = await runWatchCycle({ store, board: () => late, push, now });
    expect(result).toEqual({ checked: 1, notified: 1, finished: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].target).toEqual({ token: 'tok', environment: 'sandbox' });
    expect(log.assessed[0]).toEqual(['w1', 'at_risk', 'at_risk']);
  });

  it('does not send the same push again at the next check', async () => {
    const { store, log } = fakeStore([{ ...watch, lastNotifiedStatus: 'at_risk' }]);
    const { push, sent } = sendOk();
    const result = await runWatchCycle({ store, board: () => late, push, now });
    expect(result.notified).toBe(0);
    expect(sent).toHaveLength(0);
    expect(log.assessed[0]).toEqual(['w1', 'at_risk', undefined]);
  });

  it('tells a different problem, and forgets the push when the train is fine again', async () => {
    const a = fakeStore([{ ...watch, lastNotifiedStatus: 'at_risk' }]);
    const s1 = sendOk();
    expect((await runWatchCycle({ store: a.store, board: () => cancelled, push: s1.push, now })).notified).toBe(1);

    const b = fakeStore([{ ...watch, lastNotifiedStatus: 'at_risk' }]);
    const s2 = sendOk();
    await runWatchCycle({ store: b.store, board: () => fine, push: s2.push, now });
    expect(s2.sent).toHaveLength(0);
    expect(b.log.assessed[0]).toEqual(['w1', 'on_time', null]);
  });

  it('skips a watch when the feed cannot answer, rather than guessing', async () => {
    const { store, log } = fakeStore([watch]);
    const { push, sent } = sendOk();
    expect(await runWatchCycle({ store, board: () => null, push, now })).toEqual({ checked: 0, notified: 0, finished: 0 });
    expect(sent).toHaveLength(0);
    expect(log.assessed).toEqual([]);
  });

  it('forgets a device Apple no longer knows, and tries again at the next check for other failures', async () => {
    const gone = fakeStore([watch]);
    await runWatchCycle({ store: gone.store, board: () => late, push: async () => ({ ok: false, status: 410, reason: 'Unregistered', invalidToken: true }), now });
    expect(gone.log.deleted).toEqual(['tok']);

    const flaky = fakeStore([watch]);
    await runWatchCycle({ store: flaky.store, board: () => late, push: async () => ({ ok: false, status: 0, reason: 'network', invalidToken: false }), now });
    expect(flaky.log.deleted).toEqual([]);
    expect(flaky.log.assessed[0]).toEqual(['w1', 'at_risk', undefined]);
  });

  it('finishes a journey that is long over', async () => {
    const { store, log } = fakeStore([watch]);
    const { push } = sendOk();
    const result = await runWatchCycle({ store, board: () => late, push, now: new Date('2026-11-02T12:00:00Z') });
    expect(result).toEqual({ checked: 0, notified: 0, finished: 1 });
    expect(log.finished).toEqual(['w1']);
  });
});
