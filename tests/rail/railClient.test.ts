import { fetchRailBoard } from '../../src/rail/railClient';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchRailBoard', () => {
  it('asks the server for the board with the token and returns the departures', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return json({ departures: [{ trainId: 'R1' }], feedLastMessageAt: '2026-10-29T06:04:00Z' });
    }) as unknown as typeof fetch;
    const result = await fetchRailBoard('BHG', 'EDB', { baseUrl: 'https://ww.example/', token: 't', fetchImpl: impl });
    expect(seen[0].url).toBe('https://ww.example/rail/departures?from=BHG&to=EDB');
    expect(seen[0].headers.authorization).toBe('Bearer t');
    expect(result).toEqual({ ok: true, departures: [{ trainId: 'R1' }], feedLastMessageAt: '2026-10-29T06:04:00Z' });
  });

  it('maps server answers to distinct errors', async () => {
    const at = (status: number) => fetchRailBoard('BHG', 'EDB', { baseUrl: 'https://ww.example', fetchImpl: (async () => json({}, status)) as unknown as typeof fetch });
    expect(await at(503)).toEqual({ ok: false, error: 'no_feed' });
    expect(await at(404)).toEqual({ ok: false, error: 'unknown_station' });
    expect(await at(401)).toEqual({ ok: false, error: 'unauthorised' });
    expect(await at(500)).toEqual({ ok: false, error: 'unavailable' });
  });
});
