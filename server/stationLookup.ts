/**
 * CRS (the code passengers use, e.g. BTG) to TIPLOCs (the codes Darwin uses).
 * One CRS can have several TIPLOCs, so a lookup returns a set. The table comes
 * from the Darwin reference data and is loaded from a file, never guessed.
 */
export type CrsTable = Record<string, string[]>;

export function parseCrsTable(json: unknown): CrsTable | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const table: CrsTable = {};
  for (const [crs, tiplocs] of Object.entries(json as Record<string, unknown>)) {
    if (!/^[A-Z]{3}$/.test(crs) || !Array.isArray(tiplocs) || !tiplocs.every((t) => typeof t === 'string' && /^[A-Z0-9]{3,7}$/.test(t))) return null;
    table[crs] = tiplocs as string[];
  }
  return table;
}

export function tiplocsFor(table: CrsTable, crs: string): Set<string> {
  return new Set(table[crs] ?? []);
}
