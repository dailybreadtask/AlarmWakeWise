import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsibleLine, Line } from '../components/CollapsibleLine';
import { CREATE_ALARM_MESSAGES, createAlarm } from '../alarm/createAlarm';
import { PressScale } from '../components/PressScale';
import { SoundChoice } from '../components/SoundChoice';
import { TimeWheel } from '../components/Wheel';
import { loadPreferences } from '../context/contextRepository';
import { nextOccurrence } from '../domain/time';
import { DEFAULT_WAKE_SOUND_ID, soundById } from '../sound/wakeSounds';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

const DEFAULT_HOUR = 7;
const DEFAULT_MINUTE = 0;

/** New alarm: a time wheel, a label, a tone and a purpose, then one Save. Nothing is set until Save. */
export default function NewAlarmScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [minute, setMinute] = useState(DEFAULT_MINUTE);
  const [label, setLabel] = useState('Alarm');
  const [soundId, setSoundId] = useState(DEFAULT_WAKE_SOUND_ID);
  const [soundOpen, setSoundOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadPreferences(sqlFrom(db)).then((p) => {
      if (active) setSoundId(p.soundId);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const now = new Date();
  const wakeAt = nextOccurrence(hour, minute, now);
  const untilMinutes = Math.round((wakeAt.getTime() - now.getTime()) / 60000);
  const countdown = `${Math.floor(untilMinutes / 60)}h ${untilMinutes % 60}m`;
  const sound = soundById(soundId);

  function fail(text: string) {
    setSaving(false);
    setMessage(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await createAlarm(sqlFrom(db), { wakeAt, title: label.trim() || 'Alarm', soundFile: sound.alarmFile });
    if (!result.ok) return fail(CREATE_ALARM_MESSAGES[result.reason]);
    void Haptics.notificationAsync(result.usedSound === 'bundled' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    router.back();
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New alarm</Text>
        <View style={styles.cancel} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TimeWheel hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} />
        <Text style={styles.countdown}>Rings in {countdown}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Label</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Alarm"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Label"
            maxLength={40}
            style={styles.input}
          />
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
        <PressScale style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving} accessibilityRole="button" accessibilityLabel="Save alarm">
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save alarm'}</Text>
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
  countdown: { color: colors.muted, fontSize: 15, textAlign: 'center', marginTop: -space.md },
  field: { gap: space.sm },
  label: { color: colors.muted, fontSize: 14 },
  input: { height: 50, borderBottomWidth: 1, borderBottomColor: colors.ink, color: colors.ink, fontSize: 22, fontWeight: '300', paddingVertical: 0 },
  message: { color: colors.danger, fontSize: 14, lineHeight: 19 },
  footer: { paddingHorizontal: space.xl, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  save: { height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
