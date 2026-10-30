import type { TimelineEntry } from '../domain/planner';

/** The timeline entries that become step reminders. Timer steps have their own countdown. */

/** A reminder for one step of a plan. Notifications, not alarms: they can be silenced. */
export interface PlannedReminder {
  /** Stable for the step, so the same plan gives the same reminders. */
  key: string;
  title: string;
  body: string;
  at: Date;
}

/**
 * One reminder for each preparation or travel step that starts in the future.
 * The wake-up is an alarm and the arrival is not a step, so neither is included.
 */
export function remindersFor(timeline: TimelineEntry[], now: Date): PlannedReminder[] {
  return timeline
    .filter((e) => (e.kind === 'prep' || e.kind === 'travel') && e.startsAt.getTime() > now.getTime())
    .map((e) => ({
      key: e.id,
      title: e.label,
      body: `${e.minutes} min. Time to start.`,
      at: e.startsAt,
    }));
}
