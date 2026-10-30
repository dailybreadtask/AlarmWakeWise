import { Stack } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Heading, Page, PrimaryButton, SectionLabel } from '../components/Layout';

import { PressScale } from '../components/PressScale';
import { expoReminderBridge } from '../reminders/expoReminders';
import { alarmBridge } from '../alarm/nativeBridge';
import { listTimers, type SavedTimer } from '../timers/timerRepository';
import { cancelTimer, startTimer, TIMER_PRESETS } from '../timers/timerService';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, radius, space, type } from '../theme/tokens';

const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** Countdowns for cooking and study. These are notifications, not alarms: they can be silenced. */
export default function TimersScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [timers, setTimers] = useState<SavedTimer[]>([]);
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState<number>(10);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listTimers(sql).then((list) => {
      if (active) setTimers(list.filter((t) => t.status === 'running'));
    });
    return () => {
      active = false;
    };
  }, [sql]);

  async function reload() {
    setTimers((await listTimers(sql)).filter((t) => t.status === 'running'));
  }

  async function start() {
    const result = await startTimer(expoReminderBridge, sql, { id: randomUUID(), label, minutes, now: new Date(), nativeId: randomUUID() }, alarmBridge);
    if (result.ok) {
      setLabel('');
      setMessage(`Started. Ends at ${clock(result.timer.endsAt)}.`);
      await reload();
    } else {
      const text: Record<string, string> = {
        not_permitted: 'Notifications are off for WakeWise. Turn them on in Settings to get timer ends.',
        bad_label: 'Give the timer a name, such as Bake or Tea.',
        too_long: 'Choose between 1 minute and 24 hours.',
        failed: 'The timer could not be set. Please try again.',
      };
      setMessage(text[result.error]);
    }
  }

  async function stop(timer: SavedTimer) {
    await cancelTimer(expoReminderBridge, sql, timer, alarmBridge);
    await reload();
  }

  return (
    <Page>
      <Stack.Screen options={{ title: 'Timers' }} />
      <Heading title="Timers" body="For cooking or study. When it ends you get a notification, which iOS may silence in Focus." />
      <SectionLabel>New timer</SectionLabel>

      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Name, for example Bake" placeholderTextColor={colors.muted} accessibilityLabel="Timer name" />
      <View style={styles.chips}>
        {TIMER_PRESETS.map((m) => (
          <PressScale key={m} onPress={() => setMinutes(m)} accessibilityRole="radio" accessibilityState={{ selected: minutes === m }} style={[styles.chip, minutes === m && styles.chipOn]}>
            <Text style={[styles.chipText, minutes === m && styles.chipTextOn]}>{m} min</Text>
          </PressScale>
        ))}
      </View>
      <PrimaryButton label={`Start ${minutes} min timer`} onPress={() => void start()} />
      {message ? <Text style={styles.message} accessibilityRole="alert">{message}</Text> : null}

      <SectionLabel>Running</SectionLabel>
      {timers.length === 0 ? <Text style={styles.body}>No timers running.</Text> : null}
      {timers.map((t) => (
        <View key={t.id} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>{t.label}</Text>
            <Text style={styles.caption}>Ends at {clock(t.endsAt)}</Text>
          </View>
          <PressScale onPress={() => void stop(t)} style={styles.small} accessibilityRole="button" accessibilityLabel={`Cancel ${t.label}`}>
            <Text style={styles.smallText}>Cancel</Text>
          </PressScale>
        </View>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  heading: { color: colors.ink, ...type.title, marginTop: space.lg },
  label: { color: colors.ink, ...type.label },
  caption: { color: colors.muted, ...type.caption },
  message: { color: colors.ink, ...type.caption },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { backgroundColor: colors.card, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line, padding: space.md, color: colors.ink, ...type.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, ...type.label },
  chipTextOn: { color: colors.onPrimary },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  primaryText: { color: colors.onPrimary, ...type.label },
  small: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: colors.card },
  smallText: { color: colors.ink, ...type.label },
});
