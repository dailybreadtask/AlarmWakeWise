import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { CREATE_ALARM_MESSAGES, createAlarm } from '../alarm/createAlarm';
import { alarmBridge } from '../alarm/nativeBridge';
import { loadPreferences } from '../context/contextRepository';
import { nextOccurrence } from '../domain/time';
import { soundById } from '../sound/wakeSounds';
import { dayBeingPlanned } from '../domain/planningDay';
import { JourneyCard } from '../components/JourneyCard';
import { PlanCard } from '../components/PlanCard';
import { PlanFeedbackCard } from '../components/PlanFeedbackCard';
import { PressScale } from '../components/PressScale';
import { TimeTape } from '../components/TimeTape';
import { WeatherLine } from '../components/WeatherLine';
import { listAlarms, markAlarmCancelled, reconcileAlarms, type SavedAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';
import { useTodayWeather } from '../weather/useTodayWeather';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_LISTED = 3;
/** Where the tape rests before an alarm is set or the person has moved it. */
const DEFAULT_TAPE_MINUTES = 7 * 60;

/** Home, following the approved Swiss dashboard: one large time, a tape to set it, the week, the alarms, and a bottom bar. */
export default function HomeScreen() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const weather = useTodayWeather();
  const [alarms, setAlarms] = useState<SavedAlarm[]>([]);
  // The time the person has dragged the tape to, before it is set. Null until they touch the tape.
  const [draft, setDraft] = useState<number | null>(null);
  const [setting, setSetting] = useState(false);

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
    void upcomingAlarms(sqlFrom(db))
      .then((list) => {
        if (active) setAlarms(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      appState.remove();
    };
  }, [db]);

  function turnOff(alarm: SavedAlarm) {
    Alert.alert('Turn off this alarm?', `${alarm.title} will not ring. You can set it again from the plan.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sql = sqlFrom(db);
            await alarmBridge.cancel(alarm.nativeId);
            await markAlarmCancelled(sql, alarm.nativeId, new Date().toISOString());
            setAlarms(await upcomingAlarms(sql));
          })().catch(() => Alert.alert('Could not turn it off', 'Check your alarms in the Clock app.'));
        },
      },
    ]);
  }

  async function setDraftAlarm() {
    if (draft === null || setting) return;
    setSetting(true);
    try {
      const sql = sqlFrom(db);
      const prefs = await loadPreferences(sql);
      const wakeAt = nextOccurrence(Math.floor(draft / 60), draft % 60, new Date());
      const result = await createAlarm(sql, { wakeAt, title: 'Alarm', soundFile: soundById(prefs.soundId).alarmFile });
      if (!result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Alarm not set', CREATE_ALARM_MESSAGES[result.reason]);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft(null);
      setAlarms(await upcomingAlarms(sql));
    } finally {
      setSetting(false);
    }
  }

  // Re-render once a minute so the countdown keeps time.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const planned = dayBeingPlanned(now);
  const next = alarms[0] ?? null;
  const nextDate = next ? new Date(next.wakeAt) : null;
  const clock = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(d);
  const nextClock = nextDate ? clock(nextDate) : null;
  const nextMinutes = nextClock ? Number(nextClock.slice(0, 2)) * 60 + Number(nextClock.slice(3, 5)) : null;
  // The big time follows the tape. Before anything is set or moved it shows 07:00, greyed, as a place to start.
  const shown = draft ?? nextMinutes ?? DEFAULT_TAPE_MINUTES;
  const hh = String(Math.floor(shown / 60)).padStart(2, '0');
  const mm = String(shown % 60).padStart(2, '0');
  const isReal = draft !== null || nextMinutes !== null;
  const countdownMinutes = nextDate ? Math.max(0, Math.round((nextDate.getTime() - now.getTime()) / 60000)) : 0;
  const draftMinutesAway = draft !== null ? Math.round((nextOccurrence(Math.floor(draft / 60), draft % 60, now).getTime() - now.getTime()) / 60000) : 0;
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(now);

  // Monday-first week that contains today.
  const mondayOffset = (now.getDay() + 6) % 7;
  const week = DAY_LABELS.map((label, i) => {
    const day = new Date(now);
    day.setDate(now.getDate() - mondayOffset + i);
    const hasAlarm = alarms.some((a) => new Date(a.wakeAt).toDateString() === day.toDateString());
    return { label, date: day.getDate(), isToday: i === mondayOffset, hasAlarm };
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 140 + insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Wakewise</Text>
          <Text style={styles.date}>{dateLine}</Text>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.time, !isReal && styles.timeIdle]} accessibilityLabel={isReal ? `Alarm time ${hh}:${mm}` : 'No alarm set'}>
            {hh}
            <Text style={styles.colon}>:</Text>
            {mm}
          </Text>
          <Text style={styles.countdown}>
            {draft !== null ? (
              <>
                Rings in <Text style={styles.countdownStrong}>{`${Math.floor(draftMinutesAway / 60)}h ${draftMinutesAway % 60}m`}</Text>
              </>
            ) : next ? (
              <>
                Next alarm in <Text style={styles.countdownStrong}>{`${Math.floor(countdownMinutes / 60)}h ${countdownMinutes % 60}m`}</Text>
              </>
            ) : (
              'Nothing set yet. Drag the tape to set an alarm.'
            )}
          </Text>
          <WeatherLine summary={weather} />
        </View>

        <TimeTape value={shown} onChange={setDraft} />

        {draft !== null ? (
          <View style={styles.setRow}>
            <Pressable onPress={() => setDraft(null)} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.setCancel}>
              <Text style={styles.setCancelText}>Cancel</Text>
            </Pressable>
            <PressScale style={[styles.setButton, setting && styles.setDisabled]} onPress={() => void setDraftAlarm()} disabled={setting} accessibilityRole="button" accessibilityLabel={`Set alarm for ${hh}:${mm}`}>
              <Text style={styles.setText}>{setting ? 'Setting…' : `Set alarm for ${hh}:${mm}`}</Text>
            </PressScale>
          </View>
        ) : null}

        <View style={styles.week}>
          {week.map((d) => (
            <View key={d.label} style={[styles.day, d.isToday && styles.dayToday]} accessibilityLabel={`${d.label} ${d.date}${d.hasAlarm ? ', has alarm' : ''}`}>
              <Text style={[styles.dayLabel, d.isToday && styles.dayOn]}>{d.label}</Text>
              <Text style={[styles.dayDate, d.isToday && styles.dayOn]}>{d.date}</Text>
              <View style={[styles.dot, d.hasAlarm && !d.isToday && styles.dotOn]} />
            </View>
          ))}
        </View>

        <PlanCard />

        <PressScale style={styles.prompt} onPress={() => router.push('/capture')} accessibilityRole="button" accessibilityLabel={`What's ${planned.word.toLowerCase()} for? Plan it by voice`}>
          <View style={styles.flex}>
            <Text style={styles.promptEyebrow}>Plan with your voice</Text>
            <Text style={styles.promptTitle}>What’s {planned.word.toLowerCase()} for?</Text>
          </View>
          <View style={styles.promptMic}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
              <Rect x={9} y={3} width={6} height={12} rx={3} />
              <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </Svg>
          </View>
        </PressScale>

        {alarms.length > 0 ? (
          <View style={styles.alarms}>
            {alarms.slice(0, MAX_LISTED).map((a) => (
              <View key={a.id} style={styles.alarmCard}>
                <Text style={styles.alarmTime}>{clock(new Date(a.wakeAt))}</Text>
                <View style={styles.flex}>
                  <Text style={styles.alarmTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.caption}>{dayWords(new Date(a.wakeAt), now)}</Text>
                </View>
                <Switch
                  value={a.status === 'scheduled'}
                  onValueChange={(on) => {
                    if (!on) turnOff(a);
                  }}
                  trackColor={{ false: '#DADAD4', true: colors.ink }}
                  thumbColor={colors.primary}
                  accessibilityLabel={`${a.title} alarm at ${clock(new Date(a.wakeAt))}`}
                />
              </View>
            ))}
          </View>
        ) : null}

        <JourneyCard />
        <PlanFeedbackCard />
      </ScrollView>

      <View style={[styles.nav, { paddingBottom: 12 + insets.bottom }]}>
        <NavItem label="Alarms" active icon="alarm" onPress={() => router.push('/')} />
        <NavItem label="Timers" icon="timer" onPress={() => router.push('/timers')} />
        <NavItem label="Insights" icon="context" onPress={() => router.push('/context')} />
        <NavItem label="Settings" icon="settings" onPress={() => router.push('/settings')} />
        <PressScale style={styles.fab} onPress={() => router.push('/new-alarm')} accessibilityRole="button" accessibilityLabel="New alarm">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round">
            <Path d="M12 4v16M4 12h16" />
          </Svg>
        </PressScale>
      </View>
    </View>
  );
}

/** Alarms still to ring, soonest first. Reconciles with iOS first when the alarm module is there. */
async function upcomingAlarms(sql: ReturnType<typeof sqlFrom>): Promise<SavedAlarm[]> {
  // Only compare with iOS when the alarm module is really there. Otherwise every saved alarm would look missing.
  if (alarmBridge.isSupported()) {
    const held = (await alarmBridge.scheduled()).map((a) => a.id);
    await reconcileAlarms(sql, held, new Date().toISOString());
  }
  const now = Date.now();
  return (await listAlarms(sql))
    .filter((a) => new Date(a.wakeAt).getTime() > now && a.status !== 'cancelled')
    .sort((a, b) => new Date(a.wakeAt).getTime() - new Date(b.wakeAt).getTime());
}

/** "Today", "Tomorrow", or the weekday and date, relative to now. */
function dayWords(day: Date, now: Date): string {
  const diff = Math.round((new Date(day.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(day);
}

function NavItem({ label, icon, active, onPress }: { label: string; icon: 'alarm' | 'timer' | 'context' | 'settings'; active?: boolean; onPress: () => void }) {
  const tint = active ? colors.ink : colors.muted;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} style={styles.navItem}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {icon === 'alarm' ? (
          <>
            <Circle cx={12} cy={13} r={8} />
            <Path d="M12 9v4l2.5 1.5" />
          </>
        ) : null}
        {icon === 'timer' ? <Path d="M9 3h6M12 14l3-3M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" /> : null}
        {icon === 'context' ? (
          <>
            <Path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
            <Circle cx={12} cy={11} r={2} />
          </>
        ) : null}
        {icon === 'settings' ? (
          <>
            <Path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <Circle cx={16} cy={7} r={2} />
            <Circle cx={8} cy={17} r={2} />
          </>
        ) : null}
      </Svg>
      <Text style={[styles.navLabel, { color: tint }, active && styles.navLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: space.xl, paddingTop: 62, gap: space.xl, flexGrow: 1 },
  flex: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  wordmark: { color: colors.ink, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  date: { color: colors.muted, fontSize: 15 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  hero: { marginTop: space.md, gap: space.md },
  time: { color: colors.ink, fontSize: 152, fontWeight: '100', letterSpacing: -10, lineHeight: 168, marginLeft: -6, fontVariant: ['tabular-nums'] },
  colon: { color: '#9A9A94' },
  countdown: { color: colors.muted, fontSize: 17 },
  countdownStrong: { color: colors.ink, fontWeight: '500' },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, height: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayToday: { backgroundColor: colors.ink },
  dayLabel: { color: colors.ink, fontSize: 13, fontWeight: '500' },
  dayDate: { color: colors.ink, fontSize: 17, fontVariant: ['tabular-nums'] },
  dayOn: { color: colors.paper },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary, borderWidth: 1, borderColor: '#B8AE1E' },
  timeIdle: { color: '#B9B9B3' },
  setRow: { flexDirection: 'row', gap: 10 },
  setCancel: { minHeight: 58, paddingHorizontal: 22, borderRadius: 29, borderWidth: 1, borderColor: '#CFCFC9', alignItems: 'center', justifyContent: 'center' },
  setCancelText: { color: colors.ink, fontSize: 17 },
  setButton: { flex: 1, minHeight: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(32,32,32,0.12)' },
  setText: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
  setDisabled: { opacity: 0.5 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.ink },
  promptEyebrow: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  promptTitle: { color: colors.ink, fontSize: 26, fontWeight: '500', letterSpacing: -0.8 },
  promptMic: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(32,32,32,0.12)' },
  alarms: { gap: space.sm },
  alarmCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.md },
  alarmTime: { color: colors.ink, fontSize: 40, fontWeight: '200', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  alarmTitle: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 10, paddingHorizontal: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper },
  navItem: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  navLabel: { fontSize: 12, fontWeight: '500' },
  navLabelOn: { fontWeight: '600' },
  fab: { position: 'absolute', right: space.xl, top: -40, width: 56, height: 49, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
});
