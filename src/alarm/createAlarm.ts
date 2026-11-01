import { randomUUID } from 'expo-crypto';

import { saveAlarm, updateAlarm, type SavedAlarm, type SqlDb } from '../storage/alarmRepository';
import { ensureAuthorized, scheduleAlarm } from './alarmScheduler';
import { alarmBridge } from './nativeBridge';

/** Snooze is offered as a button on the alarm; the countdown is the system's. */
const SNOOZE_MINUTES = 5;

export type CreateAlarmResult = { ok: true; usedSound: 'bundled' | 'systemDefault' } | { ok: false; reason: 'unsupported' | 'denied' | 'failed' };

export const CREATE_ALARM_MESSAGES: Record<Extract<CreateAlarmResult, { ok: false }>['reason'], string> = {
  unsupported: 'Alarms need iOS 26.1 or later on a real iPhone.',
  denied: 'Alarms are off for WakeWise. Turn them on in Settings, then try again.',
  failed: 'iOS did not accept the alarm. Please try again.',
};

export interface AlarmInput {
  wakeAt: Date;
  title: string;
  soundFile: string;
}

/** Asks iOS to hold a one-time alarm. Returns the new alarm's id on success. */
async function scheduleNew(input: AlarmInput): Promise<{ ok: true; nativeId: string; usedSound: 'bundled' | 'systemDefault' } | { ok: false; reason: 'unsupported' | 'denied' | 'failed' }> {
  const authorization = await ensureAuthorized(alarmBridge);
  if (authorization === 'unsupported') return { ok: false, reason: 'unsupported' };
  if (authorization !== 'authorized') return { ok: false, reason: 'denied' };
  const nativeId = randomUUID();
  const result = await scheduleAlarm(alarmBridge, { nativeId, wakeAt: input.wakeAt, title: input.title, soundFile: input.soundFile, snoozeMinutes: SNOOZE_MINUTES });
  if (!result.ok) return { ok: false, reason: result.error === 'not_authorized' ? 'denied' : result.error === 'unsupported' ? 'unsupported' : 'failed' };
  return { ok: true, nativeId, usedSound: result.usedSound };
}

/** Sets a new one-time alarm and keeps a record of it. Nothing is set unless this is called. */
export async function createAlarm(sql: SqlDb, input: AlarmInput): Promise<CreateAlarmResult> {
  const made = await scheduleNew(input);
  if (!made.ok) return made;
  // A failure to save the record does not undo the alarm, so it is not shown as a failure.
  await saveAlarm(sql, { id: randomUUID(), nativeId: made.nativeId, wakeAt: input.wakeAt.toISOString(), title: input.title, source: 'quick', createdAt: new Date().toISOString() }).catch(() => undefined);
  return { ok: true, usedSound: made.usedSound };
}

/**
 * Moves or switches back on a saved alarm. The new alarm is set first, and the old one is cancelled only once the new one
 * is held, so a failure never leaves the person without an alarm. The saved record keeps its place in the list.
 */
export async function rescheduleAlarm(sql: SqlDb, alarm: SavedAlarm, input: AlarmInput): Promise<CreateAlarmResult> {
  const made = await scheduleNew(input);
  if (!made.ok) return made;
  await updateAlarm(sql, alarm.id, { nativeId: made.nativeId, wakeAt: input.wakeAt.toISOString(), title: input.title, at: new Date().toISOString() }).catch(() => undefined);
  // The old one may already be gone (switched off, or rung), so a failure here is fine.
  await alarmBridge.cancel(alarm.nativeId).catch(() => undefined);
  return { ok: true, usedSound: made.usedSound };
}

/** Switches an alarm off: iOS stops holding it, and the record stays so it can be switched back on. */
export async function switchOffAlarm(alarm: SavedAlarm): Promise<void> {
  await alarmBridge.cancel(alarm.nativeId);
}
