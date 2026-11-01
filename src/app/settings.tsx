import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { CollapsibleLine, Line } from '../components/CollapsibleLine';
import { Intro, Lines, Options, Page, SectionLabel } from '../components/Layout';
import { SoundChoice } from '../components/SoundChoice';
import { LEVEL_NAMES } from '../challenge/sums';
import { loadPreferences, savePreference, type Appearance, type Preferences } from '../context/contextRepository';
import { soundById, type WakeSound } from '../sound/wakeSounds';
import { sqlFrom } from '../storage/sqlAdapter';
import { applyAppearance } from '../theme/appearance';
import { colors } from '../theme/tokens';

/** Settings: the alarm tone you want by default, and the privacy choices. Tap a tone to hear it; the choice is saved. */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Read again each time the screen comes back into view, so a change made on Wake mode shows here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadPreferences(sql).then((p) => {
        if (!active) return;
        setSoundId(p.soundId);
        setPrefs(p);
      });
      return () => {
        active = false;
      };
    }, [sql]),
  );

  async function chooseAppearance(choice: Appearance) {
    setPrefs((p) => (p ? { ...p, appearance: choice } : p));
    // The whole app changes at once. The choice is saved so it is applied on the next start too.
    applyAppearance(choice);
    await savePreference(sql, 'appearance', choice, new Date().toISOString());
  }

  async function choose(sound: WakeSound) {
    setSoundId(sound.id);
    await savePreference(sql, 'soundId', sound.id, new Date().toISOString());
    setMessage(`${sound.name} is now your default alarm tone.`);
  }

  return (
    <Page title="Settings">
      <Intro>Defaults for new alarms. Volume and vibration are set by iOS, not by the app.</Intro>

      <SectionLabel>Appearance</SectionLabel>
      {prefs ? (
        <Options<Appearance>
          label="Appearance"
          options={[
            { value: 'night', label: 'Night' },
            { value: 'day', label: 'Day' },
            { value: 'auto', label: 'Automatic' },
          ]}
          value={prefs.appearance}
          onChange={(v) => void chooseAppearance(v)}
        />
      ) : null}
      <Text style={styles.note}>Night is easiest on the eyes in the dark. Automatic follows your iPhone.</Text>

      <SectionLabel>Alarms</SectionLabel>
      <Lines>
        <CollapsibleLine title="Alarm sound" value={soundId ? soundById(soundId).name : ''} open={soundOpen} onToggle={() => setSoundOpen((open) => !open)}>
          {soundId ? <SoundChoice selectedId={soundId} onSelect={(s) => void choose(s)} /> : null}
        </CollapsibleLine>
        <Line title="Wake mode" value={prefs ? (prefs.wakeMode === 'simple' ? 'Simple, tap Stop' : `Challenge, ${prefs.challengeType}, ${LEVEL_NAMES[prefs.challengeLevel].toLowerCase()}`) : ''} onPress={() => router.push('/wake-mode')} />
      </Lines>
      {message ? (
        <Text style={styles.message} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}

      <SectionLabel>Privacy</SectionLabel>
      <Lines>
        <Line title="Speech and privacy" value="What is shared, and when" onPress={() => router.push('/consent')} />
        {__DEV__ ? <Line title="Alarm test" value="Development only" onPress={() => router.push('/alarm-test')} /> : null}
      </Lines>
    </Page>
  );
}

const styles = StyleSheet.create({
  message: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 19, marginTop: -12 },
});
