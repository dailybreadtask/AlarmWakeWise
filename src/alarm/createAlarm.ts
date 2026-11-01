import { randomUUID } from 'expo-crypto';

import { saveAlarm, type SqlDb } from '../storage/alarmRepository';
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

/** Asks iOS to hold a one-time alarm and keeps a record of it. Nothing is set unless this is called. */
export async function createAlarm(sql: SqlDb, input: { wakeAt: Date; title: string; soundFile: string }): Promise<CreateAlarmResult> {
  const authorization = await ensureAuthorized(alarmBridge);
  if (authorization === 'unsupported') return { ok: false, reason: 'unsupported' };
  if (authorization !== 'authorized') return { ok: false, reason: 'denied' };
  const nativeId = randomUUID();
  const result = await scheduleAlarm(alarmBridge, { nativeId, wakeAt: input.wakeAt, title: input.title, soundFile: input.soundFile, snoozeMinutes: SNOOZE_MINUTES });
  if (!result.ok) return { ok: false, reason: result.error === 'not_authorized' ? 'denied' : result.error === 'unsupported' ? 'unsupported' : 'failed' };
  // A failure to save the record does not undo the alarm, so it is not shown as a failure.
  await saveAlarm(sql, { id: randomUUID(), nativeId, wakeAt: input.wakeAt.toISOString(), title: input.title, source: 'quick', createdAt: new Date().toISOString() }).catch(() => undefined);
  return { ok: true, usedSound: result.usedSound };
}
