/**
 * Driving time with live traffic, from TomTom. Server only. The key stays here.
 * Places are found by name, then the route is timed between them.
 */
export const TOMTOM_BASE = 'https://api.tomtom.com';

export interface Point {
  lat: number;
  lon: number;
}

export async function geocode(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Point | null> {
  const url = `${TOMTOM_BASE}/search/2/geocode/${encodeURIComponent(query)}.json?key=${encodeURIComponent(apiKey)}&countrySet=GB&limit=1`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const body = (await res.json()) as { results?: { position?: Point }[] };
  const p = body.results?.[0]?.position;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon } : null;
}

/** Driving time in seconds between two points, using live traffic. Null if TomTom gives no route. */
export async function drivingSeconds(from: Point, to: Point, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const path = `${from.lat},${from.lon}:${to.lat},${to.lon}`;
  const url = `${TOMTOM_BASE}/routing/1/calculateRoute/${path}/json?key=${encodeURIComponent(apiKey)}&traffic=true`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const body = (await res.json()) as { routes?: { summary?: { travelTimeInSeconds?: number } }[] };
  const seconds = body.routes?.[0]?.summary?.travelTimeInSeconds;
  return typeof seconds === 'number' && seconds > 0 ? seconds : null;
}
