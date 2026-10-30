import { DatabaseSync } from 'node:sqlite';

import { type SqlDb } from '../../src/storage/alarmRepository';
import { loadJourney, PLAN_TABLE_SQL, saveJourney, type SavedJourneyRecord } from '../../src/plans/planRepository';

function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(PLAN_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

const journey: SavedJourneyRecord = {
  planId: 'plan-1',
  fromCrs: 'BHG',
  toCrs: 'EDB',
  trainId: 'T0757',
  departsAt: new Date('2026-10-30T07:57:00Z'),
  arrivesAt: new Date('2026-10-30T08:34:00Z'),
  deadlineAt: new Date('2026-10-30T09:00:00Z'),
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: new Date('2026-10-30T06:15:00Z'),
  wakeAt: new Date('2026-10-30T07:10:00Z'),
  wakeNativeId: '7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b',
  timezone: 'Europe/London',
};

describe('saved journeys', () => {
  it('keeps the route, the train, the deadline, the wake alarm and the limits', async () => {
    const db = memoryDb();
    await saveJourney(db, journey);
    expect(await loadJourney(db, 'plan-1')).toEqual(journey);
  });

  it('keeps no earliest-wake limit when none was set', async () => {
    const db = memoryDb();
    await saveJourney(db, { ...journey, earliestWakeAt: null });
    expect((await loadJourney(db, 'plan-1'))?.earliestWakeAt).toBeNull();
  });

  it('returns nothing for a plan without a journey', async () => {
    expect(await loadJourney(memoryDb(), 'none')).toBeNull();
  });
});
