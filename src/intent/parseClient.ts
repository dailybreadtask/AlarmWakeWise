import { validateInterpretation, type Interpretation } from '../domain/interpretation';

export type ParseResult = { ok: true; value: Interpretation } | { ok: false; error: 'unavailable' | 'timeout' | 'rejected' | 'invalid' };

export interface ParseClientOptions {
  baseUrl: string;
  /** Saved place names and areas only. Never addresses or coordinates (ADR-005). */
  places?: { label: string; area?: string }[];
  token?: string;
  timezone?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends a typed or transcribed request to the server for interpretation. The
 * answer is checked again here before the screen sees it.
 */
export async function parseRequest(text: string, options: ParseClientOptions): Promise<ParseResult> {
  const { baseUrl, token, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone, fetchImpl = fetch, timeoutMs = 25_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/intents/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text, timezone, places: options.places ?? [] }),
      signal: controller.signal,
    });
    if (response.status === 504) return { ok: false, error: 'timeout' };
    if (!response.ok) return { ok: false, error: response.status >= 500 ? 'unavailable' : 'rejected' };
    const payload = (await response.json()) as { interpretation?: unknown };
    const checked = validateInterpretation(payload.interpretation);
    return checked.ok ? { ok: true, value: checked.value } : { ok: false, error: 'invalid' };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
