/**
 * Personal context kept on the phone: saved places and planning preferences.
 * Only a place's label and area ever go to the AI service (ADR-005). Stations
 * may carry a code so a train plan can use them.
 */
import type { SqlDb } from '../storage/alarmRepository';
import { DEFAULT_WAKE_SOUND_ID, WAKE_SOUNDS } from '../sound/wakeSounds';

export const CONTEXT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS place (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    area TEXT,
    kind TEXT NOT NULL,
    crs TEXT,
    created_at TEXT NOT NULL,
    lat REAL,
    lon REAL
  );
  CREATE TABLE IF NOT EXISTS preference (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const PLACE_KINDS = ['home', 'work', 'station', 'other'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface SavedPlace {
  id: string;
  label: string;
  area: string | null;
  kind: PlaceKind;
  /** Station code, for a station the person uses. Null for other places. */
  crs: string | null;
  /** Where the place is, when it was found by search. Kept on the phone and never sent with a request. */
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export type Appearance = 'night' | 'day' | 'auto';
export const APPEARANCES: readonly Appearance[] = ['night', 'day', 'auto'];

export type WakeMode = 'simple' | 'challenge';
export type ChallengeType = 'maths' | 'pattern';
export const WAKE_MODES: readonly WakeMode[] = ['simple', 'challenge'];
export const CHALLENGE_TYPES: readonly ChallengeType[] = ['maths', 'pattern'];

export interface Preferences {
  /** Night, day, or follow the phone. Night is the default. */
  appearance: Appearance;
  /** Simple: stopping the alarm is enough. Challenge: a task finishes waking up. */
  wakeMode: WakeMode;
  challengeType: ChallengeType;
  /** 0 easy, 1 medium, 2 hard. */
  challengeLevel: 0 | 1 | 2;
  /** The alarm tone used by default. One of the catalog's ids. */
  soundId: string;
  /** Minutes to get ready. Used as the default in every plan. */
  getReadyMinutes: number;
  /** Spare minutes kept before the event. */
  bufferMinutes: number;
  /** Earliest time the person will be woken, "HH:mm", or null for no limit. */
  earliestWake: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = { getReadyMinutes: 30, bufferMinutes: 10, earliestWake: null, soundId: DEFAULT_WAKE_SOUND_ID, wakeMode: 'challenge', challengeType: 'maths', challengeLevel: 1, appearance: 'night' };

export type PlaceInput = { id: string; label: string; area?: string | null; kind: PlaceKind; crs?: string | null; latitude?: number | null; longitude?: number | null; createdAt: string };

/** Checks a place before it is saved. Returns the problem, or null when it is fine. */
export function placeProblem(input: Pick<PlaceInput, 'label' | 'kind' | 'crs'>): string | null {
  if (input.label.trim() === '') return 'Give the place a name.';
  if (input.label.trim().length > 30) return 'Keep the name under 30 characters.';
  if (!(PLACE_KINDS as readonly string[]).includes(input.kind)) return 'Choose what kind of place this is.';
  if (input.kind === 'station' && !/^[A-Z]{3}$/.test((input.crs ?? '').toUpperCase())) return 'A station needs its three-letter code, such as BHG.';
  return null;
}

/** Adds the columns a newer version needs to a place table made by an older one. Safe to run every start. */
export async function migrateContext(db: SqlDb): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(place)');
  const has = (name: string) => columns.some((c) => c.name === name);
  if (!has('lat')) await db.execAsync('ALTER TABLE place ADD COLUMN lat REAL');
  if (!has('lon')) await db.execAsync('ALTER TABLE place ADD COLUMN lon REAL');
}

export async function addPlace(db: SqlDb, input: PlaceInput): Promise<void> {
  const problem = placeProblem(input);
  if (problem) throw new Error(problem);
  await db.runAsync('INSERT INTO place (id, label, area, kind, crs, created_at, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    input.id,
    input.label.trim(),
    input.area?.trim() || null,
    input.kind,
    input.kind === 'station' ? (input.crs ?? '').toUpperCase() : null,
    input.createdAt,
    input.latitude ?? null,
    input.longitude ?? null,
  ]);
}

export async function listPlaces(db: SqlDb): Promise<SavedPlace[]> {
  const rows = await db.getAllAsync<{ id: string; label: string; area: string | null; kind: PlaceKind; crs: string | null; created_at: string; lat: number | null; lon: number | null }>(
    'SELECT id, label, area, kind, crs, created_at, lat, lon FROM place ORDER BY label COLLATE NOCASE',
  );
  return rows.map((r) => ({ id: r.id, label: r.label, area: r.area, kind: r.kind, crs: r.crs, latitude: r.lat, longitude: r.lon, createdAt: r.created_at }));
}

export async function deletePlace(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM place WHERE id = ?', [id]);
}

export async function savePreference(db: SqlDb, key: keyof Preferences, value: number | string | null, at: string): Promise<void> {
  if (key === 'soundId' && (typeof value !== 'string' || !WAKE_SOUNDS.some((s) => s.id === value))) throw new Error('Unknown alarm tone.');
  if (key === 'appearance' && !(APPEARANCES as readonly unknown[]).includes(value)) throw new Error('Unknown appearance.');
  if (key === 'wakeMode' && !(WAKE_MODES as readonly unknown[]).includes(value)) throw new Error('Unknown wake mode.');
  if (key === 'challengeType' && !(CHALLENGE_TYPES as readonly unknown[]).includes(value)) throw new Error('Unknown challenge.');
  if (key === 'challengeLevel' && !(value === 0 || value === 1 || value === 2)) throw new Error('Unknown difficulty.');
  await db.runAsync('INSERT OR REPLACE INTO preference (key, value, updated_at) VALUES (?, ?, ?)', [key, value === null ? '' : String(value), at]);
}

export async function loadPreferences(db: SqlDb): Promise<Preferences> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM preference');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const minutes = (key: 'getReadyMinutes' | 'bufferMinutes') => {
    const n = Number(map.get(key));
    return Number.isInteger(n) && n >= 0 && n <= 240 && map.has(key) ? n : DEFAULT_PREFERENCES[key];
  };
  const earliest = map.get('earliestWake') ?? '';
  const sound = map.get('soundId') ?? '';
  return {
    getReadyMinutes: minutes('getReadyMinutes'),
    bufferMinutes: minutes('bufferMinutes'),
    earliestWake: /^([01]\d|2[0-3]):[0-5]\d$/.test(earliest) ? earliest : null,
    soundId: WAKE_SOUNDS.some((s) => s.id === sound) ? sound : DEFAULT_WAKE_SOUND_ID,
    appearance: (APPEARANCES as readonly string[]).includes(map.get('appearance') ?? '') ? (map.get('appearance') as Appearance) : DEFAULT_PREFERENCES.appearance,
    wakeMode: (WAKE_MODES as readonly string[]).includes(map.get('wakeMode') ?? '') ? (map.get('wakeMode') as WakeMode) : DEFAULT_PREFERENCES.wakeMode,
    challengeType: (CHALLENGE_TYPES as readonly string[]).includes(map.get('challengeType') ?? '') ? (map.get('challengeType') as ChallengeType) : DEFAULT_PREFERENCES.challengeType,
    challengeLevel: ['0', '1', '2'].includes(map.get('challengeLevel') ?? '') ? (Number(map.get('challengeLevel')) as 0 | 1 | 2) : DEFAULT_PREFERENCES.challengeLevel,
  };
}

/** Deletes every saved place and preference. Saved alarms are kept, since the OS holds them. */
export async function deleteContext(db: SqlDb): Promise<void> {
  await db.runAsync('DELETE FROM place');
  await db.runAsync('DELETE FROM preference');
}
