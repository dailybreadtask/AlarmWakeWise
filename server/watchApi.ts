/** Checks what the app sends about a device and a journey. Strict on purpose: nothing is stored that does not match. */
import type { PushEnvironment, WatchInput } from './watchStore';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CRS = /^[A-Z]{3}$/;
const TIMEZONE = /^[A-Za-z_/+-]{1,40}$/;

export const MAX_WATCHES_PER_DEVICE = 10;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function parseDevice(body: unknown): Parsed<{ token: string; environment: PushEnvironment }> {
  const b = (body ?? {}) as { token?: unknown; environment?: unknown };
  if (typeof b.token !== 'string' || !/^[0-9a-fA-F]{32,200}$/.test(b.token)) return fail('bad_token');
  if (b.environment !== 'sandbox' && b.environment !== 'production') return fail('bad_environment');
  return { ok: true, value: { token: b.token.toLowerCase(), environment: b.environment } };
}

const date = (v: unknown, from: number, to: number): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || d.getTime() < from || d.getTime() > to ? null : d;
};

const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

/** A journey to watch. Times must be near now: a journey in the past, or weeks away, is not watched. */
export function parseWatch(body: unknown, now: Date): Parsed<WatchInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const from = now.getTime() - 24 * 3600_000;
  const to = now.getTime() + 4 * 24 * 3600_000;
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return fail('bad_id');
  if (typeof b.deviceId !== 'string' || !UUID.test(b.deviceId)) return fail('bad_device');
  if (typeof b.fromCrs !== 'string' || !CRS.test(b.fromCrs) || typeof b.toCrs !== 'string' || !CRS.test(b.toCrs)) return fail('bad_station');
  if (typeof b.trainId !== 'string' || b.trainId.length < 1 || b.trainId.length > 40) return fail('bad_train');
  const departsAt = date(b.departsAt, from, to);
  const arrivesAt = date(b.arrivesAt, from, to);
  const deadlineAt = date(b.deadlineAt, from, to);
  const wakeAt = date(b.wakeAt, from, to);
  if (!departsAt || !arrivesAt || !deadlineAt || !wakeAt) return fail('bad_time');
  const earliestWakeAt = b.earliestWakeAt === null || b.earliestWakeAt === undefined ? null : date(b.earliestWakeAt, from, to);
  if (b.earliestWakeAt !== null && b.earliestWakeAt !== undefined && !earliestWakeAt) return fail('bad_time');
  const leave = int(b.leaveAfterWakeMinutes, 0, 600);
  const buffer = int(b.bufferMinutes, 0, 240);
  if (leave === null || buffer === null) return fail('bad_minutes');
  if (typeof b.timezone !== 'string' || !TIMEZONE.test(b.timezone)) return fail('bad_timezone');
  return {
    ok: true,
    value: { id: b.id.toLowerCase(), deviceId: b.deviceId.toLowerCase(), fromCrs: b.fromCrs, toCrs: b.toCrs, trainId: b.trainId, departsAt, arrivesAt, deadlineAt, leaveAfterWakeMinutes: leave, bufferMinutes: buffer, earliestWakeAt, wakeAt, timezone: b.timezone },
  };
}

export function parseIds(body: unknown): Parsed<{ id: string; deviceId: string }> {
  const b = (body ?? {}) as { id?: unknown; deviceId?: unknown };
  if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.deviceId !== 'string' || !UUID.test(b.deviceId)) return fail('bad_id');
  return { ok: true, value: { id: b.id.toLowerCase(), deviceId: b.deviceId.toLowerCase() } };
}

export function parseDeviceId(body: unknown): Parsed<string> {
  const b = (body ?? {}) as { deviceId?: unknown };
  return typeof b.deviceId === 'string' && UUID.test(b.deviceId) ? { ok: true, value: b.deviceId.toLowerCase() } : fail('bad_id');
}
