import { DatabaseSync } from 'node:sqlite';

import { type SqlDb } from '../../src/storage/alarmRepository';
import { loadTimeline, PLAN_TABLE_SQL, saveTimeline } from '../../src/plans/planRepository';
import type { TimelineEntry } from '../../src/domain/planner';

function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(PLAN_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

describe('plan timelines', () => {
  it('keeps the steps, their order and their start times', async () => {
    const db = memoryDb();
    const timeline: TimelineEntry[] = [
      { id: 'wake', label: 'Wake up', kind: 'wake', startsAt: new Date('2026-10-30T06:50:00Z'), minutes: 0, source: null },
      { id: 'walk', label: 'Walk to the station', kind: 'travel', startsAt: new Date('2026-10-30T07:30:00Z'), minutes: 10, source: 'estimated' },
    ];
    await saveTimeline(db, 'plan-1', timeline);
    const loaded = await loadTimeline(db, 'plan-1');
    expect(loaded).toEqual(timeline);
    expect(loaded[1].startsAt).toBeInstanceOf(Date);
  });

  it('returns nothing for a plan with no timeline', async () => {
    expect(await loadTimeline(memoryDb(), 'missing')).toEqual([]);
  });
});
