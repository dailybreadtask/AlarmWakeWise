import type { BoardDeparture } from '../domain/railJourney';

export type RailBoard = { ok: true; departures: BoardDeparture[]; feedLastMessageAt: string | null };
export type RailBoardResult = RailBoard | { ok: false; error: 'unavailable' | 'timeout' | 'no_feed' | 'unknown_station' | 'unauthorised' };

export interface RailClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Live departures from `from` to `to`, from the server's Darwin listener. Times are as the feed last reported them. */
export async function fetchRailBoard(from: string, to: string, options: RailClientOptions): Promise<RailBoardResult> {
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = new URLSearchParams({ from, to });
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/rail/departures?${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, error: 'unauthorised' };
    if (response.status === 503) return { ok: false, error: 'no_feed' };
    if (response.status === 404) return { ok: false, error: 'unknown_station' };
    if (!response.ok) return { ok: false, error: 'unavailable' };
    const body = (await response.json()) as { departures?: BoardDeparture[]; feedLastMessageAt?: string | null };
    return { ok: true, departures: body.departures ?? [], feedLastMessageAt: body.feedLastMessageAt ?? null };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export interface StationMatch {
  crs: string;
  name: string;
}

/** Stations whose names match the text the person typed or the reading gave. */
export async function searchRailStations(query: string, options: RailClientOptions): Promise<StationMatch[]> {
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 10_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/rail/stations?${new URLSearchParams({ q: query })}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { stations?: StationMatch[] };
    return body.stations ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
