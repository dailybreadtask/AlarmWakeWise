import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsibleLine, Line } from '../components/CollapsibleLine';
import { CREATE_ALARM_MESSAGES, createAlarm, rescheduleAlarm } from '../alarm/createAlarm';
import { PressScale } from '../components/PressScale';
import { Ruler } from '../components/Ruler';
import { SoundChoice } from '../components/SoundChoice';
import { loadPreferences } from '../context/contextRepository';
import { nextOccurrence } from '../domain/time';
import { DEFAULT_WAKE_SOUND_ID, soundById } from '../sound/wakeSounds';
import { getAlarm, type SavedAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

const DEFAULT_MINUTES = 7 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

/** "Today", "Tomorrow", or the weekday and date. */
function dayWords(day: Date, now: Date): string {
  const diff = Math.round((new Date(day.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(day);
}

/**
 * New alarm, or edit one that is already set: a large time that a ruler sets, a label, a tone and a purpose, then one Save.
 * Nothing is set until Save. Opened with a date, the alarm is for that day. Opened with an alarm id, Save moves that alarm.
 */
export default function NewAlarmScreen() {
  const { alarmId, date } = useLocalSearchParams<{ alarmId?: string; date?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [existing, setExisting] = useState<SavedAlarm | null>(null);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [label, setLabel] = useState('Alarm');
  const [soundId, setSoundId] = useState(DEFAULT_WAKE_SOUND_ID);
  const [soundOpen, setSoundOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const editing = typeof alarmId === 'string' && alarmId !== '';

  useEffect(() => {
    let active = true;
    void (async () => {
      const sql = sqlFrom(db);
      const prefs = await loadPreferences(sql);
      const alarm = editing ? await getAlarm(sql, alarmId) : null;
      if (!active) return;
      setSoundId(prefs.soundId);
      if (alarm) {
        const at = new Date(alarm.wakeAt);
        setExisting(alarm);
        setMinutes(at.getHours() * 60 + at.getMinutes());
        setLabel(alarm.title);
      }
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db, alarmId, editing]);

  const now = new Date();
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  // The day the alarm is for: the day picked on home, the day of the alarm being edited, or else the next time that clock reading comes round.
  const dayParam = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const baseDay = existing ? new Date(existing.wakeAt) : dayParam ? new Date(Number(dayParam.slice(0, 4)), Number(dayParam.slice(5, 7)) - 1, Number(dayParam.slice(8, 10))) : null;
  let wakeAt = nextOccurrence(hour, minute, now);
  let past = false;
  if (baseDay) {
    const onDay = new Date(baseDay);
    onDay.setHours(hour, minute, 0, 0);
    if (onDay.getTime() > now.getTime()) wakeAt = onDay;
    // An alarm being moved to a time already gone today rings the next time that comes round. A day picked on home cannot be in the past.
    else if (!existing) {
      wakeAt = onDay;
      past = true;
    }
  }
  const untilMinutes = Math.round((wakeAt.getTime() - now.getTime()) / 60000);
  const sound = soundById(soundId);

  function fail(text: string) {
    setSaving(false);
    setMessage(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function save() {
    if (past) return;
    setSaving(true);
    setMessage(null);
    const sql = sqlFrom(db);
    const input = { wakeAt, title: label.trim() || 'Alarm', soundFile: sound.alarmFile };
    const result = existing ? await rescheduleAlarm(sql, existing, input) : await createAlarm(sql, input);
    if (!result.ok) return fail(CREATE_ALARM_MESSAGES[result.reason]);
    void Haptics.notificationAsync(result.usedSound === 'bundled' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    router.back();
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>{existing ? 'Edit alarm' : 'New alarm'}</Text>
        <View style={styles.cancel} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.time} accessibilityLabel={`Alarm time ${pad(hour)}:${pad(minute)}`}>
            {pad(hour)}
            <Text style={styles.colon}>:</Text>
            {pad(minute)}
          </Text>
          <Text style={styles.countdown}>
            {past ? (
              'That time has already passed on this day.'
            ) : (
              <>
                {dayWords(wakeAt, now)} · rings in <Text style={styles.countdownStrong}>{`${Math.floor(untilMinutes / 60)}h ${untilMinutes % 60}m`}</Text>
              </>
            )}
          </Text>
        </View>

        <Ruler
          value={minutes}
          min={0}
          max={24 * 60 - 1}
          onChange={setMinutes}
          tickWidth={7}
          major={60}
          medium={15}
          labelEvery={180}
          format={(v) => pad(v / 60)}
          accessibilityLabel="Alarm time"
          valueText={(v) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`}
        />

        <View style={styles.field}>
          <Text style={styles.label}>Label</Text>
          <TextInput value={label} onChangeText={setLabel} placeholder="Alarm" placeholderTextColor={colors.muted} accessibilityLabel="Label" maxLength={40} style={styles.input} />
        </View>

        <View>
          <CollapsibleLine title="Sound" value={sound.name} open={soundOpen} onToggle={() => setSoundOpen((open) => !open)}>
            <SoundChoice selectedId={soundId} onSelect={(s) => setSoundId(s.id)} />
          </CollapsibleLine>
          <Line title="Purpose" value="Plan what you need" onPress={() => router.push('/capture')} />
        </View>

        {message ? (
          <Text style={styles.message} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <PressScale style={[styles.save, (saving || past) && styles.disabled]} onPress={() => void save()} disabled={saving || past} accessibilityRole="button" accessibilityLabel={existing ? 'Save changes' : 'Save alarm'}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save alarm'}</Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6 },
  cancel: { minWidth: 88, minHeight: 44, justifyContent: 'center' },
  cancelText: { color: colors.muted, fontSize: 17 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl },
  hero: { gap: space.sm },
  time: { color: colors.ink, fontSize: 132, fontWeight: '100', letterSpacing: -8.6, lineHeight: 144, marginLeft: -5, fontVariant: ['tabular-nums'] },
  colon: { color: '#9A9A94' },
  countdown: { color: colors.muted, fontSize: 17 },
  countdownStrong: { color: colors.ink, fontWeight: '500' },
  field: { gap: space.sm },
  label: { color: colors.muted, fontSize: 14 },
  input: { height: 50, borderBottomWidth: 1, borderBottomColor: colors.ink, color: colors.ink, fontSize: 22, fontWeight: '300', paddingVertical: 0 },
  message: { color: colors.danger, fontSize: 14, lineHeight: 19 },
  footer: { paddingHorizontal: space.xl, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  save: { height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
