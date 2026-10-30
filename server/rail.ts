/**
 * National Rail live departures (LDBWS, Darwin). Server only: the credentials
 * never reach the app. Field names follow the 20220120 LDBWS spec.
 *
 * Guidelines we follow: platforms are shown only when the feed says
 * `platformAvailable`, and every answer carries `generatedAt` as its as-of time.
 */
export const LDBWS_BASE = 'https://realtime.nationalrail.co.uk/LDBWS/api/20220120';
const CRS = /^[A-Z]{3}$/;

export interface RailCredentials {
  /** Basic auth username that goes with the token. Confirm it from the licence email. */
  username: string;
  token: string;
}

export interface Departure {
  serviceId: string;
  scheduled: string;
  expected: string;
  /** Null until the feed allows showing it. */
  platform: string | null;
  cancelled: boolean;
  delayReason: string | null;
  cancelReason: string | null;
  destination: string;
  callingAt: string[];
}

export interface DepartureBoard {
  asOf: string;
  station: string;
  departures: Departure[];
  messages: string[];
}

export type RailError = 'invalid_station' | 'unauthorised' | 'unavailable' | 'timeout';
export type RailResult = { ok: true; board: DepartureBoard } | { ok: false; error: RailError };

/** HTTP Basic: base64 of "username:token". */
export function basicAuthHeader({ username, token }: RailCredentials): string {
  return `Basic ${Buffer.from(`${username}:${token}`, 'utf8').toString('base64')}`;
}

interface RawService {
  serviceID?: string;
  std?: string;
  etd?: string;
  platform?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  delayReason?: string;
  destination?: { locationName?: string }[];
  subsequentCallingPoints?: { callingPoint?: { locationName?: string }[] }[];
}

interface RawBoard {
  generatedAt?: string;
  locationName?: string;
  platformAvailable?: boolean;
  nrccMessages?: { Value?: string }[];
  trainServices?: RawService[];
}

export function parseBoard(raw: RawBoard): DepartureBoard {
  const platformsAllowed = raw.platformAvailable === true;
  return {
    asOf: raw.generatedAt ?? new Date(0).toISOString(),
    station: raw.locationName ?? '',
    messages: (raw.nrccMessages ?? []).map((m) => m.Value ?? '').filter(Boolean),
    departures: (raw.trainServices ?? []).map((s) => ({
      serviceId: s.serviceID ?? '',
      scheduled: s.std ?? '',
      expected: s.etd ?? '',
      platform: platformsAllowed && s.platform ? s.platform : null,
      cancelled: s.isCancelled === true,
      delayReason: s.delayReason ?? null,
      cancelReason: s.cancelReason ?? null,
      destination: s.destination?.[0]?.locationName ?? '',
      callingAt: (s.subsequentCallingPoints ?? []).flatMap((g) => (g.callingPoint ?? []).map((c) => c.locationName ?? '')).filter(Boolean),
    })),
  };
}

export interface DepartureRequest {
  /** Station code, uppercase, e.g. the departure station. */
  crs: string;
  /** Only trains calling at this station. */
  toCrs?: string;
  numRows?: number;
  timeWindowMinutes?: number;
}

export async function getDepartures(request: DepartureRequest, credentials: RailCredentials, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<RailResult> {
  if (!CRS.test(request.crs) || (request.toCrs !== undefined && !CRS.test(request.toCrs))) return { ok: false, error: 'invalid_station' };

  const query = new URLSearchParams({
    numRows: String(request.numRows ?? 10),
    timeWindow: String(request.timeWindowMinutes ?? 120),
  });
  if (request.toCrs) {
    query.set('filterCrs', request.toCrs);
    query.set('filterType', 'to');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${LDBWS_BASE}/GetDepBoardWithDetails/${request.crs}?${query}`, {
      headers: { authorization: basicAuthHeader(credentials), accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { ok: false, error: 'unauthorised' };
    if (!response.ok) return { ok: false, error: 'unavailable' };
    return { ok: true, board: parseBoard((await response.json()) as RawBoard) };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
