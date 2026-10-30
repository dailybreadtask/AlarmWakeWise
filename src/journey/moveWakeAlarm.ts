/**
 * Moves a wake alarm to a new time, only after the person approved it.
 * Order matters: the new alarm is set and confirmed first. Only then is the old
 * one cancelled. If the new one cannot be set, the old one stays in place.
 */
import { scheduleAlarm, type AlarmBridge } from '../alarm/alarmScheduler';

export interface MoveWakeInput {
  bridge: AlarmBridge;
  oldNativeId: string;
  newNativeId: string;
  wakeAt: Date;
  title: string;
}

export type MoveWakeResult = { ok: true; cancelledOld: boolean } | { ok: false; error: 'not_authorized' | 'unsupported' | 'native_failed'; oldKept: true };

export async function moveWakeAlarm(input: MoveWakeInput): Promise<MoveWakeResult> {
  const result = await scheduleAlarm(input.bridge, { nativeId: input.newNativeId, wakeAt: input.wakeAt, title: input.title });
  if (!result.ok) return { ok: false, error: result.error, oldKept: true };
  try {
    await input.bridge.cancel(input.oldNativeId);
    return { ok: true, cancelledOld: true };
  } catch {
    // The new alarm is set, so the person is still woken. The old one may still ring; say so.
    return { ok: true, cancelledOld: false };
  }
}
