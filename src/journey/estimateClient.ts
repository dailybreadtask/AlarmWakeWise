import type { EstimateNeed } from './estimateMode';

export type EstimateResult =
  | { ok: true; minutesLow: number; minutesHigh: number; note: string; sources: string[] }
  | { ok: false; error: 'unavailable' | 'timeout' | 'no_driving_provider' | 'unknown_place' | 'invalid' };

export interface EstimateClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** A typical journey time from the server. Never presented as live. */
export async function fetchEstimate(need: EstimateNeed, departAt: string | null, options: EstimateClientOptions): Promise<EstimateResult> {
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 30_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/journey/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ from: need.from, to: need.to, mode: need.mode, departAt }),
      signal: controller.signal,
    });
    if (res.status === 503) return { ok: false, error: 'no_driving_provider' };
    if (res.status === 404) return { ok: false, error: 'unknown_place' };
    if (!res.ok) return { ok: false, error: 'unavailable' };
    const body = (await res.json()) as { estimate?: { minutesLow: number; minutesHigh: number; note: string; sources: string[] } };
    if (!body.estimate) return { ok: false, error: 'invalid' };
    return { ok: true, ...body.estimate };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
