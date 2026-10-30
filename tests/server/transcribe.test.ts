import { transcribeAudio, TRANSCRIBE_URL, DEFAULT_MODEL, MAX_AUDIO_BYTES } from '../../server/transcribe';

const audio = (bytes: number, type = 'audio/m4a') => new Blob([new Uint8Array(bytes)], { type });

function fakeFetch(response: Response | (() => never)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (typeof response === 'function') return response();
    return response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('transcribeAudio', () => {
  it('sends the audio to OpenAI with the server key and the default model', async () => {
    const { impl, calls } = fakeFetch(json({ text: ' Be at work by nine. ' }));
    const result = await transcribeAudio(audio(1000), { apiKey: 'sk-test', fetchImpl: impl });
    expect(result).toEqual({ ok: true, text: 'Be at work by nine.' });
    expect(calls[0].url).toBe(TRANSCRIBE_URL);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const form = calls[0].init.body as FormData;
    expect(form.get('model')).toBe(DEFAULT_MODEL);
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('rejects empty and oversized audio without calling the provider', async () => {
    const { impl, calls } = fakeFetch(json({ text: 'x' }));
    expect(await transcribeAudio(audio(0), { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'empty' });
    expect(await transcribeAudio(audio(MAX_AUDIO_BYTES + 1), { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'too_large' });
    expect(calls).toHaveLength(0);
  });

  it('rejects an unsupported audio type', async () => {
    const { impl, calls } = fakeFetch(json({ text: 'x' }));
    expect(await transcribeAudio(audio(10, 'video/quicktime'), { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'unsupported_type' });
    expect(calls).toHaveLength(0);
  });

  it('reports a provider error without exposing its body', async () => {
    const { impl } = fakeFetch(json({ error: { message: 'Incorrect API key sk-secret' } }, 401));
    const result = await transcribeAudio(audio(10), { apiKey: 'k', fetchImpl: impl });
    expect(result).toEqual({ ok: false, error: 'provider_failed' });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });

  it('treats a reply with no text as a provider failure', async () => {
    const { impl } = fakeFetch(json({ something: 'else' }));
    expect(await transcribeAudio(audio(10), { apiKey: 'k', fetchImpl: impl })).toEqual({ ok: false, error: 'provider_failed' });
  });

  it('reports a timeout as a timeout', async () => {
    const impl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const result = await transcribeAudio(audio(10), { apiKey: 'k', fetchImpl: impl, timeoutMs: 10 });
    expect(result).toEqual({ ok: false, error: 'provider_timeout' });
  });
});
