import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { suggestGetReady } from '../plans/learning';
import { listFeedback, plansAwaitingFeedback, saveFeedback, type Outcome, type PrepFeel, type SavedPlan } from '../plans/planRepository';
import { loadPreferences, savePreference } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';
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
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>How did it go?</Text>
      <Text style={styles.title}>“{plan.goal}”</Text>
      {step.kind === 'outcome' ? (
        <View>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
            <Choice key={o} label={OUTCOME_LABEL[o]} onPress={() => setStep({ kind: 'prep', outcome: o })} />
          ))}
        </View>
      ) : null}
      {step.kind === 'prep' ? (
        <>
          <Text style={styles.body}>Was the time to get ready right?</Text>
          <View>
            {(Object.keys(PREP_LABEL) as PrepFeel[]).map((p) => (
              <Choice key={p} label={PREP_LABEL[p]} onPress={() => void answerPrep(step.outcome, p)} />
            ))}
          </View>
        </>
      ) : null}
      {step.kind === 'suggest' ? (
        <>
          <Text style={styles.body}>
            {step.reason} Change your default to {step.minutes} minutes?
          </Text>
          <View>
            <Choice label="Yes, change it" onPress={() => void acceptSuggestion(step.minutes)} />
            <Choice label="No, keep it" onPress={() => setStep({ kind: 'done' })} />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** One answer, as a line with a hairline under it. */
function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale style={styles.choice} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.choiceText}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.ink },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '500', letterSpacing: -0.3 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: 1, borderTopColor: '#CFCFC9' },
  choiceText: { flex: 1, color: colors.ink, fontSize: 17 },
  chevron: { color: '#8A8A84', fontSize: 22 },
});
