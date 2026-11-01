/**
 * Puts an alarm into the OS through a bridge. The bridge is injected so this
 * logic is tested without a phone. Native alarms never depend on the AI, the
 * network or the server: nothing here imports them.
 */
export type AuthState = 'authorized' | 'denied' | 'notDetermined' | 'unsupported';

export interface NativeScheduleRequest {
  id: string;
  hour: number;
  minute: number;
  weekdays: number[];
  /** Exact instant for a one-time alarm, in milliseconds since 1970. Null for a time of day. */
  fireAtMs?: number | null;
  title: string;
  soundFile: string | null;
  snoozeMinutes: number;
  openAppOnStop: boolean;
}

export interface TimerRequest {
  id: string;
  seconds: number;
  title: string;
  soundFile: string | null;
}

export interface AlarmBridge {
  isSupported(): boolean;
  getAuthorization(): AuthState;
  requestAuthorization(): Promise<AuthState>;
  schedule(request: NativeScheduleRequest): Promise<{ usedSound: 'bundled' | 'systemDefault' }>;
  /** A countdown that starts now and rings at zero, to the second. Absent where the native module is not linked. */
  startTimer?(request: TimerRequest): Promise<{ usedSound: 'bundled' | 'systemDefault' }>;
  cancel(id: string): Promise<void>;
  scheduled(): Promise<{ id: string; state: string }[]>;
  /** The alarm the person stopped since the app last looked, if any. Read once. */
  consumePendingDismissal?(): { id: string; at: number } | null;
}

export interface AlarmSpec {
  /** A UUID, stable for this alarm. Derived from the plan action so retries reuse it. */
  nativeId: string;
  /** When the alarm should ring, in the device's local time. */
  wakeAt: Date;
  title: string;
  snoozeMinutes?: number;
  /** A bundled tone file name, or null for the system default. */
  soundFile?: string | null;
}

export type ScheduleResult = { ok: true; usedSound: 'bundled' | 'systemDefault' } | { ok: false; error: 'unsupported' | 'not_authorized' | 'native_failed' };

export function toNativeRequest(spec: AlarmSpec): NativeScheduleRequest {
  return {
    id: spec.nativeId,
    hour: spec.wakeAt.getHours(),
    minute: spec.wakeAt.getMinutes(),
    weekdays: [],
    // One-time alarms fire at the exact instant, so a future date works.
    fireAtMs: spec.wakeAt.getTime(),
    title: spec.title,
    soundFile: spec.soundFile ?? null,
    snoozeMinutes: spec.snoozeMinutes ?? 0,
    openAppOnStop: false,
  };
}

/** Asks for permission only when the person is about to need it. */
export async function ensureAuthorized(bridge: AlarmBridge): Promise<AuthState> {
  if (!bridge.isSupported()) return 'unsupported';
  const current = bridge.getAuthorization();
  if (current === 'notDetermined') return bridge.requestAuthorization();
  return current;
}

/** Scheduling only reports success once the OS has accepted the alarm. */
export async function scheduleAlarm(bridge: AlarmBridge, spec: AlarmSpec): Promise<ScheduleResult> {
  if (!bridge.isSupported()) return { ok: false, error: 'unsupported' };
  if (bridge.getAuthorization() !== 'authorized') return { ok: false, error: 'not_authorized' };
  try {
    const { usedSound } = await bridge.schedule(toNativeRequest(spec));
    return { ok: true, usedSound };
  } catch {
    return { ok: false, error: 'native_failed' };
  }
}

/**
 * Compares what the app expects with what the OS holds. Reports the gap; it
 * never moves or removes an alarm on its own.
 */
export async function reconcile(bridge: AlarmBridge, expectedIds: string[]): Promise<{ missing: string[] }> {
  if (!bridge.isSupported()) return { missing: expectedIds };
  const held = new Set((await bridge.scheduled()).map((a) => a.id));
  return { missing: expectedIds.filter((id) => !held.has(id)) };
}
