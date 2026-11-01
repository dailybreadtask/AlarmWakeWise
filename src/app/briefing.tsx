import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '../components/PressScale';
import { briefingSpeech, buildBriefing, type BriefingLine } from '../briefing/briefing';
import type { TimelineEntry } from '../domain/planner';
import { listPlans, loadTimeline } from '../plans/planRepository';
import { useTodayWeather } from '../weather/useTodayWeather';
import { stepDoneLabel, stepNote } from '../plans/stepNote';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

const clock = (at: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
const pad = (n: number) => String(n).padStart(2, '0');

interface Loaded {
  goal: string;
  wakeAt: Date | null;
  timeline: TimelineEntry[];
  steps: TimelineEntry[];
  /** The step to start on: the first one that has not already finished. */
  first: number;
}

/**
 * The guided morning, following the approved goal screens: what you need to know, the time left to leave,
 * and one step at a time with Skip and Done. It never delays the day, and the steps come from your saved plan.
 */
export default function BriefingScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weather = useTodayWeather();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [, setMinuteTick] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const sql = sqlFrom(db);
      const now = new Date();
      const plans = await listPlans(sql);
      // The plan whose event is soonest and still ahead, else the latest one saved.
      const upcoming = plans.filter((p) => new Date(p.eventAt).getTime() > now.getTime());
      const plan = upcoming[upcoming.length - 1] ?? plans[0];
      const timeline = plan ? await loadTimeline(sql, plan.id) : [];
      const steps = timeline.filter((e) => e.kind !== 'wake');
      const firstOpen = steps.findIndex((s) => s.startsAt.getTime() + s.minutes * 60_000 > now.getTime());
      if (active) {
        setLoaded({ goal: plan?.goal ?? '', wakeAt: plan ? new Date(plan.wakeAt) : null, timeline, steps, first: firstOpen === -1 ? steps.length : firstOpen });
      }
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db, timezone]);

  // The leave-by countdown keeps time while the screen is open.
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );

  const now = new Date();
  // Built each time it is drawn, so the weather appears as soon as it arrives. The plan's own steps are shown as cards below.
  const lines: BriefingLine[] = loaded
    ? buildBriefing({
        goal: loaded.goal,
        timezone,
        now,
        plan: loaded.wakeAt && loaded.timeline.length > 0 ? { ok: true as const, wakeAt: loaded.wakeAt, spareMinutes: 0, timeline: loaded.timeline } : null,
        train: null,
        weather,
      }).filter((l) => l.source !== 'Your plan')
    : [];
  const steps = loaded?.steps ?? [];
  const current = index ?? loaded?.first ?? 0;
  const finished = loaded !== null && current >= steps.length;
  const step = steps[current] ?? null;
  const next = steps[current + 1] ?? null;
  const leave = steps.find((s) => s.kind === 'travel') ?? null;
  const leaveMinutes = leave ? Math.round((leave.startsAt.getTime() - now.getTime()) / 60_000) : null;

  function advance(skip: boolean) {
    void Haptics.impactAsync(skip ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    if (skip) setSkipped((s) => [...s, current]);
    setIndex(current + 1);
  }

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.row}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.sub}>{clock(now)}</Text>
        </View>

        {lines.length > 0 ? (
          <View style={styles.lines}>
            {lines.map((line, i) => (
              <View key={i} style={styles.lineBlock}>
                <Text style={styles.lead}>{line.text}</Text>
                <Text style={styles.source}>Source: {line.source}</Text>
              </View>
            ))}
            <Pressable onPress={() => Speech.speak(briefingSpeech(lines))} accessibilityRole="button" accessibilityLabel="Read the briefing aloud" style={styles.textButton}>
              <Text style={styles.textButtonText}>Read it aloud</Text>
            </Pressable>
          </View>
        ) : null}

        {leave && leaveMinutes !== null ? (
          <View style={styles.leave} accessibilityLabel={leaveMinutes > 0 ? `Leave by ${clock(leave.startsAt)}, in ${Math.floor(leaveMinutes / 60)} hours ${leaveMinutes % 60} minutes` : 'Time to leave'}>
            <View>
              <Text style={styles.sub}>Leave by {clock(leave.startsAt)}</Text>
              <Text style={styles.countdown}>{leaveMinutes > 0 ? `${Math.floor(leaveMinutes / 60)}:${pad(leaveMinutes % 60)}` : 'Gone'}</Text>
            </View>
            {!finished && loaded ? <Text style={[styles.sub, styles.right]}>{`Step ${Math.min(current + 1, steps.length)} of ${steps.length}`}</Text> : null}
          </View>
        ) : null}

        {loaded && steps.length === 0 ? (
          <Text style={styles.lead}>There is no plan for today yet. Plan a purpose from the home screen and your steps will appear here.</Text>
        ) : null}

        {step ? (
          <Animated.View key={current} entering={FadeInDown.duration(reduced ? 150 : 320)} style={styles.now}>
            <View style={styles.cardTop}>
              <Text style={styles.nowKicker}>Now</Text>
              <Text style={styles.nowTime}>{clock(step.startsAt)}</Text>
            </View>
            <Text style={styles.nowTitle}>{step.label}</Text>
            {stepNote(step) ? <Text style={styles.nowNote}>{stepNote(step)}</Text> : null}
          </Animated.View>
        ) : null}

        {next ? (
          <View style={styles.next}>
            <View style={styles.cardTop}>
              <Text style={styles.nextKicker}>Next</Text>
              <Text style={styles.nextTime}>{clock(next.startsAt)}</Text>
            </View>
            <Text style={styles.nextTitle}>{next.label}</Text>
          </View>
        ) : null}

        {finished && steps.length > 0 ? (
          <Text style={styles.lead}>
            That is every step{skipped.length > 0 ? `, with ${skipped.length} skipped` : ''}. You are all set for {loaded?.goal ? `“${loaded.goal}”` : 'today'}.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step ? (
          <View style={styles.footerRow}>
            <Pressable onPress={() => advance(true)} accessibilityRole="button" accessibilityLabel="Skip this step" style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <PressScale style={styles.done} onPress={() => advance(false)} accessibilityRole="button" accessibilityLabel={stepDoneLabel(step)}>
              <Text style={styles.doneText}>{stepDoneLabel(step)}</Text>
            </PressScale>
          </View>
        ) : (
          <PressScale
            style={styles.leaveButton}
            onPress={() => {
              Speech.stop();
              router.replace('/');
            }}
            accessibilityRole="button"
            accessibilityLabel={finished ? 'On your way, back to home' : 'Back to home'}
          >
            <Text style={styles.leaveButtonText}>{finished ? 'On your way' : 'Back to home'}</Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  greeting: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  sub: { color: '#5E5E59', fontSize: 15, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  lines: { gap: space.md },
  lineBlock: { gap: 2 },
  lead: { color: colors.ink, fontSize: 20, lineHeight: 27, letterSpacing: -0.2 },
  source: { color: colors.muted, fontSize: 13 },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  textButtonText: { color: colors.ink, fontSize: 15, textDecorationLine: 'underline' },
  leave: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 14 },
  countdown: { color: colors.ink, fontSize: 76, fontWeight: '100', letterSpacing: -4.5, lineHeight: 80, fontVariant: ['tabular-nums'] },
  now: { backgroundColor: colors.ink, borderRadius: 28, padding: 20, minHeight: 176, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  nowKicker: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  nowTime: { color: colors.paper, fontSize: 15, fontVariant: ['tabular-nums'] },
  nowTitle: { color: colors.paper, fontSize: 30, fontWeight: '500', letterSpacing: -0.8, lineHeight: 32 },
  nowNote: { color: '#D6D6D0', fontSize: 16, lineHeight: 22, marginTop: 4 },
  next: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: '#ECECE7', padding: 18, gap: 4, marginTop: -space.md, marginHorizontal: space.sm },
  nextKicker: { color: '#5E5E59', fontSize: 14, fontWeight: '600' },
  nextTime: { color: colors.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  nextTitle: { color: colors.ink, fontSize: 20, fontWeight: '500' },
  footer: { paddingHorizontal: space.xl, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper },
  footerRow: { flexDirection: 'row', gap: 10 },
  skip: { minHeight: 58, paddingHorizontal: 22, borderRadius: 29, borderWidth: 1, borderColor: '#CFCFC9', alignItems: 'center', justifyContent: 'center' },
  skipText: { color: colors.ink, fontSize: 17 },
  done: { flex: 1, minHeight: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(32,32,32,0.12)' },
  doneText: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  leaveButton: { minHeight: 58, borderRadius: 29, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  leaveButtonText: { color: colors.paper, fontSize: 18, fontWeight: '600' },
});
