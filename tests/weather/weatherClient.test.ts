import { fetchTodayWeather } from '../../src/weather/weatherClient';

const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const options = { baseUrl: 'https://server.example/', token: 'T', timezone: 'Europe/London' };

describe('fetchTodayWeather', () => {
  it('asks by coordinates when it has them, with the token', async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get('authorization') };
      return new Response(JSON.stringify({ weather: { temperatureC: 8, text: 'Rain until 10', asOf: '2026-10-30T07:00:00Z' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchTodayWeather({ latitude: 55.86, longitude: -4.25 }, { ...options, fetchImpl: fake });
    expect(result).toEqual({ ok: true, weather: { temperatureC: 8, text: 'Rain until 10', asOf: '2026-10-30T07:00:00Z' } });
    expect(seen).toEqual({ url: 'https://server.example/weather/today?timezone=Europe%2FLondon&lat=55.86&lon=-4.25', auth: 'Bearer T' });
  });

  it('asks by name when it has no coordinates', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ weather: { temperatureC: 1, text: 'Dry', asOf: 'x' } }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchTodayWeather({ name: 'Glasgow' }, { ...options, fetchImpl: fake });
    expect(url).toContain('place=Glasgow');
    expect(url).not.toContain('lat=');
  });

  it('maps the server answers to plain errors', async () => {
    expect(await fetchTodayWeather({ name: 'x' }, { ...options, fetchImpl: json(503, {}) })).toEqual({ ok: false, error: 'no_weather_provider' });
    expect(await fetchTodayWeather({ name: 'x' }, { ...options, fetchImpl: json(404, {}) })).toEqual({ ok: false, error: 'unknown_place' });
    expect(await fetchTodayWeather({ name: 'x' }, { ...options, fetchImpl: json(502, {}) })).toEqual({ ok: false, error: 'unavailable' });
    expect(await fetchTodayWeather({ name: 'x' }, { ...options, fetchImpl: json(200, { weather: { temperatureC: 'warm' } }) })).toEqual({ ok: false, error: 'invalid' });
  });
});
