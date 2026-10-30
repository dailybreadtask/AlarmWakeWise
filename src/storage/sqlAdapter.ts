import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite';

import type { SqlDb } from './alarmRepository';

/** Presents the expo-sqlite database through the small interface the repositories use. */
export function sqlFrom(db: SQLiteDatabase): SqlDb {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = []) => db.runAsync(source, params as SQLiteBindParams),
    getAllAsync: <T>(source: string, params: (string | number | null)[] = []) => db.getAllAsync<T>(source, params as SQLiteBindParams),
  };
}
