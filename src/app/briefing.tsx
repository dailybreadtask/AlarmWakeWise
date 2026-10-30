import { Stack, router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import { briefingSpeech, buildBriefing, type BriefingLine } from '../briefing/briefing';
import { listPlans, loadTimeline } from '../plans/planRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, radius, space, type } from '../theme/tokens';

/** After the challenge: a short summary, with where each line came from. It never delays the day. */
export default function BriefingScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [lines, setLines] = useState<BriefingLine[] | null>(null);

  useEffect(() => {
    let active = true;
    void listPlans(sql).then(async (plans) => {
      const latest = plans[0];
      const timeline = latest ? await loadTimeline(sql, latest.id) : [];
      const plan = latest && timeline.length > 0 ? { ok: true as const, wakeAt: new Date(latest.wakeAt), spareMinutes: 0, timeline } : null;
      const built = buildBriefing({ goal: latest?.goal ?? '', timezone, now: new Date(), plan, train: null });
      if (active) setLines(built);
    });
    return () => {
      active = false;
    };
  }, [sql, timezone]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Your briefing', headerBackVisible: false }} />
      <Text style={styles.display}>Good morning.</Text>
      {lines?.map((line, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.body}>{line.text}</Text>
          <Text style={styles.caption}>Source: {line.source}</Text>
        </View>
      ))}
      <PressScale onPress={() => Speech.speak(briefingSpeech(lines ?? []))} style={styles.secondary} accessibilityRole="button">
        <Text style={styles.label}>Read it aloud</Text>
      </PressScale>
      <PressScale onPress={() => { Speech.stop(); router.replace('/'); }} style={styles.primary} accessibilityRole="button">
        <Text style={styles.primaryText}>Done</Text>
      </PressScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  display: { color: colors.ink, fontSize: 40, fontWeight: '200', letterSpacing: -1 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.lg, gap: space.xs },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  caption: { color: colors.muted, ...type.caption },
  label: { color: colors.ink, ...type.label },
  secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  primaryText: { color: colors.onPrimary, ...type.label },
});
