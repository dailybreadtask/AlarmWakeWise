import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { remindersFor } from '../reminders/reminderPlan';
import { expoReminderBridge } from '../reminders/expoReminders';
import { scheduleReminders } from '../reminders/reminderScheduler';
import type { TimelineEntry } from '../domain/planner';
import { colors, space, type } from '../theme/tokens';
import { PressScale } from './PressScale';

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
      <PressScale style={[styles.button, busy && styles.disabled]} onPress={() => void set()} disabled={busy} accessibilityRole="button" accessibilityLabel="Remind me at each step">
        <Text style={styles.buttonText}>{busy ? 'Setting reminders…' : 'Remind me at each step'}</Text>
      </PressScale>
      {message ? <Text style={styles.message} accessibilityRole="alert">{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  button: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  buttonText: { color: colors.ink, ...type.label },
  disabled: { opacity: 0.5 },
  message: { color: colors.ink, ...type.caption, lineHeight: 19 },
});
