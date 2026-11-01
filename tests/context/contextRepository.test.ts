import { DatabaseSync } from 'node:sqlite';

import { type SqlDb } from '../../src/storage/alarmRepository';
import { addPlace, CONTEXT_TABLE_SQL, DEFAULT_PREFERENCES, deleteContext, deletePlace, listPlaces, loadPreferences, placeProblem, savePreference } from '../../src/context/contextRepository';

function memoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec(CONTEXT_TABLE_SQL);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, params = []) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, params = []) => db.prepare(source).all(...params) as unknown as T[],
  };
}

const at = '2026-10-30T08:00:00Z';

describe('placeProblem', () => {
  it('refuses an empty or long name, an unknown kind, and a station without a code', () => {
    expect(placeProblem({ label: '  ', kind: 'home', crs: null })).toMatch(/name/);
    expect(placeProblem({ label: 'x'.repeat(31), kind: 'home', crs: null })).toMatch(/30/);
    expect(placeProblem({ label: 'Gym', kind: 'gym' as never, crs: null })).toMatch(/kind/);
    expect(placeProblem({ label: 'Bathgate station', kind: 'station', crs: null })).toMatch(/three-letter/);
    expect(placeProblem({ label: 'Bathgate station', kind: 'station', crs: 'BHG' })).toBeNull();
  });
});

describe('places', () => {
  it('saves, lists alphabetically, and deletes a place', async () => {
    const db = memoryDb();
    await addPlace(db, { id: 'p1', label: 'Work', area: 'Edinburgh city centre', kind: 'work', createdAt: at });
    await addPlace(db, { id: 'p2', label: 'Bathgate station', kind: 'station', crs: 'bhg', createdAt: at });
    expect((await listPlaces(db)).map((p) => p.label)).toEqual(['Bathgate station', 'Work']);
    expect((await listPlaces(db))[0].crs).toBe('BHG');
    await deletePlace(db, 'p1');
    expect((await listPlaces(db)).map((p) => p.id)).toEqual(['p2']);
  });

  it('refuses to save an invalid place', async () => {
    await expect(addPlace(memoryDb(), { id: 'p1', label: '', kind: 'home', createdAt: at })).rejects.toThrow(/name/);
  });
});

describe('preferences', () => {
  it('uses the defaults until the person changes something', async () => {
    expect(await loadPreferences(memoryDb())).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps a saved change and ignores an out-of-range value', async () => {
    const db = memoryDb();
    await savePreference(db, 'getReadyMinutes', 45, at);
    await savePreference(db, 'earliestWake', '06:15', at);
    await savePreference(db, 'bufferMinutes', 9999, at);
    const prefs = await loadPreferences(db);
    expect(prefs).toMatchObject({ getReadyMinutes: 45, earliestWake: '06:15', bufferMinutes: DEFAULT_PREFERENCES.bufferMinutes });
  });

  it('clears the earliest wake time when it is removed', async () => {
    const db = memoryDb();
    await savePreference(db, 'earliestWake', '06:15', at);
    await savePreference(db, 'earliestWake', null, at);
    expect((await loadPreferences(db)).earliestWake).toBeNull();
  });
});

describe('deleteContext', () => {
  it('removes every place and preference', async () => {
    const db = memoryDb();
    await addPlace(db, { id: 'p1', label: 'Home', kind: 'home', createdAt: at });
    await savePreference(db, 'getReadyMinutes', 45, at);
    await deleteContext(db);
    expect(await listPlaces(db)).toEqual([]);
    expect(await loadPreferences(db)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('alarm tone preference', () => {
  it('starts on the default tone and keeps a chosen one', async () => {
    const db = memoryDb();
    expect((await loadPreferences(db)).soundId).toBe(DEFAULT_PREFERENCES.soundId);
    await savePreference(db, 'soundId', 'pulse', at);
    expect((await loadPreferences(db)).soundId).toBe('pulse');
  });

  it('keeps the appearance, with night as the default, and refuses one that does not exist', async () => {
    const db = memoryDb();
    expect((await loadPreferences(db)).appearance).toBe('night');
    await savePreference(db, 'appearance', 'day', at);
    expect((await loadPreferences(db)).appearance).toBe('day');
    await expect(savePreference(db, 'appearance', 'sepia', at)).rejects.toThrow(/Unknown/);
  });

  it('keeps the wake mode, challenge and difficulty, and refuses ones that do not exist', async () => {
    const db = memoryDb();
    expect(await loadPreferences(db)).toMatchObject({ wakeMode: 'challenge', challengeType: 'maths', challengeLevel: 1 });
    await savePreference(db, 'wakeMode', 'simple', at);
    await savePreference(db, 'challengeType', 'pattern', at);
    await savePreference(db, 'challengeLevel', 2, at);
    expect(await loadPreferences(db)).toMatchObject({ wakeMode: 'simple', challengeType: 'pattern', challengeLevel: 2 });
    await expect(savePreference(db, 'wakeMode', 'loud', at)).rejects.toThrow(/Unknown/);
    await expect(savePreference(db, 'challengeLevel', 3, at)).rejects.toThrow(/Unknown/);
  });

  it('refuses a tone that is not in the catalog', async () => {
    await expect(savePreference(memoryDb(), 'soundId', 'no-such-tone', at)).rejects.toThrow(/Unknown/);
  });
});
