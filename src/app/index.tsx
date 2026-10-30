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
import { colors, radius, space } from '../theme/tokens';

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

      <View style={styles.hero}>
        <Text style={styles.caption}>Next alarm</Text>
        <Text style={styles.time}>{nextClock ?? '--:--'}</Text>
        <Text style={styles.caption}>
          {next
            ? next.status === 'missing'
              ? 'Not found on this iPhone. Check it in the Clock app.'
              : 'Set on this iPhone.'
            : 'Nothing set yet. Tell me what you need to do.'}
        </Text>
      </View>

      <PressScale style={styles.primary} onPress={() => router.push('/capture')} accessibilityRole="button" accessibilityLabel="Plan a purpose">
        <Text style={styles.primaryTitle}>Plan a purpose</Text>
        <Text style={styles.primaryBody}>Say or type what you need to get done, and I’ll plan the alarm.</Text>
      </PressScale>

      <PressScale style={styles.secondary} onPress={() => router.push('/capture')} accessibilityRole="button" accessibilityLabel="Quick alarm">
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>Quick alarm</Text>
          <Text style={styles.caption}>Just a time, such as “wake me at 6:30”</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </PressScale>

      <JourneyCard />
      <PlanFeedbackCard />

      <Text style={styles.section}>More</Text>
      <View style={styles.list}>
        <ListRow label="Timers" onPress={() => router.push('/timers')} />
        <ListRow label="Your context" detail="Places and planning times" onPress={() => router.push('/context')} />
        <ListRow label="Settings" detail="Alarm sound" onPress={() => router.push('/settings')} />
        <ListRow label="Speech and privacy" detail="What is shared, and when" onPress={() => router.push('/consent')} last={!__DEV__} />
        {__DEV__ ? <ListRow label="Alarm test" detail="Development only" onPress={() => router.push('/alarm-test')} last /> : null}
      </View>
    </ScrollView>
  );
}

function ListRow({ label, detail, onPress, last }: { label: string; detail?: string; onPress: () => void; last?: boolean }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.caption}>{detail}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, flexGrow: 1, backgroundColor: colors.paper, paddingBottom: space.xl * 2 },
  flex: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl },
  wordmark: { color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  hero: { gap: space.xs, paddingVertical: space.sm },
  time: { color: colors.ink, fontSize: 84, fontWeight: '200', letterSpacing: -3, lineHeight: 92 },
  primary: { backgroundColor: colors.primary, borderRadius: radius.card, padding: space.lg, gap: space.xs },
  primaryTitle: { color: colors.onPrimary, fontSize: 20, fontWeight: '600' },
  primaryBody: { color: colors.onPrimary, fontSize: 14, lineHeight: 20 },
  secondary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.card, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  section: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: space.md },
  list: { backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  chevron: { color: colors.muted, fontSize: 22, marginLeft: space.sm },
});
