import { DatabaseSync } from 'node:sqlite';

import type { ReminderBridge } from '../../src/reminders/reminderScheduler';
import type { SqlDb } from '../../src/storage/alarmRepository';
import { cancelTimer, durationWords, runningTimers, startTimer } from '../../src/timers/timerService';
import type { AlarmBridge } from '../../src/alarm/alarmScheduler';
import { listTimers, TIMER_TABLE_SQL } from '../../src/timers/timerRepository';

function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(TIMER_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

function fakeBridge(permitted = true) {
  const scheduled: { at: Date; title: string }[] = [];
  const cancelled: string[] = [];
  const bridge: ReminderBridge = {
    requestPermission: async () => permitted,
    schedule: async (at, title) => {
      scheduled.push({ at, title });
      return `n-${scheduled.length}`;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
  };
  return { bridge, scheduled, cancelled };
}

const now = new Date('2026-10-30T12:00:00Z');

describe('startTimer', () => {
  it('schedules the end at the right time and saves the timer', async () => {
    const { bridge, scheduled } = fakeBridge();
    const db = memoryDb();
    const result = await startTimer(bridge, db, { id: 't1', label: 'Bake', minutes: 25, now });
    expect(result.ok).toBe(true);
    expect(scheduled[0]).toEqual({ at: new Date('2026-10-30T12:25:00Z'), title: 'Bake' });
    const [saved] = await listTimers(db);
    expect(saved).toMatchObject({ label: 'Bake', status: 'running', notificationId: 'notification:n-1' });
  });

  it('refuses without permission and saves nothing', async () => {
    const { bridge, scheduled } = fakeBridge(false);
    const db = memoryDb();
    expect(await startTimer(bridge, db, { id: 't1', label: 'Bake', minutes: 25, now })).toEqual({ ok: false, error: 'not_permitted' });
    expect(scheduled).toEqual([]);
    expect(await listTimers(db)).toEqual([]);
  });

  it('refuses an empty label, a zero length, or more than a day', async () => {
    const { bridge } = fakeBridge();
    const db = memoryDb();
    expect(await startTimer(bridge, db, { id: 't1', label: '  ', minutes: 5, now })).toEqual({ ok: false, error: 'bad_label' });
    expect(await startTimer(bridge, db, { id: 't2', label: 'Tea', minutes: 0, now })).toEqual({ ok: false, error: 'too_long' });
    expect(await startTimer(bridge, db, { id: 't3', label: 'Tea', minutes: 1441, now })).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('cancelTimer and running timers', () => {
  it('cancels the notification and marks the timer cancelled', async () => {
    const { bridge, cancelled } = fakeBridge();
    const db = memoryDb();
    const started = await startTimer(bridge, db, { id: 't1', label: 'Tea', minutes: 5, now });
    if (!started.ok) throw new Error('expected a timer');
    await cancelTimer(bridge, db, started.timer);
    expect(cancelled).toEqual(['n-1']);
    expect((await listTimers(db))[0].status).toBe('cancelled');
  });

  it('lists only timers still running at the given time', async () => {
    const { bridge } = fakeBridge();
    const db = memoryDb();
    await startTimer(bridge, db, { id: 't1', label: 'Short', minutes: 5, now });
    await startTimer(bridge, db, { id: 't2', label: 'Long', minutes: 30, now });
    const later = new Date('2026-10-30T12:10:00Z');
    expect((await runningTimers(db, later)).map((t) => t.label)).toEqual(['Long']);
  });
});

describe('planned timer start', () => {
  it('ends a timer at its planned start plus its length', async () => {
    const { bridge, scheduled } = fakeBridge();
    const db = memoryDb();
    const result = await startTimer(bridge, db, { id: 't1', label: 'Bake', minutes: 25, now, startAt: new Date('2026-10-30T12:40:00Z') });
    expect(result.ok).toBe(true);
    expect(scheduled[0].at).toEqual(new Date('2026-10-30T13:05:00Z'));
  });

  it('refuses a planned timer that would already have ended', async () => {
    const { bridge } = fakeBridge();
    const db = memoryDb();
    expect(await startTimer(bridge, db, { id: 't1', label: 'Bake', minutes: 5, now, startAt: new Date('2026-10-30T11:00:00Z') })).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('AlarmKit timers', () => {
  function fakeAlarm(auth: 'authorized' | 'denied' = 'authorized') {
    const scheduled: { id: string; hour: number; minute: number }[] = [];
    const cancelled: string[] = [];
    const bridge: AlarmBridge = {
      isSupported: () => true,
      getAuthorization: () => auth,
      requestAuthorization: async () => auth,
      schedule: async (request) => {
        scheduled.push({ id: request.id, hour: request.hour, minute: request.minute });
        return { usedSound: 'systemDefault' };
      },
      cancel: async (id) => {
        cancelled.push(id);
      },
      scheduled: async () => [],
    };
    return { bridge, scheduled, cancelled };
  }

  it('sets an AlarmKit alarm at the end time when AlarmKit is available', async () => {
    const { bridge: notes } = fakeBridge();
    const { bridge: alarm, scheduled } = fakeAlarm();
    const db = memoryDb();
    const result = await startTimer(notes, db, { id: 't1', label: 'Bake', minutes: 25, now: new Date(2026, 9, 30, 12, 0), nativeId: '7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b' }, alarm);
    expect(result.ok).toBe(true);
    expect(scheduled[0]).toMatchObject({ id: '7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b', hour: 12, minute: 25 });
    expect((await listTimers(db))[0].notificationId).toBe('alarm:7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b');
  });

  it('uses a notification, which is on time to the second, for a timer under a minute', async () => {
    const { bridge: notes, scheduled: noteScheduled } = fakeBridge();
    const { bridge: alarm, scheduled } = fakeAlarm();
    const db = memoryDb();
    const result = await startTimer(notes, db, { id: 't1', label: 'Tea', seconds: 30, now }, alarm);
    expect(result.ok).toBe(true);
    expect(scheduled).toEqual([]);
    expect(noteScheduled[0].at).toEqual(new Date('2026-10-30T12:00:30Z'));
    expect((await listTimers(db))[0].notificationId).toBe('notification:n-1');
  });

  it('falls back to a notification when AlarmKit is not authorised', async () => {
    const { bridge: notes, scheduled: noteScheduled } = fakeBridge();
    const { bridge: alarm, scheduled } = fakeAlarm('denied');
    const db = memoryDb();
    await startTimer(notes, db, { id: 't1', label: 'Tea', minutes: 5, now }, alarm);
    expect(scheduled).toEqual([]);
    expect(noteScheduled).toHaveLength(1);
    expect((await listTimers(db))[0].notificationId).toBe('notification:n-1');
  });

  it('cancels the alarm that the timer refers to', async () => {
    const { bridge: notes } = fakeBridge();
    const { bridge: alarm, cancelled } = fakeAlarm();
    const db = memoryDb();
    const started = await startTimer(notes, db, { id: 't1', label: 'Bake', minutes: 25, now, nativeId: 'abc' }, alarm);
    if (!started.ok) throw new Error('expected a timer');
    await cancelTimer(notes, db, started.timer, alarm);
    expect(cancelled).toEqual(['abc']);
  });
});

describe('timers in seconds', () => {
  it('ends at the second, not the minute', async () => {
    const { bridge, scheduled } = fakeBridge();
    const db = memoryDb();
    const result = await startTimer(bridge, db, { id: 't1', label: 'Egg', seconds: 90, now }, undefined);
    expect(result.ok).toBe(true);
    expect(scheduled[0].at).toEqual(new Date('2026-10-30T12:01:30Z'));
  });

  it('accepts one second and refuses none or more than a day', async () => {
    const { bridge } = fakeBridge();
    const db = memoryDb();
    expect((await startTimer(bridge, db, { id: 'a', label: 'x', seconds: 1, now })).ok).toBe(true);
    expect(await startTimer(bridge, db, { id: 'b', label: 'x', seconds: 0, now })).toEqual({ ok: false, error: 'too_long' });
    expect(await startTimer(bridge, db, { id: 'c', label: 'x', seconds: 24 * 3600 + 1, now })).toEqual({ ok: false, error: 'too_long' });
    expect(await startTimer(bridge, db, { id: 'd', label: 'x', seconds: 1.5, now })).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('durationWords', () => {
  it('says a length in plain words', () => {
    expect(durationWords(30)).toBe('30 sec');
    expect(durationWords(60)).toBe('1 min');
    expect(durationWords(90)).toBe('1 min 30 sec');
    expect(durationWords(3900)).toBe('1 h 5 min');
    expect(durationWords(0)).toBe('0 sec');
  });
});
