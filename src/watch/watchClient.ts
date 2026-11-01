/** Talks to the WakeWise server about overnight journey watching. Everything here is opt-in, and removable. */
export interface WatchClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type WatchError = 'unavailable' | 'timeout' | 'no_watch_service' | 'unknown_device' | 'too_many_watches' | 'rejected';

export type WatchResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: WatchError };

export interface WatchedJourney {
  id: string;
  fromCrs: string;
  toCrs: string;
  trainId: string;
  departsAt: Date;
  arrivesAt: Date;
  deadlineAt: Date;
  leaveAfterWakeMinutes: number;
  bufferMinutes: number;
  earliestWakeAt: Date | null;
  wakeAt: Date;
  timezone: string;
}

async function post(path: string, body: unknown, options: WatchClientOptions): Promise<{ status: number; json: unknown } | { error: 'unavailable' | 'timeout' }> {
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return { error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

function failure(status: number): WatchError {
  if (status === 503) return 'no_watch_service';
  if (status === 404) return 'unknown_device';
  if (status === 429) return 'too_many_watches';
  return status >= 500 ? 'unavailable' : 'rejected';
}

/** Tells the server this phone's push token. Returns the id the server gives the device. */
export async function registerDevice(pushToken: string, environment: 'sandbox' | 'production', options: WatchClientOptions): Promise<WatchResult<{ deviceId: string }>> {
  const res = await post('/device', { token: pushToken, environment }, options);
  if ('error' in res) return { ok: false, error: res.error };
  const deviceId = (res.json as { deviceId?: unknown }).deviceId;
  if (res.status === 200 && typeof deviceId === 'string') return { ok: true, deviceId };
  return { ok: false, error: failure(res.status) };
}

/** Hands over a journey to watch. Sending the same journey again updates it. */
export async function watchJourney(deviceId: string, journey: WatchedJourney, options: WatchClientOptions): Promise<WatchResult> {
  const res = await post(
    '/watch',
    {
      id: journey.id,
      deviceId,
      fromCrs: journey.fromCrs,
      toCrs: journey.toCrs,
      trainId: journey.trainId,
      departsAt: journey.departsAt.toISOString(),
      arrivesAt: journey.arrivesAt.toISOString(),
      deadlineAt: journey.deadlineAt.toISOString(),
      leaveAfterWakeMinutes: journey.leaveAfterWakeMinutes,
      bufferMinutes: journey.bufferMinutes,
      earliestWakeAt: journey.earliestWakeAt ? journey.earliestWakeAt.toISOString() : null,
      wakeAt: journey.wakeAt.toISOString(),
      timezone: journey.timezone,
    },
    options,
  );
  if ('error' in res) return { ok: false, error: res.error };
  return res.status === 200 ? { ok: true } : { ok: false, error: failure(res.status) };
}

export async function stopWatching(deviceId: string, journeyId: string, options: WatchClientOptions): Promise<WatchResult> {
  const res = await post('/watch/cancel', { id: journeyId, deviceId }, options);
  if ('error' in res) return { ok: false, error: res.error };
  return res.status === 200 ? { ok: true } : { ok: false, error: failure(res.status) };
}

/** Removes the device and everything the server holds for it. */
export async function deleteDevice(deviceId: string, options: WatchClientOptions): Promise<WatchResult> {
  const res = await post('/device/delete', { deviceId }, options);
  if ('error' in res) return { ok: false, error: res.error };
  return res.status === 200 ? { ok: true } : { ok: false, error: failure(res.status) };
}
