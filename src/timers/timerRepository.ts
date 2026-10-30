/**
 * Countdown timers on the phone. Each timer's end is a scheduled notification,
 * so the record keeps its notification id to cancel it later.
 */
import type { SqlDb } from '../storage/alarmRepository';

export const TIMER_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS timer (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    notification_id TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export type TimerStatus = 'running' | 'done' | 'cancelled';

export interface SavedTimer {
  id: string;
  label: string;
  endsAt: string;
  notificationId: string | null;
  status: TimerStatus;
  createdAt: string;
}

export async function insertTimer(db: SqlDb, t: Omit<SavedTimer, 'status'>): Promise<void> {
  await db.runAsync('INSERT INTO timer (id, label, ends_at, notification_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    t.id,
    t.label,
    t.endsAt,
    t.notificationId,
    'running',
    t.createdAt,
  ]);
}

export async function listTimers(db: SqlDb): Promise<SavedTimer[]> {
  const rows = await db.getAllAsync<{ id: string; label: string; ends_at: string; notification_id: string | null; status: TimerStatus; created_at: string }>(
    'SELECT id, label, ends_at, notification_id, status, created_at FROM timer ORDER BY ends_at ASC',
  );
  return rows.map((r) => ({ id: r.id, label: r.label, endsAt: r.ends_at, notificationId: r.notification_id, status: r.status, createdAt: r.created_at }));
}

export async function setTimerStatus(db: SqlDb, id: string, status: TimerStatus): Promise<void> {
  await db.runAsync('UPDATE timer SET status = ? WHERE id = ?', [status, id]);
}
