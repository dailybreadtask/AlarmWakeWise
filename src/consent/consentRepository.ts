import type { SQLiteDatabase } from 'expo-sqlite';

import type { ContextScope } from '../domain/context';
import type { ConsentEntry, ConsentMap } from './consent';

export const CONSENT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS consent_scope (
    scope TEXT PRIMARY KEY NOT NULL,
    granted INTEGER NOT NULL,
    changed_at TEXT NOT NULL
  );
`;

interface ConsentRow {
  scope: ContextScope;
  granted: number;
  changed_at: string;
}

export async function loadConsent(db: SQLiteDatabase): Promise<ConsentMap> {
  const rows = await db.getAllAsync<ConsentRow>('SELECT scope, granted, changed_at FROM consent_scope');
  const map: ConsentMap = {};
  for (const row of rows) map[row.scope] = { granted: row.granted === 1, changedAt: row.changed_at };
  return map;
}

export async function saveConsent(db: SQLiteDatabase, scope: ContextScope, entry: ConsentEntry): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO consent_scope (scope, granted, changed_at) VALUES (?, ?, ?)', [scope, entry.granted ? 1 : 0, entry.changedAt]);
}
