import type { ContextScope } from '../domain/context';

/** The recorder writes m4a (`RecordingPresets.HIGH_QUALITY`), so the type is fixed rather than read from the file. */
const RECORDING_TYPE = 'audio/m4a';

export type TranscriptionResult = { ok: true; text: string } | { ok: false; error: 'consent_required' | 'unavailable' | 'timeout' | 'rejected' };

export interface TranscribeClientOptions {
  baseUrl: string;
  /** Sent as a bearer token. A token in the app bundle is not a secret. */
  token?: string;
  /** Whether the person has allowed speech to leave the phone. */
  hasConsent: (scope: ContextScope) => boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends a recording to the WakeWise server for speech to text. Refuses before
 * any upload unless the person has allowed speech. The caller falls back to
 * typed entry on any failure, so capture never depends on this call.
 */
export async function transcribeRecording(uri: string, options: TranscribeClientOptions): Promise<TranscriptionResult> {
  if (!options.hasConsent('speech')) return { ok: false, error: 'consent_required' };
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 25_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const audio = await (await fetchImpl(uri)).blob();
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/speech/transcribe?format=m4a`, {
      method: 'POST',
      headers: { 'content-type': RECORDING_TYPE, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: audio,
      signal: controller.signal,
    });
    if (response.status === 504) return { ok: false, error: 'timeout' };
    if (!response.ok) return { ok: false, error: response.status >= 500 ? 'unavailable' : 'rejected' };
    const payload = (await response.json()) as { text?: unknown };
    return typeof payload.text === 'string' ? { ok: true, text: payload.text } : { ok: false, error: 'unavailable' };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
