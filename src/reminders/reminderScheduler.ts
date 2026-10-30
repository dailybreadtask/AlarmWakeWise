import type { PlannedReminder } from './reminderPlan';

/** The part of the notification system this app uses. Injected so the logic is tested without a phone. */
export interface ReminderBridge {
  requestPermission(): Promise<boolean>;
  schedule(at: Date, title: string, body: string): Promise<string>;
  cancel(id: string): Promise<void>;
}

export interface ReminderResult {
  scheduled: string[];
  failed: number;
  /** False when the person has not allowed notifications. Nothing is scheduled then. */
  permitted: boolean;
}

/** Asks for permission, then schedules each reminder. A reminder that cannot be set is counted, not hidden. */
export async function scheduleReminders(bridge: ReminderBridge, reminders: PlannedReminder[]): Promise<ReminderResult> {
  const permitted = await bridge.requestPermission();
  if (!permitted) return { scheduled: [], failed: 0, permitted: false };
  const scheduled: string[] = [];
  let failed = 0;
  for (const r of reminders) {
    try {
      scheduled.push(await bridge.schedule(r.at, r.title, r.body));
    } catch {
      failed += 1;
    }
  }
  return { scheduled, failed, permitted: true };
}
