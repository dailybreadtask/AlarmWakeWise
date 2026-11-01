import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { CollapsibleLine, Line } from '../components/CollapsibleLine';
import { Intro, Lines, Page, SectionLabel } from '../components/Layout';
import { SoundChoice } from '../components/SoundChoice';
import { LEVEL_NAMES } from '../challenge/sums';
import { loadPreferences, savePreference, type Preferences } from '../context/contextRepository';
import { soundById, type WakeSound } from '../sound/wakeSounds';
import { sqlFrom } from '../storage/sqlAdapter';
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

  async function choose(sound: WakeSound) {
    setSoundId(sound.id);
    await savePreference(sql, 'soundId', sound.id, new Date().toISOString());
    setMessage(`${sound.name} is now your default alarm tone.`);
  }

  return (
    <Page title="Settings">
      <Intro>Defaults for new alarms. Volume and vibration are set by iOS, not by the app.</Intro>

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
});
