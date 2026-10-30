/**
 * Speech to text through OpenAI. Runs on the server only: the API key never
 * reaches the phone. Audio is sent to OpenAI and not stored here.
 */
export const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
export const DEFAULT_MODEL = 'gpt-transcribe';
/** Recordings from the app are capped at 60 seconds, so this is far above normal use. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES = ['audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm'] as const;

export type TranscribeError = 'too_large' | 'unsupported_type' | 'empty' | 'provider_failed' | 'provider_timeout';

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: TranscribeError };

export interface TranscribeOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function transcribeAudio(audio: Blob, options: TranscribeOptions): Promise<TranscribeResult> {
  if (audio.size === 0) return { ok: false, error: 'empty' };
  if (audio.size > MAX_AUDIO_BYTES) return { ok: false, error: 'too_large' };
  const baseType = audio.type.split(';')[0];
  if (!(ALLOWED_AUDIO_TYPES as readonly string[]).includes(baseType)) return { ok: false, error: 'unsupported_type' };

  const { apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = 20_000 } = options;
  const form = new FormData();
  form.append('file', audio, `capture.${baseType === 'audio/wav' ? 'wav' : 'm4a'}`);
  form.append('model', model);
  form.append('language', 'en');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: 'provider_failed' };
    const payload: unknown = await response.json();
    const text = typeof payload === 'object' && payload !== null ? (payload as { text?: unknown }).text : undefined;
    if (typeof text !== 'string') return { ok: false, error: 'provider_failed' };
    return { ok: true, text: text.trim() };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'provider_timeout' : 'provider_failed' };
  } finally {
    clearTimeout(timer);
  }
}
