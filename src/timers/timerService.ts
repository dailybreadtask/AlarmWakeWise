/**
 * Starts and cancels countdown timers. A timer ends as an AlarmKit alarm at its
 * end time, which rings like the wake alarm. Where AlarmKit is not available,
 * the end is a notification instead, which can be silenced.
 *
 * AlarmKit's own timer API starts counting at once, so it cannot begin at a
 * planned time. An alarm at the end time does both.
 */
import { ensureAuthorized, scheduleAlarm, type AlarmBridge } from '../alarm/alarmScheduler';
import type { ReminderBridge } from '../reminders/reminderScheduler';
import type { SqlDb } from '../storage/alarmRepository';
import { insertTimer, listTimers, setTimerStatus, type SavedTimer } from './timerRepository';

const ALARM_PREFIX = 'alarm:';
const NOTIFICATION_PREFIX = 'notification:';

/** Common lengths, in seconds. */
export const TIMER_PRESETS = [30, 60, 300, 600, 900, 1500, 2700] as const;

/** Under this, the end is a notification, which is on time to the second. An alarm is set to the minute. */
const ALARM_MIN_SECONDS = 60;

/** "30 sec", "1 min", "1 min 30 sec", "1 h 5 min". */
export function durationWords(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const parts = [h > 0 ? `${h} h` : '', m > 0 ? `${m} min` : '', sec > 0 ? `${sec} sec` : ''].filter(Boolean);
  return parts.join(' ') || '0 sec';
}

export type StartTimerResult = { ok: true; timer: SavedTimer } | { ok: false; error: 'not_permitted' | 'too_long' | 'bad_label' | 'failed' };

export interface StartTimerInput {
  id: string;
  label: string;
  /** Length in whole minutes. Use `seconds` instead for anything that is not a whole number of minutes. */
  minutes?: number;
  /** Length in seconds. Takes the place of `minutes` when given. */
  seconds?: number;
  now: Date;
  /** When the countdown starts, for a planned timer. Defaults to now. */
  startAt?: Date;
  /** The AlarmKit id to use. Defaults to the timer id, which must then be a UUID. */
  nativeId?: string;
}

export async function startTimer(bridge: ReminderBridge, db: SqlDb, input: StartTimerInput, alarm?: AlarmBridge): Promise<StartTimerResult> {
  const label = input.label.trim();
  if (label === '' || label.length > 40) return { ok: false, error: 'bad_label' };
  const seconds = input.seconds ?? (input.minutes ?? 0) * 60;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 24 * 3600) return { ok: false, error: 'too_long' };

  const startAt = input.startAt ?? input.now;
  const endsAt = new Date(startAt.getTime() + seconds * 1000);
  if (endsAt.getTime() <= input.now.getTime()) return { ok: false, error: 'too_long' };

  // Prefer a real AlarmKit alarm at the end time. Otherwise, a notification.
  let ref: string | null = null;
  if (alarm && seconds >= ALARM_MIN_SECONDS && (await ensureAuthorized(alarm)) === 'authorized') {
    const nativeId = input.nativeId ?? input.id;
    const result = await scheduleAlarm(alarm, { nativeId, wakeAt: endsAt, title: label });
    if (result.ok) ref = `${ALARM_PREFIX}${nativeId}`;
  }
  if (!ref) {
    const permitted = await bridge.requestPermission();
    if (!permitted) return { ok: false, error: 'not_permitted' };
    try {
      ref = `${NOTIFICATION_PREFIX}${await bridge.schedule(endsAt, label, `${durationWords(seconds)} timer finished.`)}`;
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  const record = { id: input.id, label, endsAt: endsAt.toISOString(), notificationId: ref, createdAt: input.now.toISOString() };
  await insertTimer(db, record);
  return { ok: true, timer: { ...record, status: 'running' } };
}

/** Cancels a running timer's alarm or notification, and marks it cancelled. */
export async function cancelTimer(bridge: ReminderBridge, db: SqlDb, timer: SavedTimer, alarm?: AlarmBridge): Promise<void> {
  const ref = timer.notificationId ?? '';
  if (ref.startsWith(ALARM_PREFIX) && alarm) await alarm.cancel(ref.slice(ALARM_PREFIX.length));
  else if (ref.startsWith(NOTIFICATION_PREFIX)) await bridge.cancel(ref.slice(NOTIFICATION_PREFIX.length));
  await setTimerStatus(db, timer.id, 'cancelled');
}

/** Timers still running and not yet past their end. */
export async function runningTimers(db: SqlDb, now: Date): Promise<SavedTimer[]> {
  return (await listTimers(db)).filter((t) => t.status === 'running' && new Date(t.endsAt).getTime() > now.getTime());
}
