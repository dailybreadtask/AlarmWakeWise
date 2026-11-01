import { generateKeyPairSync, verify } from 'node:crypto';

import { fetchWeatherBody, signDeveloperToken, summariseWeather, type WeatherKitConfig } from '../../server/weather';

const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const config: WeatherKitConfig = {
  teamId: 'TEAM123456',
  serviceId: 'com.example.weather',
  keyId: 'KEY1234567',
  privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('signDeveloperToken', () => {
  const token = signDeveloperToken(config, 1_700_000_000);
  const [header, claims, signature] = token.split('.');

  it('carries the header and claims Apple asks for', () => {
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567', id: 'TEAM123456.com.example.weather' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000, exp: 1_700_003_600, sub: 'com.example.weather' });
  });

  it('is signed with the private key, as a raw 64-byte ES256 signature', () => {
    const raw = Buffer.from(signature, 'base64url');
    expect(raw.length).toBe(64);
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, raw)).toBe(true);
  });
});

describe('summariseWeather', () => {
  const now = new Date('2026-10-30T07:10:00Z');
  const hour = (h: number, chance: number, type = 'rain') => ({ forecastStart: `2026-10-30T${String(h).padStart(2, '0')}:00:00Z`, precipitationChance: chance, precipitationType: chance >= 0.5 ? type : 'clear' });
  const body = (hours: unknown[], conditionCode = 'Rain') => ({ currentWeather: { temperature: 8.4, conditionCode }, forecastHourly: { hours } });

  it('says when the rain stops', () => {
    // 07:00 UTC is 07:00 in London in late October (after the clocks change).
    const summary = summariseWeather(body([hour(7, 0.8), hour(8, 0.7), hour(9, 0.6), hour(10, 0.1), hour(11, 0)]), now, 'Europe/London');
    expect(summary).toMatchObject({ temperatureC: 8.4, text: 'Rain until 10' });
  });

  it('warns when rain is coming', () => {
    expect(summariseWeather(body([hour(7, 0), hour(8, 0.1), hour(12, 0.9)]), now, 'Europe/London')?.text).toBe('Dry now, rain from 12');
  });

  it('names snow when that is what falls', () => {
    expect(summariseWeather(body([hour(7, 0.9, 'snow'), hour(8, 0.9, 'snow')]), now, 'Europe/London')?.text).toBe('Snow for the rest of the day');
  });

  it('describes a dry day by its conditions', () => {
    expect(summariseWeather(body([hour(7, 0), hour(8, 0.2)], 'MostlyClear'), now, 'Europe/London')?.text).toBe('Mostly clear, staying dry');
  });

  it('ignores hours that are long past or far ahead', () => {
    const old = { forecastStart: '2026-10-29T03:00:00Z', precipitationChance: 1, precipitationType: 'rain' };
    const far = { forecastStart: '2026-11-02T03:00:00Z', precipitationChance: 1, precipitationType: 'rain' };
    expect(summariseWeather(body([old, hour(7, 0), far]), now, 'Europe/London')?.text).toBe('Rain, staying dry');
  });

  it('gives nothing when there is no temperature', () => {
    expect(summariseWeather({ currentWeather: {} }, now, 'Europe/London')).toBeNull();
    expect(summariseWeather(null, now, 'Europe/London')).toBeNull();
  });
});

describe('fetchWeatherBody', () => {
  it('asks for the current and hourly data and sends the token as a bearer header', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify({ currentWeather: { temperature: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchWeatherBody({ lat: 55.8642, lon: -4.2518 }, 'TOKEN', 'Europe/London', fake);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('https://weatherkit.apple.com/api/v1/weather/en/55.8642/-4.2518?dataSets=currentWeather,forecastHourly&timezone=Europe%2FLondon');
    expect(calls[0].auth).toBe('Bearer TOKEN');
  });

  it('reports a failed request as not ok, with its status', async () => {
    const fake = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    expect(await fetchWeatherBody({ lat: 1, lon: 1 }, 'T', 'UTC', fake)).toEqual({ ok: false, status: 401 });
  });
});
