import type { CrsTable } from './stationLookup';
import { tiplocsFor } from './stationLookup';
import type { ForecastStore, StopForecast } from './darwinFeed';

export interface RailDeparture {
  trainId: string;
  /** The date the train runs, YYYY-MM-DD, as the feed gives it. */
  serviceDate: string | null;
  scheduled: string;
  expected: string;
  /** Arrival at the destination when the board was asked to filter to one. */
  arrivesScheduled: string | null;
  arrivesExpected: string | null;
  /** "On time", a delay in minutes, or "Cancelled", as the feed reports it. */
  status: string;
  /** Null when the feed does not allow the platform to be shown. */
  platform: string | null;
}

export type RailBoardResult = { ok: true; departures: RailDeparture[] } | { ok: false; error: 'unknown_station' | 'no_feed' };

function statusOf(stop: StopForecast): string {
  const est = stop.estDep ?? stop.estArr;
  if (!est) return 'No estimate yet';
  if (est === 'On time' || est === 'Cancelled' || est === 'Delayed') return est;
  return est === stop.scheduledDep ? 'On time' : `Expected ${est}`;
}

/** Departures from one station, optionally only trains calling at a second station. */
export function departureBoard(store: ForecastStore, table: CrsTable | null, from: string, toCrs?: string): RailBoardResult {
  if (!table) return { ok: false, error: 'no_feed' };
  const origin = tiplocsFor(table, from);
  if (origin.size === 0) return { ok: false, error: 'unknown_station' };
  const destination = toCrs ? tiplocsFor(table, toCrs) : null;

  const departures = store.departuresFrom(origin).flatMap(({ rid, stop }) => {
    const arrival = destination ? store.destinationStop(rid, destination, stop.tiploc) : null;
    if (destination && !arrival) return [];
    return [
      {
        trainId: rid,
        serviceDate: store.serviceDate(rid),
        scheduled: stop.scheduledDep ?? '',
        expected: stop.estDep ?? '',
        arrivesScheduled: arrival?.scheduledArr ?? null,
        arrivesExpected: arrival ? (arrival.estArr ?? null) : null,
        status: statusOf(stop),
        platform: stop.platform,
      },
    ];
  });
  return { ok: true, departures };
}

export interface StationMatch {
  crs: string;
  name: string;
}

/**
 * Finds stations by name, for example "bath" or "Edinburgh Waverley". Names
 * that start with the text come first, then names that contain it.
 */
export function searchStations(names: Record<string, string>, query: string, limit = 8): StationMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: StationMatch[] = [];
  const contains: StationMatch[] = [];
  for (const [crs, name] of Object.entries(names)) {
    const n = name.toLowerCase();
    if (n.startsWith(q)) starts.push({ crs, name });
    else if (n.includes(q)) contains.push({ crs, name });
  }
  const byName = (a: StationMatch, b: StationMatch) => a.name.localeCompare(b.name);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
