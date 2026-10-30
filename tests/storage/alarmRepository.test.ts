import { DatabaseSync } from 'node:sqlite';

import { ALARM_TABLE_SQL, listAlarms, markAlarmCancelled, reconcileAlarms, saveAlarm, type SqlDb } from '../../src/storage/alarmRepository';

/** A real SQLite database in memory, behind the same interface the phone's database uses. */
function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(ALARM_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

const alarm = (id: string, nativeId: string, wakeAt: string) => ({ id, nativeId, wakeAt, title: 'Wake up', source: 'quick', createdAt: '2026-10-29T08:00:00Z' });

describe('alarm repository', () => {
  it('saves an alarm as scheduled and lists it earliest first', async () => {
    const db = memoryDb();
    await saveAlarm(db, alarm('a2', 'n2', '2026-10-30T07:00:00Z'));
    await saveAlarm(db, alarm('a1', 'n1', '2026-10-29T06:50:00Z'));
    const list = await listAlarms(db);
    expect(list.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(list[0]).toMatchObject({ status: 'scheduled', nativeId: 'n1', source: 'quick' });
  });

  it('refuses a second record for the same native alarm', async () => {
    const db = memoryDb();
    await saveAlarm(db, alarm('a1', 'n1', '2026-10-29T06:50:00Z'));
    await expect(saveAlarm(db, alarm('a2', 'n1', '2026-10-29T07:00:00Z'))).rejects.toThrow();
  });

  it('marks a scheduled alarm missing when iOS no longer holds it, and changes nothing else', async () => {
    const db = memoryDb();
    await saveAlarm(db, alarm('a1', 'n1', '2026-10-29T06:50:00Z'));
    await saveAlarm(db, alarm('a2', 'n2', '2026-10-29T07:50:00Z'));
    const changed = await reconcileAlarms(db, ['n2'], '2026-10-29T08:00:00Z');
    expect(changed.map((a) => [a.id, a.status])).toEqual([['a1', 'missing']]);
    const list = await listAlarms(db);
    expect(list.find((a) => a.id === 'a2')?.status).toBe('scheduled');
    expect(list.find((a) => a.id === 'a1')).toMatchObject({ status: 'missing', updatedAt: '2026-10-29T08:00:00Z' });
  });

  it('does not report an alarm that is still held', async () => {
    const db = memoryDb();
    await saveAlarm(db, alarm('a1', 'n1', '2026-10-29T06:50:00Z'));
    expect(await reconcileAlarms(db, ['n1'], '2026-10-29T08:00:00Z')).toEqual([]);
  });
});

describe('cancelled alarms', () => {
  it('marks the alarm cancelled by its OS id, and leaves the others alone', async () => {
    const db = memoryDb();
    await saveAlarm(db, alarm('a1', 'n1', '2026-10-29T06:50:00Z'));
    await saveAlarm(db, alarm('a2', 'n2', '2026-10-29T07:50:00Z'));
    await markAlarmCancelled(db, 'n1', '2026-10-29T08:00:00Z');
    const list = await listAlarms(db);
    expect(list.find((a) => a.id === 'a1')?.status).toBe('cancelled');
    expect(list.find((a) => a.id === 'a2')?.status).toBe('scheduled');
  });
});
