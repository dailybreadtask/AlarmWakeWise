import { drivingSeconds, geocode } from '../../server/tomtom';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('TomTom', () => {
  it('finds a place in Great Britain and returns its position', async () => {
    const seen: string[] = [];
    const impl = (async (url: string) => {
      seen.push(url);
      return json({ results: [{ position: { lat: 55.95, lon: -3.19 } }] });
    }) as unknown as typeof fetch;
    expect(await geocode('Edinburgh', 'k', impl)).toEqual({ lat: 55.95, lon: -3.19 });
    expect(seen[0]).toContain('countrySet=GB');
    expect(seen[0]).toContain('/search/2/geocode/Edinburgh.json');
  });

  it('returns nothing for a place it cannot find', async () => {
    expect(await geocode('Nowhere', 'k', (async () => json({ results: [] })) as unknown as typeof fetch)).toBeNull();
  });

  it('times the drive with live traffic switched on', async () => {
    const seen: string[] = [];
    const impl = (async (url: string) => {
      seen.push(url);
      return json({ routes: [{ summary: { travelTimeInSeconds: 4200 } }] });
    }) as unknown as typeof fetch;
    expect(await drivingSeconds({ lat: 55.95, lon: -3.19 }, { lat: 55.86, lon: -4.25 }, 'k', impl)).toBe(4200);
    expect(seen[0]).toContain('traffic=true');
    expect(seen[0]).toContain('/routing/1/calculateRoute/55.95,-3.19:55.86,-4.25/json');
  });

  it('gives no time when TomTom returns no route', async () => {
    expect(await drivingSeconds({ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, 'k', (async () => json({}, 400)) as unknown as typeof fetch)).toBeNull();
  });
});
