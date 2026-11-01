import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from './PressScale';
import type { TimelineEntry } from '../domain/planner';
import { listPlans, loadTimeline } from '../plans/planRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

interface Summary {
  goal: string;
  eventAt: Date;
  wakeAt: Date;
  next: TimelineEntry | null;
}

const clock = (at: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** The plan the person approved for the next event, with the step that comes next. Opens the guided morning. */
export function PlanCard() {
  const db = useSQLiteContext();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const sql = sqlFrom(db);
      const now = Date.now();
      // listPlans is newest event first, so the soonest upcoming plan is the last one that is still ahead.
      const upcoming = (await listPlans(sql)).filter((p) => new Date(p.eventAt).getTime() > now);
      const plan = upcoming[upcoming.length - 1];
      if (!plan) return;
      const timeline = await loadTimeline(sql, plan.id);
      const next = timeline.find((e) => e.kind !== 'wake' && e.startsAt.getTime() > now) ?? null;
      if (active) setSummary({ goal: plan.goal, eventAt: new Date(plan.eventAt), wakeAt: new Date(plan.wakeAt), next });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db]);

  if (!summary) return null;
  const today = new Date().toDateString() === summary.eventAt.toDateString();
  return (
    <PressScale style={styles.card} onPress={() => router.push('/briefing')} accessibilityRole="button" accessibilityLabel={`${today ? "Today's" : "Tomorrow's"} plan: ${summary.goal}`}>
      <Text style={styles.kicker}>{today ? 'Today’s plan' : 'Your plan'}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {summary.goal}
      </Text>
      <View style={styles.facts}>
        <Text style={styles.fact}>Wake {clock(summary.wakeAt)}</Text>
        {summary.next ? (
          <Text style={styles.fact}>
            Next: {summary.next.label} at {clock(summary.next.startsAt)}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderRadius: 28, padding: 20, gap: space.sm },
  kicker: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  title: { color: colors.paper, fontSize: 24, fontWeight: '500', letterSpacing: -0.6, lineHeight: 28 },
  facts: { gap: 2, marginTop: space.xs },
  fact: { color: '#D6D6D0', fontSize: 15 },
});
