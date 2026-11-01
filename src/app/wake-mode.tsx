import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GRID, PATTERN_LEVELS } from '../challenge/pattern';
import { LEVEL_NAMES, makeSum, seededRandom, type ChallengeLevel } from '../challenge/sums';
import { Intro, Options, Page, PrimaryButton, SectionLabel } from '../components/Layout';
import { loadPreferences, savePreference, type ChallengeType, type WakeMode } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

const HINTS: Record<ChallengeType, string[]> = {
  maths: ['Single digits, like 4 + 7', 'Two digits, like 17 + 8', 'Multiplication, like 14 × 6'],
  pattern: [PATTERN_LEVELS[0].hint, PATTERN_LEVELS[1].hint, PATTERN_LEVELS[2].hint],
};

/** The lit points shown in the preview of the pattern challenge. */
const SAMPLE_POINTS = [7, 14, 15, 22, 28];

/**
 * Wake mode: what finishes waking up after you stop the alarm. Simple ends it with Stop. Challenge asks for a short task,
 * and there is always a way out. This is the default for every alarm.
 */
export default function WakeModeScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [mode, setMode] = useState<WakeMode>('challenge');
  const [type, setType] = useState<ChallengeType>('maths');
  const [level, setLevel] = useState<ChallengeLevel>(1);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPreferences(sql).then((p) => {
      if (!active) return;
      setMode(p.wakeMode);
      setType(p.challengeType);
      setLevel(p.challengeLevel);
    });
    return () => {
      active = false;
    };
  }, [sql]);

  async function use() {
    const at = new Date().toISOString();
    await savePreference(sql, 'wakeMode', mode, at);
    await savePreference(sql, 'challengeType', type, at);
    await savePreference(sql, 'challengeLevel', level, at);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    router.back();
  }

  const sample = makeSum(seededRandom(11), level).question;

  return (
    <Page title="Wake mode" footer={<PrimaryButton label={saved ? 'Saved' : 'Use this wake mode'} onPress={() => void use()} disabled={saved} />}>
      <Intro>What finishes waking up after you stop the alarm. It applies to every alarm.</Intro>

      <View>
        <ModeLine title="Simple" detail="Tap Stop to end" on={mode === 'simple'} onPress={() => setMode('simple')} />
        <ModeLine title="Challenge" detail="Finish a task to end" on={mode === 'challenge'} onPress={() => setMode('challenge')} />
      </View>

      {mode === 'challenge' ? (
        <>
          <SectionLabel>Challenge</SectionLabel>
          <Options<string>
            label="Challenge"
            options={[
              { value: 'maths', label: 'Maths' },
              { value: 'pattern', label: 'Pattern' },
              { value: 'scan', label: 'Scan code (soon)', disabled: true },
            ]}
            value={type}
            onChange={(v) => setType(v as ChallengeType)}
          />

          <View style={styles.preview} accessibilityLabel="Challenge preview">
            {type === 'maths' ? (
              <>
                <Text style={styles.sample}>{sample}</Text>
                <View style={styles.rule} />
                <Text style={styles.previewNote}>1 of 3</Text>
              </>
            ) : (
              <>
                <View style={styles.dots}>
                  {Array.from({ length: GRID * GRID }, (_, i) => (
                    <View key={i} style={styles.cell}>
                      <View style={[styles.pip, SAMPLE_POINTS.includes(i) && styles.pipOn]} />
                    </View>
                  ))}
                </View>
                <Text style={styles.previewNote}>Trace the lit points in order</Text>
              </>
            )}
          </View>

          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>Difficulty</Text>
            <Text style={styles.levelName}>{LEVEL_NAMES[level]}</Text>
          </View>
          <Options<string>
            label="Difficulty"
            options={LEVEL_NAMES.map((n, i) => ({ value: String(i), label: n }))}
            value={String(level)}
            onChange={(v) => setLevel(Number(v) as ChallengeLevel)}
          />
          <Text style={styles.hint}>{HINTS[type][level]}</Text>
          <Text style={styles.hint}>If you can’t complete it, hold the button for three seconds to finish. The alarm always ends.</Text>
        </>
      ) : null}
    </Page>
  );
}

function ModeLine({ title, detail, on, onPress }: { title: string; detail: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${title}. ${detail}`} style={styles.modeLine}>
      <View style={styles.modeText}>
        <Text style={[styles.modeTitle, on && styles.modeTitleOn]}>{title}</Text>
        <Text style={styles.modeDetail}>{detail}</Text>
      </View>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modeLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, borderBottomWidth: 1, borderBottomColor: '#CFCFC9' },
  modeText: { flex: 1, gap: 2 },
  modeTitle: { color: '#8A8A84', fontSize: 24, fontWeight: '300' },
  modeTitleOn: { color: colors.ink },
  modeDetail: { color: colors.muted, fontSize: 14 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#9A9A94', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink, backgroundColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  // A small dark window showing what the challenge looks like, as it will on the dark ringing screens.
  preview: { height: 200, borderRadius: 28, backgroundColor: '#202020', alignItems: 'center', justifyContent: 'center', gap: 12 },
  sample: { color: '#F5F5F2', fontSize: 64, fontWeight: '100', letterSpacing: -3, fontVariant: ['tabular-nums'] },
  rule: { width: 120, height: 1, backgroundColor: colors.primary },
  previewNote: { color: '#BDBDB6', fontSize: 15 },
  dots: { width: 168, flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5A5A55' },
  pipOn: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  levelLabel: { color: colors.ink, fontSize: 17 },
  levelName: { color: colors.ink, fontSize: 17, fontWeight: '500' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: -space.md },
});
