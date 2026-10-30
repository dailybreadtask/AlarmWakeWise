/**
 * Plans the person approved, and how they went. Feedback is explicit: the app
 * asks, the person answers, and nothing is inferred from it without permission.
 */
import type { SqlDb } from '../storage/alarmRepository';
import type { TimelineEntry } from '../domain/planner';

export const PLAN_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS plan_record (
    id TEXT PRIMARY KEY NOT NULL,
    goal TEXT NOT NULL,
    event_at TEXT NOT NULL,
    wake_at TEXT NOT NULL,
    get_ready_minutes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_journey (
    plan_id TEXT PRIMARY KEY NOT NULL,
    from_crs TEXT NOT NULL,
    to_crs TEXT NOT NULL,
    train_id TEXT NOT NULL,
    departs_at TEXT NOT NULL,
    arrives_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    leave_after_wake_minutes INTEGER NOT NULL,
    buffer_minutes INTEGER NOT NULL,
    earliest_wake_at TEXT,
    wake_at TEXT NOT NULL,
    wake_native_id TEXT NOT NULL,
    timezone TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_timeline (
    plan_id TEXT PRIMARY KEY NOT NULL,
    entries TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_feedback (
    plan_id TEXT PRIMARY KEY NOT NULL,
    outcome TEXT NOT NULL,
    prep TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export const OUTCOMES = ['on_time', 'late', 'missed'] as const;
export const PREP_FEEL = ['more', 'right', 'less'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type PrepFeel = (typeof PREP_FEEL)[number];

export interface SavedPlan {
  id: string;
  goal: string;
  eventAt: string;
  wakeAt: string;
  getReadyMinutes: number;
  createdAt: string;
}

export interface PlanFeedback {
  planId: string;
  outcome: Outcome;
  prep: PrepFeel;
  createdAt: string;
}

export async function savePlan(db: SqlDb, plan: SavedPlan): Promise<void> {
  await db.runAsync('INSERT INTO plan_record (id, goal, event_at, wake_at, get_ready_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    plan.id,
    plan.goal,
    plan.eventAt,
    plan.wakeAt,
    plan.getReadyMinutes,
    plan.createdAt,
  ]);
}

export async function listPlans(db: SqlDb): Promise<SavedPlan[]> {
  const rows = await db.getAllAsync<{ id: string; goal: string; event_at: string; wake_at: string; get_ready_minutes: number; created_at: string }>(
    'SELECT id, goal, event_at, wake_at, get_ready_minutes, created_at FROM plan_record ORDER BY event_at DESC',
  );
  return rows.map((r) => ({ id: r.id, goal: r.goal, eventAt: r.event_at, wakeAt: r.wake_at, getReadyMinutes: r.get_ready_minutes, createdAt: r.created_at }));
}

/** A train journey saved with its plan, so it can be checked against the live board later. */
export interface SavedJourneyRecord {
  planId: string;
  fromCrs: string;
  toCrs: string;
  trainId: string;
  departsAt: Date;
  arrivesAt: Date;
  deadlineAt: Date;
  leaveAfterWakeMinutes: number;
  bufferMinutes: number;
  earliestWakeAt: Date | null;
  wakeAt: Date;
  /** The OS id of the wake alarm, so a change can cancel exactly that alarm. */
  wakeNativeId: string;
  timezone: string;
}

export async function saveJourney(db: SqlDb, j: SavedJourneyRecord): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO plan_journey (plan_id, from_crs, to_crs, train_id, departs_at, arrives_at, deadline_at, leave_after_wake_minutes, buffer_minutes, earliest_wake_at, wake_at, wake_native_id, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      j.planId,
      j.fromCrs,
      j.toCrs,
      j.trainId,
      j.departsAt.toISOString(),
      j.arrivesAt.toISOString(),
      j.deadlineAt.toISOString(),
      j.leaveAfterWakeMinutes,
      j.bufferMinutes,
      j.earliestWakeAt ? j.earliestWakeAt.toISOString() : null,
      j.wakeAt.toISOString(),
      j.wakeNativeId,
      j.timezone,
    ],
  );
}

export async function loadJourney(db: SqlDb, planId: string): Promise<SavedJourneyRecord | null> {
  const rows = await db.getAllAsync<{
    plan_id: string;
    from_crs: string;
    to_crs: string;
    train_id: string;
    departs_at: string;
    arrives_at: string;
    deadline_at: string;
    leave_after_wake_minutes: number;
    buffer_minutes: number;
    earliest_wake_at: string | null;
    wake_at: string;
    wake_native_id: string;
    timezone: string;
  }>('SELECT * FROM plan_journey WHERE plan_id = ?', [planId]);
  const r = rows[0];
  if (!r) return null;
  return {
    planId: r.plan_id,
    fromCrs: r.from_crs,
    toCrs: r.to_crs,
    trainId: r.train_id,
    departsAt: new Date(r.departs_at),
    arrivesAt: new Date(r.arrives_at),
    deadlineAt: new Date(r.deadline_at),
    leaveAfterWakeMinutes: r.leave_after_wake_minutes,
    bufferMinutes: r.buffer_minutes,
    earliestWakeAt: r.earliest_wake_at ? new Date(r.earliest_wake_at) : null,
    wakeAt: new Date(r.wake_at),
    wakeNativeId: r.wake_native_id,
    timezone: r.timezone,
  };
}

/** The steps of a saved plan, in order, so the briefing can name what is next. */
export async function saveTimeline(db: SqlDb, planId: string, timeline: TimelineEntry[]): Promise<void> {
  const entries = timeline.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() }));
  await db.runAsync('INSERT OR REPLACE INTO plan_timeline (plan_id, entries) VALUES (?, ?)', [planId, JSON.stringify(entries)]);
}

export async function loadTimeline(db: SqlDb, planId: string): Promise<TimelineEntry[]> {
  const rows = await db.getAllAsync<{ entries: string }>('SELECT entries FROM plan_timeline WHERE plan_id = ?', [planId]);
  if (rows.length === 0) return [];
  const parsed = JSON.parse(rows[0].entries) as (Omit<TimelineEntry, 'startsAt'> & { startsAt: string })[];
  return parsed.map((e) => ({ ...e, startsAt: new Date(e.startsAt) }));
}

export async function saveFeedback(db: SqlDb, feedback: PlanFeedback): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO plan_feedback (plan_id, outcome, prep, created_at) VALUES (?, ?, ?, ?)', [
    feedback.planId,
    feedback.outcome,
    feedback.prep,
    feedback.createdAt,
  ]);
}

export async function listFeedback(db: SqlDb): Promise<PlanFeedback[]> {
  const rows = await db.getAllAsync<{ plan_id: string; outcome: Outcome; prep: PrepFeel; created_at: string }>(
    'SELECT plan_id, outcome, prep, created_at FROM plan_feedback',
  );
  return rows.map((r) => ({ planId: r.plan_id, outcome: r.outcome, prep: r.prep, createdAt: r.created_at }));
}

/** Plans whose event time has passed and that have no feedback yet, most recent first. */
export async function plansAwaitingFeedback(db: SqlDb, now: Date): Promise<SavedPlan[]> {
  const [plans, feedback] = await Promise.all([listPlans(db), listFeedback(db)]);
  const answered = new Set(feedback.map((f) => f.planId));
  return plans.filter((p) => !answered.has(p.id) && new Date(p.eventAt).getTime() <= now.getTime());
}
