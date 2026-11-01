/**
 * Today's weather from Apple WeatherKit's REST API. Server only: the private key stays here.
 * A request is signed with a short-lived token (ES256), the hourly forecast is fetched,
 * and it is boiled down to one line, such as "8°, rain until 10".
 */
import { signEs256Jwt } from './jwt';

export const WEATHERKIT_BASE = 'https://weatherkit.apple.com';
/** Apple asks for its attribution and legal link wherever its weather data is shown. */
export const WEATHER_ATTRIBUTION = { name: 'Apple Weather', legalUrl: 'https://developer.apple.com/weatherkit/data-source-attribution/' } as const;

export interface WeatherKitConfig {
  teamId: string;
  serviceId: string;
  keyId: string;
  privateKeyPem: string;
}

export interface WeatherSummary {
  temperatureC: number;
  /** A short phrase: "Rain until 10", "Dry now, rain from 15", "Clear, staying dry". */
  text: string;
  asOf: string;
}

/** A developer token for one hour: header, claims and an ES256 signature, as Apple's REST API requires. */
export function signDeveloperToken(config: WeatherKitConfig, nowSeconds: number, lifetimeSeconds = 3600): string {
  const header = { alg: 'ES256', kid: config.keyId, id: `${config.teamId}.${config.serviceId}` };
  const claims = { iss: config.teamId, iat: nowSeconds, exp: nowSeconds + lifetimeSeconds, sub: config.serviceId };
  return signEs256Jwt(header, claims, config.privateKeyPem);
}

export type WeatherFetch = { ok: true; body: unknown } | { ok: false; status: number };

/** Current conditions and the hourly forecast for a point. Null-safe: any failure is a plain "not ok". */
export async function fetchWeatherBody(point: { lat: number; lon: number }, developerToken: string, timezone: string, fetchImpl: typeof fetch = fetch): Promise<WeatherFetch> {
  const url = `${WEATHERKIT_BASE}/api/v1/weather/en/${point.lat.toFixed(4)}/${point.lon.toFixed(4)}?dataSets=currentWeather,forecastHourly&timezone=${encodeURIComponent(timezone)}`;
  try {
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${developerToken}` } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

interface Hour {
  forecastStart: string;
  precipitationChance?: number;
  precipitationType?: string;
}

const hourOf = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(at);

/** "MostlyClear" becomes "Mostly clear". */
function words(code: string): string {
  const spaced = code.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function kindOfWet(type: string | undefined): string {
  if (type === 'snow') return 'Snow';
  if (type === 'sleet') return 'Sleet';
  if (type === 'hail') return 'Hail';
  return 'Rain';
}

/**
 * One line for today, from the current conditions and the hours ahead. Rain counts as likely at 50% or more.
 * Null when the data has no usable temperature.
 */
export function summariseWeather(body: unknown, now: Date, timezone: string): WeatherSummary | null {
  const data = (body ?? {}) as { currentWeather?: { temperature?: unknown; conditionCode?: unknown; asOf?: unknown }; forecastHourly?: { hours?: unknown } };
  const current = data.currentWeather;
  const temperature = current?.temperature;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null;

  const hours: Hour[] = (Array.isArray(data.forecastHourly?.hours) ? (data.forecastHourly?.hours as Hour[]) : [])
    .filter((h) => typeof h?.forecastStart === 'string' && !Number.isNaN(Date.parse(h.forecastStart)))
    // The hour we are in, and up to the next 18.
    .filter((h) => Date.parse(h.forecastStart) >= now.getTime() - 60 * 60_000 && Date.parse(h.forecastStart) <= now.getTime() + 18 * 60 * 60_000)
    .sort((a, b) => Date.parse(a.forecastStart) - Date.parse(b.forecastStart));
  const wet = (h: Hour) => (h.precipitationChance ?? 0) >= 0.5 && h.precipitationType !== 'clear';

  let text: string;
  const first = hours[0];
  if (first && wet(first)) {
    const dryAt = hours.find((h) => !wet(h) && Date.parse(h.forecastStart) > Date.parse(first.forecastStart));
    text = dryAt ? `${kindOfWet(first.precipitationType)} until ${hourOf(new Date(dryAt.forecastStart), timezone)}` : `${kindOfWet(first.precipitationType)} for the rest of the day`;
  } else {
    const wetAt = hours.find(wet);
    if (wetAt) {
      text = `Dry now, ${kindOfWet(wetAt.precipitationType).toLowerCase()} from ${hourOf(new Date(wetAt.forecastStart), timezone)}`;
    } else {
      text = typeof current?.conditionCode === 'string' && current.conditionCode ? `${words(current.conditionCode)}, staying dry` : 'Staying dry';
    }
  }
  const asOf = typeof current?.asOf === 'string' && !Number.isNaN(Date.parse(current.asOf)) ? current.asOf : now.toISOString();
  return { temperatureC: temperature, text, asOf };
}
