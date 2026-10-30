import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { alarmBridge } from '../alarm/nativeBridge';
import { listAlarms, reconcileAlarms, type SavedAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { PressScale } from '../components/PressScale';
import { PlanFeedbackCard } from '../components/PlanFeedbackCard';
import { JourneyCard } from '../components/JourneyCard';
import { colors, radius, space, type } from '../theme/tokens';

/** Home, following the mockup's Today screen. No sample alarm times: we do not schedule alarms yet. */
export default function HomeScreen() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const db = useSQLiteContext();
  const [next, setNext] = useState<SavedAlarm | null>(null);

  useEffect(() => {
    let active = true;
    // An alarm stopped while the app was closed or in the background opens the challenge.
    const checkDismissal = () => {
      if (alarmBridge.consumePendingDismissal?.()) router.push('/challenge');
    };
    checkDismissal();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDismissal();
    });
    void (async () => {
      const sql = sqlFrom(db);
      // Only compare with iOS when the alarm module is really there. Otherwise every saved alarm would look missing.
      if (alarmBridge.isSupported()) {
        const held = (await alarmBridge.scheduled()).map((a) => a.id);
        await reconcileAlarms(sql, held, new Date().toISOString());
      }
      const now = Date.now();
      const upcoming = (await listAlarms(sql)).find((a) => new Date(a.wakeAt).getTime() > now && a.status !== 'cancelled');
      if (active) setNext(upcoming ?? null);
    })().catch(() => undefined);
    return () => {
      active = false;
      appState.remove();
    };
  }, [db]);

  const nextClock = next ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(next.wakeAt)) : null;
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Text style={styles.wordmark}>wakewise</Text>
        <Text style={styles.caption}>{today}</Text>
      </View>

      <Text style={styles.caption}>Next alarm</Text>
      <Text style={styles.empty}>{nextClock ?? 'None set'}</Text>
      {next ? (
        <Text style={styles.caption}>
          {next.status === 'missing' ? 'Not found on this iPhone. Check the alarm in the Clock app.' : 'Scheduled on this iPhone.'}
        </Text>
      ) : (
        <Text style={styles.caption}>No alarm is saved yet.</Text>
      )}

      <View style={styles.actions}>
        <View style={[styles.card, styles.cardOutline]} accessibilityState={{ disabled: true }}>
          <Text style={styles.cardTitle}>Quick alarm</Text>
          <Text style={styles.caption}>Just a time. Not built yet</Text>
        </View>
        <PressScale style={[styles.card, styles.cardSignal]} onPress={() => router.push('/capture')} accessibilityRole="button" accessibilityLabel="Plan a purpose">
          <Text style={[styles.cardTitle, styles.cardPrimaryText]}>Plan a purpose</Text>
          <Text style={[styles.caption, styles.cardPrimaryText]}>Say what you need</Text>
        </PressScale>
      </View>

      <JourneyCard />
      <PlanFeedbackCard />
      <PressScale onPress={() => router.push('/settings')} accessibilityRole="button" style={styles.textLink}>
        <Text style={styles.link}>Settings</Text>
      </PressScale>
      <PressScale onPress={() => router.push('/timers')} accessibilityRole="button" style={styles.textLink}>
        <Text style={styles.link}>Timers</Text>
      </PressScale>
      <PressScale onPress={() => router.push('/context')} accessibilityRole="button" style={styles.textLink}>
        <Text style={styles.link}>Your context</Text>
      </PressScale>
      <PressScale onPress={() => router.push('/consent')} accessibilityRole="button" style={styles.textLink}>
        <Text style={styles.link}>Speech and privacy</Text>
      </PressScale>
      {__DEV__ ? (
        <PressScale onPress={() => router.push('/alarm-test')} accessibilityRole="button" style={styles.textLink}>
          <Text style={styles.link}>Alarm test (development)</Text>
        </PressScale>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.md, flexGrow: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl },
  wordmark: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  caption: { color: colors.muted, ...type.caption },
  empty: { color: colors.ink, fontSize: 72, fontWeight: '200', letterSpacing: -2 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  card: { flex: 1, borderRadius: radius.card, padding: space.lg, gap: space.xs, minHeight: 112, justifyContent: 'flex-end' },
  cardOutline: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'flex-end' },
  cardSignal: { backgroundColor: colors.primary },
  cardTitle: { color: colors.ink, ...type.title },
  cardPrimaryText: { color: colors.onPrimary },
  textLink: { alignSelf: 'center', marginTop: space.xl },
  link: { color: colors.ink, textDecorationLine: 'underline', ...type.label },
});
