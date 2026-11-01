import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PlanningDisc } from '../components/PlanningDisc';
import { PressScale } from '../components/PressScale';
import { Options } from '../components/Layout';
import { Ruler } from '../components/Ruler';
import { alarmBridge } from '../alarm/nativeBridge';
import { expoReminderBridge } from '../reminders/expoReminders';
import { sqlFrom } from '../storage/sqlAdapter';
import { listTimers, setTimerStatus, type SavedTimer } from '../timers/timerRepository';
import { cancelTimer, durationWords, startTimer, TIMER_PRESETS } from '../timers/timerService';
import { colors, space } from '../theme/tokens';

/** A clock time, with seconds when the timer is short enough for them to matter. */
const clockExact = (at: string | Date, withSeconds: boolean) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' as const } : {}), hourCycle: 'h23' }).format(new Date(at));

const pad = (n: number) => String(n).padStart(2, '0');

type Unit = 'sec' | 'min' | 'hr';

/** What one tick of the ruler is worth, and how the scale is drawn, for each unit. */
const UNITS: Record<Unit, { label: string; size: number; max: number; major: number; medium?: number; every: number; tick: number }> = {
  sec: { label: 'Seconds', size: 1, max: 180, major: 10, medium: 5, every: 30, tick: 10 },
  min: { label: 'Minutes', size: 60, max: 180, major: 10, medium: 5, every: 30, tick: 10 },
  hr: { label: 'Hours', size: 3600, max: 24, major: 1, every: 4, tick: 24 },
};

/** The ruler that fits a length best: seconds under a minute, minutes up to three hours, hours beyond. */
const unitFor = (seconds: number): Unit => (seconds < 60 ? 'sec' : seconds <= 180 * 60 ? 'min' : 'hr');

/** "10:00", or "1:05:09" from an hour up. */
function lengthClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(seconds % 60)}` : `${pad(m)}:${pad(seconds % 60)}`;
}

/** "09:42", or "1:05:09" when an hour or more is left. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
}

interface TimerView {
  timer: SavedTimer;
  /** Milliseconds left. Zero or less once it has ended. */
  left: number;
  done: boolean;
  /** How much of the timer has passed, from 0 to 1. */
  elapsed: number;
}

/**
 * Countdowns for cooking and study. These are notifications or alarms, not music: they can be silenced.
 *
 * One screen, two states. While a timer runs it is the main thing: a large disc and countdown, with a
 * "New timer" button below. Opening New timer swaps the page for the picker, but keeps the running timer
 * pinned at the top in a small form, so the countdown is never out of view while you set another.
 */
export default function TimersScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [timers, setTimers] = useState<SavedTimer[]>([]);
  const [label, setLabel] = useState('');
  const [seconds, setSeconds] = useState<number>(600);
  const [unit, setUnit] = useState<Unit>('min');
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Whether the picker is open. Until the person chooses, it is open exactly when nothing is running.
  const [setupChoice, setSetupChoice] = useState<boolean | null>(null);
  // Timers already announced as finished, so each finishing is felt once.
  const finishedIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void listTimers(sql).then((list) => {
      if (!active) return;
      setNowMs(Date.now());
      setTimers(list.filter((t) => t.status === 'running'));
    });
    return () => {
      active = false;
    };
  }, [sql]);

  // While any timer is running the screen counts down every second.
  const hasTimers = timers.length > 0;
  useEffect(() => {
    if (!hasTimers) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasTimers]);

  // A light tap when a timer reaches zero while you are looking.
  useEffect(() => {
    for (const t of timers) {
      if (new Date(t.endsAt).getTime() <= nowMs && !finishedIds.current.has(t.id)) {
        finishedIds.current.add(t.id);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [nowMs, timers]);

  async function reload() {
    // The clock is read afresh, so a timer just started shows its full length at once.
    setNowMs(new Date().getTime());
    setTimers((await listTimers(sql)).filter((t) => t.status === 'running'));
  }

  async function start() {
    if (seconds < 1 || starting) return;
    setStarting(true);
    setMessage(null);
    try {
      const result = await startTimer(expoReminderBridge, sql, { id: randomUUID(), label: label.trim() || 'Timer', seconds, now: new Date(), nativeId: randomUUID() }, alarmBridge);
      if (result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLabel('');
        await reload();
        // Back to the countdown, which is the point of starting it.
        setSetupChoice(false);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const text: Record<string, string> = {
          not_permitted: 'Notifications are off for WakeWise. Turn them on in Settings to get timer ends.',
          bad_label: 'Give the timer a name, such as Bake or Tea.',
          too_long: 'Choose between 1 second and 24 hours.',
          failed: 'The timer could not be set. Please try again.',
        };
        setMessage(text[result.error]);
      }
    } finally {
      setStarting(false);
    }
  }

  async function stop(timer: SavedTimer) {
    await cancelTimer(expoReminderBridge, sql, timer, alarmBridge);
    await reload();
  }

  /** A timer that has ended: nothing to cancel, only to put away. */
  async function clear(timer: SavedTimer) {
    await setTimerStatus(sql, timer.id, 'done');
    await reload();
  }

  const now = hasTimers ? new Date(nowMs) : new Date();
  const views: TimerView[] = timers.map((timer) => {
    const end = new Date(timer.endsAt).getTime();
    const total = Math.max(1000, end - new Date(timer.createdAt).getTime());
    const left = end - now.getTime();
    return { timer, left, done: left <= 0, elapsed: Math.min(1, Math.max(0, 1 - left / total)) };
  });
  // The timer that ends soonest is the one on show. One that has just ended stays until it is put away.
  const hero = [...views].filter((v) => !v.done).sort((a, b) => a.left - b.left)[0] ?? views.find((v) => v.done) ?? null;
  const others = views.filter((v) => v !== hero);
  const setupOpen = setupChoice ?? timers.length === 0;
  const endsAt = new Date(now.getTime() + seconds * 1000);

  const act = (v: TimerView) => void (v.done ? clear(v.timer) : stop(v.timer));
  const actLabel = (v: TimerView, long: boolean) => (v.done ? 'Done' : long ? 'Cancel timer' : 'Cancel');

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={styles.back}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M15 6l-6 6 6 6" />
          </Svg>
          <Text style={styles.title}>Timers</Text>
        </Pressable>
      </View>

      {/* Setting another timer: the running one stays pinned here, small, outside the scrolling part. */}
      {setupOpen && hero ? (
        <View style={styles.pinned} accessibilityRole="timer" accessibilityLabel={hero.done ? `${hero.timer.label} has finished` : `${hero.timer.label}, ${countdown(hero.left)} left`}>
          <PlanningDisc progress={hero.done ? 100 : hero.elapsed * 100} drain size={84} />
          <View style={styles.pinnedText}>
            <Text style={styles.pinnedName} numberOfLines={1}>
              {hero.timer.label}
            </Text>
            <Text style={styles.pinnedTime} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {hero.done ? 'Time’s up' : countdown(hero.left)}
            </Text>
          </View>
          <Pressable onPress={() => act(hero)} accessibilityRole="button" accessibilityLabel={hero.done ? `Put away ${hero.timer.label}` : `Cancel ${hero.timer.label}`} hitSlop={8} style={styles.linkButton}>
            <Text style={styles.linkText}>{actLabel(hero, false)}</Text>
          </Pressable>
        </View>
      ) : null}

      {setupOpen ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.setupTop}>
            <Text style={styles.section}>New timer</Text>
            {hasTimers ? (
              <Pressable onPress={() => setSetupChoice(false)} accessibilityRole="button" accessibilityLabel="Close, back to the countdown" hitSlop={8} style={styles.linkButton}>
                <Text style={styles.linkText}>Close</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.lengthBlock}>
            <Text style={styles.length} accessibilityLabel={`Length ${durationWords(seconds)}`}>
              {lengthClock(seconds)}
            </Text>
            <Text style={styles.ends}>{seconds < 1 ? 'Choose a length' : `Ends at ${clockExact(endsAt, seconds < 3600)}`}</Text>
          </View>

          <Options
            label="Ruler unit"
            options={(Object.keys(UNITS) as Unit[]).map((u) => ({ value: u, label: UNITS[u].label }))}
            value={unit}
            onChange={(u) => {
              void Haptics.selectionAsync();
              setUnit(u);
            }}
          />
          <Ruler
            key={unit}
            value={Math.min(UNITS[unit].max, Math.round(seconds / UNITS[unit].size))}
            min={0}
            max={UNITS[unit].max}
            onChange={(v) => setSeconds(v * UNITS[unit].size)}
            tickWidth={UNITS[unit].tick}
            major={UNITS[unit].major}
            medium={UNITS[unit].medium}
            labelEvery={UNITS[unit].every}
            accessibilityLabel={`Timer length in ${UNITS[unit].label.toLowerCase()}`}
            valueText={(v) => durationWords(v * UNITS[unit].size)}
          />

          <View accessibilityRole="radiogroup" accessibilityLabel="Common lengths" style={styles.presets}>
            {TIMER_PRESETS.map((n) => {
              const on = seconds === n;
              const short = n < 60 ? `${n}s` : `${n / 60}m`;
              return (
                <Pressable
                  key={n}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSeconds(n);
                    setUnit(unitFor(n));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={durationWords(n)}
                  style={[styles.preset, on && styles.presetOn]}
                >
                  <Text style={[styles.presetText, on && styles.presetTextOn]}>{short}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput value={label} onChangeText={setLabel} placeholder="Timer, or Bake, Tea, Study" placeholderTextColor={colors.muted} accessibilityLabel="Timer name" maxLength={40} style={styles.input} />
          </View>

          {message ? (
            <Text style={styles.message} accessibilityRole="alert">
              {message}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {hero ? (
            <View style={styles.hero} accessibilityRole="timer" accessibilityLabel={hero.done ? `${hero.timer.label} has finished` : `${hero.timer.label}, ${countdown(hero.left)} left`}>
              <PlanningDisc progress={hero.done ? 100 : hero.elapsed * 100} drain />
              <Text style={styles.heroName}>{hero.timer.label}</Text>
              <Text style={[styles.heroTime, hero.done && styles.heroTimeDone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {hero.done ? 'Time’s up' : countdown(hero.left)}
              </Text>
              <Text style={styles.heroSub}>
                {hero.done ? 'Ended' : 'Ends'} at {clockExact(hero.timer.endsAt, true)}
              </Text>
              <Pressable onPress={() => act(hero)} accessibilityRole="button" accessibilityLabel={hero.done ? `Put away ${hero.timer.label}` : `Cancel ${hero.timer.label}`} hitSlop={8} style={styles.heroAction}>
                <Text style={styles.linkText}>{actLabel(hero, true)}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.empty}>No timers running.</Text>
          )}

          {others.length > 0 ? (
            <View>
              <Text style={styles.sectionPad}>Also running</Text>
              {others.map((v) => (
                <View key={v.timer.id} style={styles.running}>
                  <View style={styles.runningText}>
                    <View style={styles.runningTop}>
                      <Text style={styles.runningName}>{v.timer.label}</Text>
                      <Text style={styles.runningLeft}>{v.done ? 'Time’s up' : countdown(v.left)}</Text>
                    </View>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${Math.round((1 - v.elapsed) * 100)}%` }]} />
                    </View>
                  </View>
                  <Pressable onPress={() => act(v)} accessibilityRole="button" accessibilityLabel={v.done ? `Put away ${v.timer.label}` : `Cancel ${v.timer.label}`} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.linkText}>{actLabel(v, false)}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        {setupOpen ? (
          <PressScale style={[styles.bar58, (seconds < 1 || starting) && styles.disabled]} onPress={() => void start()} disabled={seconds < 1 || starting} accessibilityRole="button" accessibilityLabel={`Start ${durationWords(seconds)} timer`}>
            <Text style={styles.bar58Text}>{starting ? 'Starting…' : seconds < 1 ? 'Start timer' : `Start ${durationWords(seconds)} timer`}</Text>
          </PressScale>
        ) : (
          <PressScale style={styles.bar58} onPress={() => setSetupChoice(true)} accessibilityRole="button" accessibilityLabel="New timer">
            <Text style={styles.bar58Text}>New timer</Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 12, paddingBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 6 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl },
  // The running timer while another is being set: a small disc, the countdown, and Cancel, in one row.
  pinned: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.ink },
  pinnedText: { flex: 1, gap: 2 },
  pinnedName: { color: colors.muted, fontSize: 15 },
  pinnedTime: { color: colors.ink, fontSize: 44, fontWeight: '100', letterSpacing: -2.4, lineHeight: 48, fontVariant: ['tabular-nums'] },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: 15, textDecorationLine: 'underline' },
  setupTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -space.md },
  section: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  sectionPad: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', paddingBottom: space.sm },
  lengthBlock: { gap: space.xs },
  length: { color: colors.ink, fontSize: 96, fontWeight: '100', letterSpacing: -5.5, lineHeight: 104, marginLeft: -4, fontVariant: ['tabular-nums'] },
  ends: { color: colors.muted, fontSize: 15 },
  // Common lengths as plain numerals with a rule under the chosen one, not as pills.
  presets: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  preset: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  presetOn: { borderBottomColor: colors.ink },
  presetText: { color: '#8A8A84', fontSize: 21, fontWeight: '200', fontVariant: ['tabular-nums'] },
  presetTextOn: { color: colors.ink, fontWeight: '300' },
  field: { gap: space.sm },
  label: { color: colors.muted, fontSize: 14 },
  input: { height: 50, borderBottomWidth: 1, borderBottomColor: colors.ink, color: colors.ink, fontSize: 22, fontWeight: '300', paddingVertical: 0 },
  message: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  empty: { color: colors.muted, fontSize: 15 },
  hero: { alignItems: 'center', alignSelf: 'stretch', gap: space.sm, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.ink },
  heroName: { color: colors.muted, fontSize: 17, marginTop: space.md },
  heroTime: { color: colors.ink, fontSize: 76, fontWeight: '100', letterSpacing: -4.5, lineHeight: 82, fontVariant: ['tabular-nums'] },
  // The words are wider than the digits, so they are set smaller to fit the screen.
  heroTimeDone: { fontSize: 52, letterSpacing: -2.5, lineHeight: 60 },
  heroSub: { color: colors.muted, fontSize: 15 },
  heroAction: { minHeight: 44, justifyContent: 'center' },
  running: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: '#CFCFC9' },
  runningText: { flex: 1, gap: 8 },
  runningTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  runningName: { color: colors.ink, fontSize: 17 },
  runningLeft: { color: colors.ink, fontSize: 17, fontWeight: '300', fontVariant: ['tabular-nums'] },
  bar: { height: 2, backgroundColor: '#D6D6D2' },
  barFill: { height: 2, backgroundColor: colors.ink },
  footer: { paddingHorizontal: space.xl, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  bar58: { height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(32,32,32,0.12)' },
  bar58Text: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
