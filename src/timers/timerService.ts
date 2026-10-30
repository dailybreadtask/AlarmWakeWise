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

export const TIMER_PRESETS = [5, 10, 15, 25, 30, 45] as const;

export type StartTimerResult = { ok: true; timer: SavedTimer } | { ok: false; error: 'not_permitted' | 'too_long' | 'bad_label' | 'failed' };

export interface StartTimerInput {
  id: string;
  label: string;
  minutes: number;
  now: Date;
  /** When the countdown starts, for a planned timer. Defaults to now. */
  startAt?: Date;
  /** The AlarmKit id to use. Defaults to the timer id, which must then be a UUID. */
  nativeId?: string;
}

export async function startTimer(bridge: ReminderBridge, db: SqlDb, input: StartTimerInput, alarm?: AlarmBridge): Promise<StartTimerResult> {
  const label = input.label.trim();
  if (label === '' || label.length > 40) return { ok: false, error: 'bad_label' };
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 24 * 60) return { ok: false, error: 'too_long' };

  const startAt = input.startAt ?? input.now;
  const endsAt = new Date(startAt.getTime() + input.minutes * 60_000);
  if (endsAt.getTime() <= input.now.getTime()) return { ok: false, error: 'too_long' };

  // Prefer a real AlarmKit alarm at the end time. Otherwise, a notification.
  let ref: string | null = null;
  if (alarm && (await ensureAuthorized(alarm)) === 'authorized') {
    const nativeId = input.nativeId ?? input.id;
    const result = await scheduleAlarm(alarm, { nativeId, wakeAt: endsAt, title: label });
    if (result.ok) ref = `${ALARM_PREFIX}${nativeId}`;
  }
  if (!ref) {
    const permitted = await bridge.requestPermission();
    if (!permitted) return { ok: false, error: 'not_permitted' };
    try {
      ref = `${NOTIFICATION_PREFIX}${await bridge.schedule(endsAt, label, `${input.minutes} min timer finished.`)}`;
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
