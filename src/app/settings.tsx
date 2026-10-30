import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { SoundChoice } from '../components/SoundChoice';
import { loadPreferences, savePreference } from '../context/contextRepository';
import { soundById, type WakeSound } from '../sound/wakeSounds';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space, type } from '../theme/tokens';

/** Settings: the alarm tone you want by default. Tap a tone to hear it; the choice is saved. */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadPreferences(sql).then((p) => {
      if (active) setSoundId(p.soundId);
    });
    return () => {
      active = false;
    };
  }, [sql]);

  async function choose(sound: WakeSound) {
    setSoundId(sound.id);
    await savePreference(sql, 'soundId', sound.id, new Date().toISOString());
    setMessage(`${sound.name} is now your default alarm tone.`);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Text style={styles.heading}>Alarm sound</Text>
      <Text style={styles.body}>Pick the tone your alarms use by default. Tap a tone to hear it.</Text>
      {soundId ? <SoundChoice selectedId={soundId} onSelect={(s) => void choose(s)} /> : null}
      <Text style={styles.caption}>Current: {soundById(soundId ?? '').name}</Text>
      {message ? <Text style={styles.body} accessibilityRole="alert">{message}</Text> : null}
      <Text style={styles.caption}>Volume and vibration are set by iOS, not by the app.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  heading: { color: colors.ink, ...type.title },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  caption: { color: colors.muted, ...type.caption },
});
