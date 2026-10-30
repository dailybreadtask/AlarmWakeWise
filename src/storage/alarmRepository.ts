/**
 * Saved alarms on the phone. The OS holds the real alarm; this record lets the
 * app show what it set and notice when iOS no longer holds one. Nothing here
 * reschedules or moves an alarm.
 */
export const ALARM_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alarm (
    id TEXT PRIMARY KEY NOT NULL,
    native_id TEXT NOT NULL UNIQUE,
    wake_at TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

/** The subset of the expo-sqlite database API this module uses. */
export interface SqlDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, params?: (string | number | null)[]): Promise<T[]>;
}

export type AlarmStatus = 'scheduled' | 'missing' | 'cancelled';

export interface SavedAlarm {
  id: string;
  nativeId: string;
  wakeAt: string;
  title: string;
  /** Where the alarm came from, e.g. "quick" or "plan". */
  source: string;
  status: AlarmStatus;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  native_id: string;
  wake_at: string;
  title: string;
  source: string;
  status: AlarmStatus;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): SavedAlarm => ({
  id: r.id,
  nativeId: r.native_id,
  wakeAt: r.wake_at,
  title: r.title,
  source: r.source,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function saveAlarm(db: SqlDb, alarm: Omit<SavedAlarm, 'status' | 'updatedAt'>): Promise<void> {
  await db.runAsync(
    'INSERT INTO alarm (id, native_id, wake_at, title, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [alarm.id, alarm.nativeId, alarm.wakeAt, alarm.title, alarm.source, 'scheduled', alarm.createdAt, alarm.createdAt],
  );
}

/** Upcoming and recent alarms, earliest first. */
export async function listAlarms(db: SqlDb): Promise<SavedAlarm[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM alarm ORDER BY wake_at ASC');
  return rows.map(fromRow);
}

/**
 * Compares the saved alarms with the ones iOS holds. An alarm that is saved as
 * scheduled but missing from iOS is marked missing. Returns the ones that changed.
 */
export async function reconcileAlarms(db: SqlDb, heldNativeIds: string[], at: string): Promise<SavedAlarm[]> {
  const held = new Set(heldNativeIds);
  const alarms = await listAlarms(db);
  const changed: SavedAlarm[] = [];
  for (const alarm of alarms) {
    if (alarm.status !== 'scheduled' || held.has(alarm.nativeId)) continue;
    await db.runAsync('UPDATE alarm SET status = ?, updated_at = ? WHERE id = ?', ['missing', at, alarm.id]);
    changed.push({ ...alarm, status: 'missing', updatedAt: at });
  }
  return changed;
}

/** Marks the saved record of an OS alarm as cancelled, e.g. after it was moved. */
export async function markAlarmCancelled(db: SqlDb, nativeId: string, at: string): Promise<void> {
  await db.runAsync('UPDATE alarm SET status = ?, updated_at = ? WHERE native_id = ?', ['cancelled', at, nativeId]);
}
