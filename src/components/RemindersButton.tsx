import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { remindersFor } from '../reminders/reminderPlan';
import { expoReminderBridge } from '../reminders/expoReminders';
import { scheduleReminders } from '../reminders/reminderScheduler';
import type { TimelineEntry } from '../domain/planner';
import { colors, space } from '../theme/tokens';
import { Line } from './CollapsibleLine';

/** Sets a reminder for each step of the plan. These are notifications: iOS may silence them in Focus. */
export function RemindersButton({ timeline }: { timeline: TimelineEntry[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function set() {
    setBusy(true);
    const reminders = remindersFor(timeline, new Date());
    const result = await scheduleReminders(expoReminderBridge, reminders);
    setBusy(false);
    if (!result.permitted) return setMessage('Notifications are off for WakeWise. Turn them on in Settings to get step reminders.');
    if (reminders.length === 0) return setMessage('No steps are left to remind you about.');
    const failedNote = result.failed > 0 ? ` ${result.failed} could not be set.` : '';
    setMessage(`Set ${result.scheduled.length} reminder${result.scheduled.length === 1 ? '' : 's'}.${failedNote} They may be silenced in Focus.`);
  }

  return (
    <View style={styles.wrap}>
      <Line title={busy ? 'Setting reminders…' : 'Remind me at each step'} value="Notifications" onPress={() => void set()} />
      {message ? (
        <Text style={styles.message} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  message: { color: colors.muted, fontSize: 14, lineHeight: 19 },
});
