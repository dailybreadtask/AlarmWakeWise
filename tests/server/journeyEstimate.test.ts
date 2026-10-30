import { cleanSources, CACHE_MS, checkEstimate, estimateJourney, RESPONSES_URL } from '../../server/journeyEstimate';

const good = { minutesLow: 60, minutesHigh: 80, note: 'Typical bus time, Edinburgh to Glasgow.', sources: ['https://example.com/bus-times'] };

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const modelReply = (estimate: unknown) => ({ output_text: JSON.stringify(estimate) });
const req = { from: 'Edinburgh', to: 'Glasgow', mode: 'bus' as const, departAt: '07:00' };

describe('cleanSources', () => {
  it('turns markdown links into plain addresses without tracking parameters', () => {
    expect(cleanSources(['([livebustimes.co.uk](https://livebustimes.co.uk/buses/edinburgh-to-glasgow?utm_source=openai))'])).toEqual([
      'https://livebustimes.co.uk/buses/edinburgh-to-glasgow',
    ]);
  });

  it('keeps at most three distinct addresses', () => {
    const many = ['https://a.example/1', 'https://b.example/2', 'https://c.example/3', 'https://d.example/4', 'https://a.example/1'];
    expect(cleanSources(many)).toEqual(['https://a.example/1', 'https://b.example/2', 'https://c.example/3']);
  });
});

describe('checkEstimate', () => {
  it('accepts a sensible range with a source', () => {
    expect(checkEstimate(good, 'bus')).toMatchObject({ minutesLow: 60, minutesHigh: 80, mode: 'bus' });
  });

  it('rejects a range that is backwards, too short, too long, or without a source', () => {
    expect(checkEstimate({ ...good, minutesLow: 90, minutesHigh: 60 }, 'bus')).toBeNull();
    expect(checkEstimate({ ...good, minutesLow: 1 }, 'bus')).toBeNull();
    expect(checkEstimate({ ...good, minutesHigh: 900 }, 'bus')).toBeNull();
    expect(checkEstimate({ ...good, sources: [] }, 'bus')).toBeNull();
    expect(checkEstimate({ ...good, sources: ['not a link'] }, 'bus')).toBeNull();
  });
});

describe('estimateJourney', () => {
  it('asks with web search on, using the schema, and returns the checked estimate', async () => {
    const { impl, calls } = fakeFetch(modelReply(good));
    const result = await estimateJourney(req, { apiKey: 'sk-test', fetchImpl: impl, now: () => 0 });
    expect(result).toMatchObject({ ok: true, cached: false, estimate: { minutesLow: 60, minutesHigh: 80 } });
    expect(calls[0].url).toBe(RESPONSES_URL);
    expect(calls[0].body.tools).toEqual([{ type: 'web_search' }]);
    expect((calls[0].body.text as { format: { strict: boolean } }).format.strict).toBe(true);
  });

  it('answers a repeat request for the same route from the cache, within a day', async () => {
    const { impl, calls } = fakeFetch(modelReply(good));
    const options = { apiKey: 'sk-test', fetchImpl: impl, now: () => 1000 };
    const route = { ...req, to: 'Dunfermline' };
    await estimateJourney(route, options);
    const again = await estimateJourney(route, { ...options, now: () => 1000 + CACHE_MS - 1 });
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('asks again once the cached answer is a day old', async () => {
    const { impl, calls } = fakeFetch(modelReply(good));
    await estimateJourney({ ...req, to: 'Stirling' }, { apiKey: 'sk-test', fetchImpl: impl, now: () => 0 });
    await estimateJourney({ ...req, to: 'Stirling' }, { apiKey: 'sk-test', fetchImpl: impl, now: () => CACHE_MS + 1 });
    expect(calls).toHaveLength(2);
  });

  it('reports an unusable answer rather than using it', async () => {
    const { impl } = fakeFetch({ output_text: '{"minutesLow": 5' });
    expect(await estimateJourney({ ...req, to: 'Perth' }, { apiKey: 'k', fetchImpl: impl, now: () => 0 })).toEqual({ ok: false, error: 'invalid' });
  });

  it('reports the service being unavailable without exposing the provider error', async () => {
    const { impl } = fakeFetch({ error: { message: 'key sk-secret rejected' } }, 401);
    const result = await estimateJourney({ ...req, to: 'Fife' }, { apiKey: 'k', fetchImpl: impl, now: () => 0 });
    expect(result).toEqual({ ok: false, error: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });
});
