import { parseRequest } from '../../src/intent/parseClient';

const interpretation = {
  schemaVersion: 3,
  goal: 'Be at work by 9am',
  intentType: 'purpose_alarm',
  confidence: 0.9,
  commitments: [],
  requests: [],
  questions: [],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('parseRequest', () => {
  it('returns a validated interpretation from the server', async () => {
    const impl = (async () => json({ interpretation })) as unknown as typeof fetch;
    const result = await parseRequest('be at work by nine', { baseUrl: 'https://ww.example', fetchImpl: impl, timezone: 'Europe/London' });
    expect(result).toEqual({ ok: true, value: interpretation });
  });

  it('rejects an answer that does not match the schema', async () => {
    const impl = (async () => json({ interpretation: { ...interpretation, requests: [{ capability: 'send_email', reason: 'x', params: {} }] } })) as unknown as typeof fetch;
    expect(await parseRequest('x', { baseUrl: 'https://ww.example', fetchImpl: impl })).toEqual({ ok: false, error: 'invalid' });
  });

  it('separates server errors from rejected requests', async () => {
    const down = (async () => json({ error: 'provider_failed' }, 502)) as unknown as typeof fetch;
    expect(await parseRequest('x', { baseUrl: 'https://ww.example', fetchImpl: down })).toEqual({ ok: false, error: 'unavailable' });
    const bad = (async () => json({ error: 'too_long' }, 400)) as unknown as typeof fetch;
    expect(await parseRequest('x', { baseUrl: 'https://ww.example', fetchImpl: bad })).toEqual({ ok: false, error: 'rejected' });
  });

  it('sends the token only when one is set', async () => {
    const seen: Record<string, string>[] = [];
    const impl = (async (_url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return json({ interpretation });
    }) as unknown as typeof fetch;
    await parseRequest('x', { baseUrl: 'https://ww.example', token: 't', fetchImpl: impl });
    await parseRequest('x', { baseUrl: 'https://ww.example', fetchImpl: impl });
    expect(seen[0].authorization).toBe('Bearer t');
    expect(seen[1].authorization).toBeUndefined();
  });
});
