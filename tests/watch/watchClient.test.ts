import { deleteDevice, registerDevice, stopWatching, watchJourney, type WatchedJourney } from '../../src/watch/watchClient';

const options = { baseUrl: 'https://server.example/', token: 'T' };
const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const journey: WatchedJourney = {
  id: '3f2b9c1e-4a5d-4f6e-8b7c-9d0e1f2a3b4c',
  fromCrs: 'EDB',
  toCrs: 'GLQ',
  trainId: 'T1',
  departsAt: new Date('2026-11-02T07:57:00Z'),
  arrivesAt: new Date('2026-11-02T08:40:00Z'),
  deadlineAt: new Date('2026-11-02T09:00:00Z'),
  leaveAfterWakeMinutes: 40,
  bufferMinutes: 10,
  earliestWakeAt: null,
  wakeAt: new Date('2026-11-02T07:17:00Z'),
  timezone: 'Europe/London',
};

describe('registerDevice', () => {
  it('sends the token with the bearer header and returns the device id', async () => {
    let seen: { url: string; auth: string | null; body: unknown } | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ deviceId: 'dev-1' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await registerDevice('abcdef', 'sandbox', { ...options, fetchImpl: fake })).toEqual({ ok: true, deviceId: 'dev-1' });
    expect(seen).toEqual({ url: 'https://server.example/device', auth: 'Bearer T', body: { token: 'abcdef', environment: 'sandbox' } });
  });

  it('maps failures to plain errors', async () => {
    expect(await registerDevice('a', 'sandbox', { ...options, fetchImpl: reply(503) })).toEqual({ ok: false, error: 'no_watch_service' });
    expect(await registerDevice('a', 'sandbox', { ...options, fetchImpl: reply(400) })).toEqual({ ok: false, error: 'rejected' });
    expect(await registerDevice('a', 'sandbox', { ...options, fetchImpl: reply(500) })).toEqual({ ok: false, error: 'unavailable' });
    expect(await registerDevice('a', 'sandbox', { ...options, fetchImpl: reply(200, {}) })).toEqual({ ok: false, error: 'rejected' });
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await registerDevice('a', 'sandbox', { ...options, fetchImpl: down })).toEqual({ ok: false, error: 'unavailable' });
  });
});

describe('watchJourney', () => {
  it('sends the journey with its times as ISO strings', async () => {
    let body: Record<string, unknown> = {};
    const fake = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await watchJourney('dev-1', journey, { ...options, fetchImpl: fake })).toEqual({ ok: true });
    expect(body).toMatchObject({ id: journey.id, deviceId: 'dev-1', fromCrs: 'EDB', departsAt: '2026-11-02T07:57:00.000Z', earliestWakeAt: null, timezone: 'Europe/London' });
  });

  it('reports an unknown device so the app can register again', async () => {
    expect(await watchJourney('dev-1', journey, { ...options, fetchImpl: reply(404) })).toEqual({ ok: false, error: 'unknown_device' });
    expect(await watchJourney('dev-1', journey, { ...options, fetchImpl: reply(429) })).toEqual({ ok: false, error: 'too_many_watches' });
  });
});

describe('stopWatching and deleteDevice', () => {
  it('post to their routes', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await stopWatching('dev-1', journey.id, { ...options, fetchImpl: fake })).toEqual({ ok: true });
    expect(await deleteDevice('dev-1', { ...options, fetchImpl: fake })).toEqual({ ok: true });
    expect(urls).toEqual(['https://server.example/watch/cancel', 'https://server.example/device/delete']);
  });
});
