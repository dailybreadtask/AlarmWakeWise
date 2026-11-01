import * as Haptics from 'expo-haptics';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { CREATE_ALARM_MESSAGES, createAlarm, rescheduleAlarm } from '../alarm/createAlarm';
import { alarmBridge } from '../alarm/nativeBridge';
import { loadPreferences } from '../context/contextRepository';
import { nextOccurrence } from '../domain/time';
import { soundById } from '../sound/wakeSounds';
import { dayBeingPlanned } from '../domain/planningDay';
import { Line } from '../components/CollapsibleLine';
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
/** Where the tape rests before an alarm is set or the person has moved it. */
const DEFAULT_TAPE_MINUTES = 7 * 60;

/** Home, following the approved Swiss dashboard: one large time, a tape to set it, the week, the alarms, and a bottom bar. */
export default function HomeScreen() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const weather = useTodayWeather();
  const [alarms, setAlarms] = useState<SavedAlarm[]>([]);
  // The day whose alarms are listed, and for which a new alarm is set. Starts as today.
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  // The time the person has dragged the tape to, before it is set. Null until they touch the tape.
  const [draft, setDraft] = useState<number | null>(null);
  const [setting, setSetting] = useState(false);

  useEffect(() => {
    // An alarm stopped while the app was closed or in the background opens the challenge.
    const checkDismissal = () => {
      if (!alarmBridge.consumePendingDismissal?.()) return;
      // Simple wake mode goes straight to the briefing. Challenge asks for the task first.
      void loadPreferences(sqlFrom(db)).then((p) => router.push(p.wakeMode === 'simple' ? '/briefing' : '/challenge'));
    };
    checkDismissal();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDismissal();
    });
    return () => {
      appState.remove();
    };
  }, [db]);

  // The list is read again each time home comes back into view, so an alarm saved or edited on another screen shows at once.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadAlarms(sqlFrom(db))
        .then((list) => {
          if (active) setAlarms(list);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [db]),
  );

  function turnOff(alarm: SavedAlarm) {
    Alert.alert('Turn off this alarm?', `${alarm.title} will not ring. You can switch it back on here.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sql = sqlFrom(db);
            await alarmBridge.cancel(alarm.nativeId);
            await markAlarmCancelled(sql, alarm.nativeId, new Date().toISOString());
            setAlarms(await loadAlarms(sql));
          })().catch(() => Alert.alert('Could not turn it off', 'Check your alarms in the Clock app.'));
        },
      },
    ]);
  }

  /** Switches a saved alarm back on: it is set again with iOS for the same time. */
  async function turnOn(alarm: SavedAlarm) {
    try {
      const sql = sqlFrom(db);
      const prefs = await loadPreferences(sql);
      const result = await rescheduleAlarm(sql, alarm, { wakeAt: new Date(alarm.wakeAt), title: alarm.title, soundFile: soundById(prefs.soundId).alarmFile });
      if (!result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Alarm not set', CREATE_ALARM_MESSAGES[result.reason]);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setAlarms(await loadAlarms(sql));
    } catch {
      Alert.alert('Could not turn it on', 'Please try again.');
    }
  }

  async function setDraftAlarm() {
    if (draft === null || setting) return;
    setSetting(true);
    try {
      const sql = sqlFrom(db);
      const prefs = await loadPreferences(sql);
      // On today, the next time the clock reads that; on another day, that time on that day.
      const today = isSameDay(selected, new Date());
      const wakeAt = today ? nextOccurrence(Math.floor(draft / 60), draft % 60, new Date()) : atTime(selected, draft);
      if (wakeAt.getTime() <= Date.now()) {
        Alert.alert('That time has passed', 'Choose a time that is still ahead.');
        return;
      }
      const result = await createAlarm(sql, { wakeAt, title: 'Alarm', soundFile: soundById(prefs.soundId).alarmFile });
      if (!result.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Alarm not set', CREATE_ALARM_MESSAGES[result.reason]);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft(null);
      setAlarms(await loadAlarms(sql));
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
  const next = alarms.find((a) => new Date(a.wakeAt).getTime() > now.getTime() && a.status !== 'cancelled') ?? null;
  const dayAlarms = alarms.filter((a) => isSameDay(new Date(a.wakeAt), selected));
  const selectedIsToday = isSameDay(selected, now);
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
  const draftAt = draft !== null ? (selectedIsToday ? nextOccurrence(Math.floor(draft / 60), draft % 60, now) : atTime(selected, draft)) : null;
  const draftMinutesAway = draftAt ? Math.round((draftAt.getTime() - now.getTime()) / 60000) : 0;
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(now);

  // Monday-first week that contains today.
  const mondayOffset = (now.getDay() + 6) % 7;
  const week = DAY_LABELS.map((label, i) => {
    const day = startOfDay(new Date(now));
    day.setDate(now.getDate() - mondayOffset + i);
    const hasAlarm = alarms.some((a) => a.status !== 'cancelled' && isSameDay(new Date(a.wakeAt), day));
    return { label, day, date: day.getDate(), isToday: i === mondayOffset, isSelected: isSameDay(day, selected), hasAlarm };
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
            <Pressable
              key={d.label}
              onPress={() => {
                void Haptics.selectionAsync();
                setSelected(d.day);
                setDraft(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: d.isSelected }}
              accessibilityLabel={`${d.label} ${d.date}${d.isToday ? ', today' : ''}${d.hasAlarm ? ', has alarm' : ''}`}
              style={[styles.day, d.isSelected && styles.dayOn]}
            >
              <Text style={[styles.dayLabel, d.isSelected && styles.dayText]}>{d.label}</Text>
              <Text style={[styles.dayDate, d.isSelected && styles.dayText, d.isToday && !d.isSelected && styles.dayToday]}>{d.date}</Text>
              <View style={[styles.dot, d.hasAlarm && !d.isSelected && styles.dotOn]} />
            </Pressable>
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

        <View>
          {!selectedIsToday ? <Text style={styles.dayHeading}>{dayWords(selected, now)}</Text> : null}
          {dayAlarms.length === 0 ? (
            <Line title="No alarms" value="Add one" onPress={() => router.push({ pathname: '/new-alarm', params: { date: ymd(selected) } })} />
          ) : (
            dayAlarms.map((a) => {
              const gone = new Date(a.wakeAt).getTime() <= now.getTime();
              return (
                <View key={a.id} style={styles.alarmRow}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/new-alarm', params: { alarmId: a.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${a.title}, ${clock(new Date(a.wakeAt))}`}
                    style={styles.alarmMain}
                  >
                    <Text style={[styles.alarmTime, a.status !== 'scheduled' && styles.alarmOff]}>{clock(new Date(a.wakeAt))}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.alarmTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.caption}>{gone ? 'Has rung' : a.status === 'missing' ? 'Not found on this iPhone' : dayWords(new Date(a.wakeAt), now)}</Text>
                    </View>
                  </Pressable>
                  <Switch
                    value={a.status === 'scheduled'}
                    disabled={gone}
                    onValueChange={(on) => (on ? void turnOn(a) : turnOff(a))}
                    trackColor={{ false: '#DADAD4', true: colors.ink }}
                    thumbColor={colors.primary}
                    accessibilityLabel={`${a.title} alarm at ${clock(new Date(a.wakeAt))}`}
                  />
                </View>
              );
            })
          )}
        </View>

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

/** Saved alarms from today on, earliest first, including ones switched off. Reconciles with iOS first when the alarm module is there. */
async function loadAlarms(sql: ReturnType<typeof sqlFrom>): Promise<SavedAlarm[]> {
  // Only compare with iOS when the alarm module is really there. Otherwise every saved alarm would look missing.
  if (alarmBridge.isSupported()) {
    const held = (await alarmBridge.scheduled()).map((a) => a.id);
    await reconcileAlarms(sql, held, new Date().toISOString());
  }
  const since = startOfDay(new Date()).getTime();
  return (await listAlarms(sql)).filter((a) => new Date(a.wakeAt).getTime() >= since).sort((a, b) => new Date(a.wakeAt).getTime() - new Date(b.wakeAt).getTime());
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** The day at a time given in minutes after midnight. */
const atTime = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
/** YYYY-MM-DD, in the phone's time zone. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  dayToday: { fontWeight: '700' },
  dayLabel: { color: colors.ink, fontSize: 13, fontWeight: '500' },
  dayDate: { color: colors.ink, fontSize: 17, fontVariant: ['tabular-nums'] },
  dayOn: { backgroundColor: colors.ink },
  dayText: { color: colors.paper },
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
  dayHeading: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', paddingBottom: space.sm },
  alarmRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, borderBottomWidth: 1, borderBottomColor: '#CFCFC9' },
  alarmMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72 },
  alarmOff: { color: '#A3A39D' },
  alarmTime: { color: colors.ink, fontSize: 40, fontWeight: '200', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  alarmTitle: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 10, paddingHorizontal: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper },
  navItem: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  navLabel: { fontSize: 12, fontWeight: '500' },
  navLabelOn: { fontWeight: '600' },
  fab: { position: 'absolute', right: space.xl, top: -40, width: 56, height: 49, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
});
