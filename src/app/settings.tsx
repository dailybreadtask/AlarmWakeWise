import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { Card, Heading, Page, SectionLabel } from '../components/Layout';
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
    <Page>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Heading title="Alarm sound" body="Choose the tone your alarms use. Tap a tone to hear it." />
      <SectionLabel>Tones</SectionLabel>
      <Card>{soundId ? <SoundChoice selectedId={soundId} onSelect={(s) => void choose(s)} /> : null}</Card>
      <Text style={[type.caption, { color: colors.muted, paddingHorizontal: space.xs }]}>Current: {soundById(soundId ?? '').name}. Volume and vibration are set by iOS, not by the app.</Text>
      {message ? <Text style={[type.body, { color: colors.ink }]} accessibilityRole="alert">{message}</Text> : null}
    </Page>
  );
}
