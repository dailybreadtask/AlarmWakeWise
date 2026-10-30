import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { suggestGetReady } from '../plans/learning';
import { listFeedback, plansAwaitingFeedback, saveFeedback, type Outcome, type PrepFeel, type SavedPlan } from '../plans/planRepository';
import { loadPreferences, savePreference } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, radius, space, type } from '../theme/tokens';
import { PressScale } from './PressScale';

type Step = { kind: 'outcome' } | { kind: 'prep'; outcome: Outcome } | { kind: 'suggest'; minutes: number; reason: string } | { kind: 'done' };

const OUTCOME_LABEL: Record<Outcome, string> = { on_time: 'On time', late: 'Late', missed: 'Missed it' };
const PREP_LABEL: Record<PrepFeel, string> = { more: 'Needed more', right: 'About right', less: 'Needed less' };

/** Asks how the most recent finished plan went. Answers are explicit, and a change is only made if the person accepts it. */
export function PlanFeedbackCard() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'outcome' });

  useEffect(() => {
    let active = true;
    void plansAwaitingFeedback(sql, new Date()).then((list) => {
      if (active) setPlan(list[0] ?? null);
    });
    return () => {
      active = false;
    };
  }, [sql]);

  if (!plan || step.kind === 'done') return null;

  async function answerPrep(outcome: Outcome, prep: PrepFeel) {
    if (!plan) return;
    await saveFeedback(sql, { planId: plan.id, outcome, prep, createdAt: new Date().toISOString() });
    const [feedback, prefs] = await Promise.all([listFeedback(sql), loadPreferences(sql)]);
    const suggestion = suggestGetReady(feedback, prefs.getReadyMinutes);
    setStep(suggestion ? { kind: 'suggest', minutes: suggestion.minutes, reason: suggestion.reason } : { kind: 'done' });
  }

  async function acceptSuggestion(minutes: number) {
    await savePreference(sql, 'getReadyMinutes', minutes, new Date().toISOString());
    setStep({ kind: 'done' });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.caption}>How did it go?</Text>
      <Text style={styles.title}>“{plan.goal}”</Text>
      {step.kind === 'outcome' ? (
        <View style={styles.row}>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
            <PressScale key={o} style={styles.chip} onPress={() => setStep({ kind: 'prep', outcome: o })} accessibilityRole="button">
              <Text style={styles.chipText}>{OUTCOME_LABEL[o]}</Text>
            </PressScale>
          ))}
        </View>
      ) : null}
      {step.kind === 'prep' ? (
        <>
          <Text style={styles.body}>Was the time to get ready right?</Text>
          <View style={styles.row}>
            {(Object.keys(PREP_LABEL) as PrepFeel[]).map((p) => (
              <PressScale key={p} style={styles.chip} onPress={() => void answerPrep(step.outcome, p)} accessibilityRole="button">
                <Text style={styles.chipText}>{PREP_LABEL[p]}</Text>
              </PressScale>
            ))}
          </View>
        </>
      ) : null}
      {step.kind === 'suggest' ? (
        <>
          <Text style={styles.body}>{step.reason} Change your default to {step.minutes} minutes?</Text>
          <View style={styles.row}>
            <PressScale style={styles.chip} onPress={() => void acceptSuggestion(step.minutes)} accessibilityRole="button">
              <Text style={styles.chipText}>Yes, change it</Text>
            </PressScale>
            <PressScale style={styles.chip} onPress={() => setStep({ kind: 'done' })} accessibilityRole="button">
              <Text style={styles.chipText}>No, keep it</Text>
            </PressScale>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  caption: { color: colors.muted, ...type.caption },
  title: { color: colors.ink, ...type.label },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.paper },
  chipText: { color: colors.ink, ...type.label },
});
