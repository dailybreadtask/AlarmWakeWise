import { CHAT_URL, INTERPRETATION_JSON_SCHEMA, interpretRequest, buildUserMessage } from '../../server/interpret';

const input = { text: 'Be at work by nine tomorrow', places: [{ label: 'work' }], nowIso: '2026-10-29T23:00:00Z', timezone: 'Europe/London' };

function chatReply(content: unknown, refusal: string | null = null) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content), refusal } }] }), { status: 200 });
}

function fakeFetch(reply: Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return reply;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** What the model returns in strict mode: absent params come back as null. */
const modelAnswer = {
  schemaVersion: 3,
  goal: 'Be at work by 9am tomorrow',
  intentType: 'purpose_alarm',
  confidence: 0.9,
  commitments: [{ outcome: 'Arrive at work', deadline: { date: '2026-10-30', time: '09:00', dateWords: 'tomorrow', inMinutes: null, timeAssumed: false }, placeLabel: 'work' }],
  requests: [{ capability: 'rail', reason: 'Train to work', params: { place: null, from: 'home station', to: null, flight: null, message: null, minutes: null } }],
  questions: [],
};

describe('interpretRequest', () => {
  it('sends the request with a strict schema and returns a validated interpretation', async () => {
    const { impl, calls } = fakeFetch(chatReply(modelAnswer));
    const result = await interpretRequest(input, { apiKey: 'sk-test', fetchImpl: impl });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(CHAT_URL);
    const format = (calls[0].body.response_format as { json_schema: { strict: boolean } }).json_schema;
    expect(format.strict).toBe(true);
    expect(calls[0].body.temperature).toBe(0);
  });

  it('drops null params so the validator accepts them as absent', async () => {
    const { impl } = fakeFetch(chatReply(modelAnswer));
    const result = await interpretRequest(input, { apiKey: 'k', fetchImpl: impl });
    if (!result.ok) throw new Error('expected success');
    expect(result.value.requests[0].params).toEqual({ from: 'home station' });
  });

  it('rejects an answer that breaks the schema, so nothing unvalidated gets through', async () => {
    const { impl } = fakeFetch(chatReply({ ...modelAnswer, requests: [{ capability: 'send_email', reason: 'x', params: {} }] }));
    expect(await interpretRequest(input, { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'bad_model_output' });
  });

  it('reports a model refusal as declined', async () => {
    const { impl } = fakeFetch(chatReply(null, 'I cannot help with that.'));
    expect(await interpretRequest(input, { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'declined' });
  });

  it('does not expose the provider error body', async () => {
    const { impl } = fakeFetch(new Response(JSON.stringify({ error: { message: 'Incorrect key sk-secret' } }), { status: 401 }));
    const result = await interpretRequest(input, { apiKey: 'k', fetchImpl: impl });
    expect(result).toEqual({ ok: false, error: 'provider_failed' });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });

  it('tells the model the current time and timezone, and never the key', () => {
    const message = buildUserMessage(input);
    expect(message).toContain('2026-10-29T23:00:00Z');
    expect(message).toContain('Europe/London');
    expect(message).not.toContain('sk-');
  });

  it('declares every object as strict: all keys required, no extras', () => {
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect(Object.keys(n.properties as object).sort()).toEqual([...(n.required as string[])].sort());
      }
      Object.values(n).forEach(walk);
    };
    walk(INTERPRETATION_JSON_SCHEMA);
  });
});
