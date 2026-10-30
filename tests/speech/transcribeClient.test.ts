import { transcribeRecording } from '../../src/speech/transcribeClient';

const allow = () => true;
const deny = () => false;

function fakeFetch(audioBlob: Blob, response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === 'file:///rec.m4a') return new Response(audioBlob);
    return response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const audio = new Blob([new Uint8Array(100)], { type: 'audio/m4a' });

describe('transcribeRecording', () => {
  it('does not upload anything without speech consent', async () => {
    const { impl, calls } = fakeFetch(audio, new Response('{}'));
    const result = await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example', hasConsent: deny, fetchImpl: impl });
    expect(result).toEqual({ ok: false, error: 'consent_required' });
    expect(calls).toHaveLength(0);
  });

  it('uploads the recording to the server and returns the text', async () => {
    const { impl, calls } = fakeFetch(audio, new Response(JSON.stringify({ text: 'Be at work by nine' }), { status: 200 }));
    const result = await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example/', token: 't', hasConsent: allow, fetchImpl: impl });
    expect(result).toEqual({ ok: true, text: 'Be at work by nine' });
    expect(calls[1].url).toBe('https://ww.example/speech/transcribe?format=m4a');
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe('Bearer t');
  });

  it('sends the recording as m4a whatever type the file reports', async () => {
    const octet = new Blob([new Uint8Array(100)], { type: 'application/octet-stream' });
    const { impl, calls } = fakeFetch(octet, new Response(JSON.stringify({ text: 'hi' }), { status: 200 }));
    await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example', hasConsent: allow, fetchImpl: impl });
    expect((calls[1].init?.headers as Record<string, string>)['content-type']).toBe('audio/m4a');
  });

  it('maps a server timeout and a server error to distinct results', async () => {
    const timeout = fakeFetch(audio, new Response('{}', { status: 504 }));
    expect(await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example', hasConsent: allow, fetchImpl: timeout.impl })).toEqual({ ok: false, error: 'timeout' });
    const broken = fakeFetch(audio, new Response('{}', { status: 502 }));
    expect(await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example', hasConsent: allow, fetchImpl: broken.impl })).toEqual({ ok: false, error: 'unavailable' });
  });

  it('reports a network failure as unavailable', async () => {
    const impl = (async (url: string) => {
      if (url === 'file:///rec.m4a') return new Response(audio);
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await transcribeRecording('file:///rec.m4a', { baseUrl: 'https://ww.example', hasConsent: allow, fetchImpl: impl })).toEqual({ ok: false, error: 'unavailable' });
  });
});
