/** Today's weather for one place, from the WakeWise server, which asks Apple Weather. */
export interface WeatherSummary {
  temperatureC: number;
  /** A short phrase, such as "Rain until 10". */
  text: string;
  asOf: string;
}

/** Apple asks for its mark and a legal link wherever its weather is shown. */
export const WEATHER_LEGAL_URL = 'https://developer.apple.com/weatherkit/data-source-attribution/';

export type WeatherResult = { ok: true; weather: WeatherSummary } | { ok: false; error: 'unavailable' | 'timeout' | 'no_weather_provider' | 'unknown_place' | 'invalid' };

/** Where to look: coordinates found by search on this phone, or else the place's name and area. */
export type WeatherPlace = { latitude: number; longitude: number } | { name: string };

export interface WeatherClientOptions {
  baseUrl: string;
  token?: string;
  timezone: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchTodayWeather(place: WeatherPlace, options: WeatherClientOptions): Promise<WeatherResult> {
  const { baseUrl, token, timezone, fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const query = new URLSearchParams({ timezone });
  if ('latitude' in place) {
    query.set('lat', String(place.latitude));
    query.set('lon', String(place.longitude));
  } else {
    query.set('place', place.name);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/weather/today?${query.toString()}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (res.status === 503) return { ok: false, error: 'no_weather_provider' };
    if (res.status === 404) return { ok: false, error: 'unknown_place' };
    if (!res.ok) return { ok: false, error: 'unavailable' };
    const body = (await res.json()) as { weather?: Partial<WeatherSummary> };
    const w = body.weather;
    if (!w || typeof w.temperatureC !== 'number' || typeof w.text !== 'string' || typeof w.asOf !== 'string') return { ok: false, error: 'invalid' };
    return { ok: true, weather: { temperatureC: w.temperatureC, text: w.text, asOf: w.asOf } };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
