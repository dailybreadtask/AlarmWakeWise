import { DatabaseSync } from 'node:sqlite';

import { suggestGetReady } from '../../src/plans/learning';
import { type SqlDb } from '../../src/storage/alarmRepository';
import { listFeedback, listPlans, plansAwaitingFeedback, PLAN_TABLE_SQL, saveFeedback, savePlan, type PlanFeedback } from '../../src/plans/planRepository';

function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(PLAN_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

const plan = (id: string, eventAt: string) => ({ id, goal: 'Be at work', eventAt, wakeAt: '2026-10-29T06:50:00Z', getReadyMinutes: 30, createdAt: '2026-10-28T20:00:00Z' });

describe('plans', () => {
  it('saves plans and lists the most recent event first', async () => {
    const db = memoryDb();
    await savePlan(db, plan('a', '2026-10-29T09:00:00Z'));
    await savePlan(db, plan('b', '2026-10-30T09:00:00Z'));
    expect((await listPlans(db)).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('asks for feedback only once the event has passed, and not again once answered', async () => {
    const db = memoryDb();
    await savePlan(db, plan('a', '2026-10-29T09:00:00Z'));
    await savePlan(db, plan('b', '2026-10-31T09:00:00Z'));
    const now = new Date('2026-10-30T08:00:00Z');
    expect((await plansAwaitingFeedback(db, now)).map((p) => p.id)).toEqual(['a']);
    await saveFeedback(db, { planId: 'a', outcome: 'on_time', prep: 'right', createdAt: now.toISOString() });
    expect(await plansAwaitingFeedback(db, now)).toEqual([]);
    expect(await listFeedback(db)).toHaveLength(1);
  });
});

describe('suggestGetReady', () => {
  const answer = (prep: PlanFeedback['prep']): PlanFeedback => ({ planId: prep, outcome: 'late', prep, createdAt: '2026-10-29T00:00:00Z' });

  it('says nothing until there are enough answers', () => {
    expect(suggestGetReady([answer('more'), answer('more')], 30)).toBeNull();
  });

  it('suggests more time when most answers say it was too little', () => {
    expect(suggestGetReady([answer('more'), answer('more'), answer('right')], 30)).toMatchObject({ minutes: 35 });
  });

  it('suggests less time when most answers say it was too much, and never below zero', () => {
    expect(suggestGetReady([answer('less'), answer('less'), answer('right')], 30)).toMatchObject({ minutes: 25 });
    expect(suggestGetReady([answer('less'), answer('less'), answer('less')], 3)).toMatchObject({ minutes: 0 });
  });

  it('says nothing when the answers do not agree', () => {
    expect(suggestGetReady([answer('more'), answer('less'), answer('right')], 30)).toBeNull();
  });
});
