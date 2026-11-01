import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { ForecastStore } from './darwinFeed';
import { runListener } from './darwinListener';
import { interpretRequest, MAX_TEXT_CHARS } from './interpret';
import { departureBoard, searchStations } from './railService';
import { estimateJourney, JOURNEY_MODES, type JourneyMode } from './journeyEstimate';
import { drivingSeconds, geocode } from './tomtom';
import { parseCrsTable, type CrsTable } from './stationLookup';
import { MAX_AUDIO_BYTES, transcribeAudio, type TranscribeError } from './transcribe';
import { WEATHER_ATTRIBUTION, fetchWeatherBody, signDeveloperToken, summariseWeather, type WeatherKitConfig, type WeatherSummary } from './weather';

const token = process.env.WAKEWISE_API_TOKEN;
const apiKey = process.env.OPENAI_API_KEY;
if (!token) throw new Error('Set WAKEWISE_API_TOKEN. The server will not start without one.');
if (!apiKey) throw new Error('Set OPENAI_API_KEY. The server will not start without one.');

// Rail: live Darwin forecasts, held in memory on the server.
const railStore = new ForecastStore();
let lastFeedMessageAt: string | null = null;
const crsTablePath = join(__dirname, 'data', 'crs-tiploc.json');
const crsNamesPath = join(__dirname, 'data', 'crs-names.json');
const crsNames: Record<string, string> = existsSync(crsNamesPath) ? JSON.parse(readFileSync(crsNamesPath, 'utf8')) : {};
const crsTable: CrsTable | null = existsSync(crsTablePath) ? parseCrsTable(JSON.parse(readFileSync(crsTablePath, 'utf8'))) : null;
const nr = {
  host: process.env.NATIONAL_RAIL_TOPIC_HOST ?? '',
  port: Number(process.env.NATIONAL_RAIL_TOPIC_PORT ?? 61613),
  username: process.env.NATIONAL_RAIL_USERNAME ?? '',
  password: process.env.NATIONAL_RAIL_DARWIN_TOKEN ?? '',
  topic: process.env.NATIONAL_RAIL_TOPIC_NAME ?? 'darwin.pushport-v16',
};
if (nr.host && nr.username && nr.password) {
  // Reconnect after a drop. Credentials are never logged.
  const keepListening = (): void => {
    runListener(nr, railStore, () => {
      lastFeedMessageAt = new Date().toISOString();
    })
      .catch(() => undefined)
      .finally(() => setTimeout(keepListening, 10_000));
  };
  keepListening();
}

// Weather: Apple WeatherKit. Off (503) unless all four settings are present and the key file can be read.
function loadWeatherConfig(): WeatherKitConfig | null {
  const teamId = process.env.WEATHERKIT_TEAM_ID ?? '';
  const serviceId = process.env.WEATHERKIT_SERVICE_ID ?? '';
  const keyId = process.env.WEATHERKIT_KEY_ID ?? '';
  const keyPath = process.env.WEATHERKIT_PRIVATE_KEY_PATH ?? '';
  if (!teamId || !serviceId || !keyId || !keyPath) return null;
  const resolved = existsSync(keyPath) ? keyPath : join(process.cwd(), keyPath);
  if (!existsSync(resolved)) return null;
  return { teamId, serviceId, keyId, privateKeyPem: readFileSync(resolved, 'utf8') };
}
const weatherConfig = loadWeatherConfig();
let weatherToken: { value: string; expiresAt: number } | null = null;
const weatherCache = new Map<string, { at: number; summary: WeatherSummary }>();
const WEATHER_CACHE_MS = 30 * 60_000;

/** Today's weather for a point. Places a few hundred metres apart share one cached answer for half an hour. */
async function weatherRoute(url: URL, send: (status: number, body: unknown) => void) {
  if (!weatherConfig) return send(503, { error: 'no_weather_provider' });
  const timezone = url.searchParams.get('timezone') ?? 'Europe/London';
  if (!/^[A-Za-z_/+-]{1,40}$/.test(timezone)) return send(400, { error: 'bad_request' });
  let lat = Number(url.searchParams.get('lat'));
  let lon = Number(url.searchParams.get('lon'));
  const place = url.searchParams.get('place')?.trim().slice(0, 80) ?? '';
  if (!url.searchParams.has('lat') && place) {
    // A place with no coordinates on the phone is found by name, as journeys are.
    if (!tomtomKey) return send(503, { error: 'no_weather_provider' });
    const point = await geocode(place, tomtomKey);
    if (!point) return send(404, { error: 'unknown_place' });
    lat = point.lat;
    lon = point.lon;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(400, { error: 'bad_request' });

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.at < WEATHER_CACHE_MS) return send(200, { weather: cached.summary, attribution: WEATHER_ATTRIBUTION, cached: true });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!weatherToken || weatherToken.expiresAt - nowSeconds < 300) weatherToken = { value: signDeveloperToken(weatherConfig, nowSeconds), expiresAt: nowSeconds + 3600 };
  const result = await fetchWeatherBody({ lat, lon }, weatherToken.value, timezone);
  // Log the outcome only, never the coordinates.
  console.log(JSON.stringify({ event: 'weather', ok: result.ok, ...(result.ok ? {} : { status: result.status }) }));
  if (!result.ok) return send(502, { error: 'unavailable' });
  const summary = summariseWeather(result.body, new Date(), timezone);
  if (!summary) return send(502, { error: 'unavailable' });
  weatherCache.set(key, { at: Date.now(), summary });
  return send(200, { weather: summary, attribution: WEATHER_ATTRIBUTION, cached: false });
}

/** Reads a JSON body up to a small limit, then asks OpenAI to read the request. */
function parseIntent(req: import('node:http').IncomingMessage, send: (status: number, body: unknown) => void, apiKey: string) {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 8192) chunks.push(chunk);
  });
  req.on('end', async () => {
    if (size > 8192) return send(413, { error: 'too_large' });
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(400, { error: 'bad_request' });
    }
    const input = (body ?? {}) as { text?: unknown; places?: unknown; timezone?: unknown };
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (text === '') return send(400, { error: 'bad_request' });
    if (text.length > MAX_TEXT_CHARS) return send(400, { error: 'too_long' });
    const places = Array.isArray(input.places)
      ? input.places.slice(0, 10).filter((p): p is { label: string; area?: string } => typeof p?.label === 'string' && p.label.length <= 30).map((p) => ({ label: p.label, area: typeof p.area === 'string' ? p.area.slice(0, 40) : undefined }))
      : [];
    const timezone = typeof input.timezone === 'string' && input.timezone.length <= 60 ? input.timezone : 'UTC';
    const outcome = await interpretRequest({ text, places, nowIso: new Date().toISOString(), timezone }, { apiKey });
    // Log the outcome only, never the request text.
    console.log(JSON.stringify({ event: 'parse', ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) }));
    if (!outcome.ok) return send(502, { error: outcome.error });
    return send(200, { interpretation: outcome.value });
  });
}

const tomtomKey = process.env.TOMTOM_API_KEY ?? '';

/** A typical journey time. Driving uses TomTom with live traffic; other modes use a web estimate. */
function journeyEstimateRoute(req: import('node:http').IncomingMessage, send: (status: number, body: unknown) => void, apiKey: string) {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  });
  req.on('end', async () => {
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(400, { error: 'bad_request' });
    }
    const input = (body ?? {}) as { from?: unknown; to?: unknown; mode?: unknown; departAt?: unknown };
    const from = typeof input.from === 'string' ? input.from.trim().slice(0, 60) : '';
    const to = typeof input.to === 'string' ? input.to.trim().slice(0, 60) : '';
    const mode = input.mode as JourneyMode;
    if (!from || !to || !(JOURNEY_MODES as readonly string[]).includes(mode)) return send(400, { error: 'bad_request' });
    const departAt = typeof input.departAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.departAt) ? input.departAt : null;

    if (mode === 'car') {
      if (!tomtomKey) return send(503, { error: 'no_driving_provider' });
      const [a, b] = await Promise.all([geocode(from, tomtomKey), geocode(to, tomtomKey)]);
      if (!a || !b) return send(404, { error: 'unknown_place' });
      const seconds = await drivingSeconds(a, b, tomtomKey);
      if (!seconds) return send(502, { error: 'unavailable' });
      const minutes = Math.round(seconds / 60);
      // A driving time with traffic is a point estimate, so give a small range around it.
      return send(200, {
        estimate: { minutesLow: Math.max(5, Math.round(minutes * 0.9)), minutesHigh: Math.round(minutes * 1.15), mode, note: 'Driving time with traffic at the moment of the check. It may change.', sources: ['https://developer.tomtom.com/traffic-api/documentation'] },
        cached: false,
      });
    }

    const outcome = await estimateJourney({ from, to, mode, departAt }, { apiKey });
    console.log(JSON.stringify({ event: 'journey_estimate', mode, ok: outcome.ok, ...(outcome.ok ? { cached: outcome.cached } : { error: outcome.error }) }));
    if (!outcome.ok) return send(outcome.error === 'invalid' ? 502 : 502, { error: outcome.error });
    return send(200, { estimate: outcome.estimate, cached: outcome.cached });
  });
}

const AUDIO_TYPE_FOR_FORMAT: Record<string, string> = { m4a: 'audio/m4a', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm' };

const STATUS: Record<TranscribeError, number> = { too_large: 413, unsupported_type: 415, empty: 400, provider_failed: 502, provider_timeout: 504 };

createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const route = req.url?.split('?')[0];
  if (req.method === 'POST' && route === '/journey/estimate') {
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    return journeyEstimateRoute(req, send, apiKey);
  }
  if (req.method === 'GET' && route === '/weather/today') {
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    return void weatherRoute(new URL(req.url ?? '/', 'http://localhost'), send);
  }
  if (req.method === 'GET' && route === '/rail/stations') {
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    const q = new URL(req.url ?? '/', 'http://localhost').searchParams.get('q') ?? '';
    return send(200, { stations: searchStations(crsNames, q.slice(0, 40)) });
  }
  if (req.method === 'GET' && route === '/rail/departures') {
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const from = (query.get('from') ?? '').toUpperCase();
    const to = query.get('to')?.toUpperCase() || undefined;
    const board = departureBoard(railStore, crsTable, from, to);
    if (!board.ok) return send(board.error === 'no_feed' ? 503 : 404, { error: board.error });
    return send(200, { departures: board.departures, feedLastMessageAt: lastFeedMessageAt, trainsHeld: railStore.size });
  }
  if (req.method !== 'POST' || (route !== '/speech/transcribe' && route !== '/intents/parse')) return send(404, { error: 'not_found' });
  if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
  if (route === '/intents/parse') return parseIntent(req, send, apiKey);
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_AUDIO_BYTES) return send(413, { error: 'too_large' });

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_AUDIO_BYTES) chunks.push(chunk);
  });
  req.on('end', async () => {
    if (size > MAX_AUDIO_BYTES) return send(413, { error: 'too_large' });
    // The format comes from the URL, not the header: React Native sets the upload's type from the file, not from our header.
    const format = new URL(req.url ?? '/', 'http://localhost').searchParams.get('format') ?? 'm4a';
    const type = AUDIO_TYPE_FOR_FORMAT[format];
    if (!type) return send(415, { error: 'unsupported_type' });
    const audio = new Blob([Buffer.concat(chunks)], { type });
    const result = await transcribeAudio(audio, { apiKey, model: process.env.OPENAI_TRANSCRIBE_MODEL });
    // Log the outcome only, never the audio or the text.
    console.log(JSON.stringify({ event: 'transcribe', ok: result.ok, format, bytes: size, ...(result.ok ? {} : { error: result.error }) }));
    if (!result.ok) return send(STATUS[result.error], { error: result.error });
    return send(200, { text: result.text });
  });
}).listen(Number(process.env.PORT ?? 8787), () => console.log(JSON.stringify({ event: 'listening' })));
