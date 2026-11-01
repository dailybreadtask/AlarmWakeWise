import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlanView, type Assumptions } from '../components/PlanView';
import { QuickAlarm } from '../components/QuickAlarm';
import { speechConfig } from '../config';
import { planFromInterpretation } from '../domain/planFromInterpretation';
import type { Interpretation } from '../domain/interpretation';
import { savePlan, saveTimeline } from '../plans/planRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';
import { fetchEstimate, type EstimateResult } from './estimateClient';
import { minutesFromEstimate, type EstimateNeed } from './estimateMode';

const MODE_WORD: Record<EstimateNeed['mode'], string> = { bus: 'bus', car: 'drive', walk: 'walk', cycle: 'bike ride', taxi: 'taxi ride', other: 'journey' };

interface Props {
  need: EstimateNeed;
  interpretation: Interpretation;
  goal: string;
  deadlineAt: Date;
  timezone: string;
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
}

/** A plan built on a typical journey time. Clearly an estimate, with its sources. */
export function EstimatedPlan({ need, interpretation, goal, deadlineAt, timezone, assumptions, onChange }: Props) {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [result, setResult] = useState<EstimateResult | null>(null);

  useEffect(() => {
    let active = true;
    void fetchEstimate(need, null, { baseUrl: speechConfig.baseUrl, token: speechConfig.token }).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [need]);

  if (!result) return <Text style={styles.body}>Checking a typical journey time…</Text>;
  if (!result.ok) {
    const message: Record<string, string> = {
      no_driving_provider: 'Driving times are not connected on this build yet.',
      unknown_place: 'I could not find one of those places. Please give a fuller name.',
      unavailable: 'I could not check a typical journey time right now. Please try again.',
      timeout: 'The journey check took too long. Please try again.',
      invalid: 'I could not make sense of the journey time. Please try again.',
    };
    return (
      <View style={styles.block}>
        <Text style={styles.title}>No journey time yet</Text>
        <Text style={styles.body}>{message[result.error]}</Text>
      </View>
    );
  }

  const minutes = minutesFromEstimate(result.minutesLow, result.minutesHigh);
  const outcome = planFromInterpretation(interpretation, {
    timezone,
    now: new Date(),
    earliestWakeAt: null,
    getReadyMinutes: assumptions.getReadyMinutes,
    bufferMinutes: assumptions.bufferMinutes,
    journeyMinutes: minutes,
  });
  if (!outcome.ok) return <Text style={styles.body}>{outcome.questions[0]?.question}</Text>;
  if (!outcome.outcome.ok) return <Text style={styles.body}>I could not make a plan from this time. Please check the times.</Text>;
  const planned = outcome.outcome;

  return (
    <View style={styles.wrap}>
      <Text style={styles.body}>
        A {MODE_WORD[need.mode]} from {need.from} to {need.to} usually takes about {result.minutesLow} to {result.minutesHigh} minutes. I have planned for {minutes}, so you have some margin.
      </Text>
      <Text style={styles.caption}>This is a typical estimate, not live times. {result.note}</Text>
      <PlanView outcome={planned} timezone={timezone} assumptions={assumptions} onChange={onChange} />
      <QuickAlarm
        at={planned.wakeAt}
        timezone={timezone}
        caption="Approve the wake alarm"
        note="Only the wake alarm is set here."
        onSet={() => {
          const planId = randomUUID();
          void savePlan(sql, { id: planId, goal, eventAt: deadlineAt.toISOString(), wakeAt: planned.wakeAt.toISOString(), getReadyMinutes: assumptions.getReadyMinutes, createdAt: new Date().toISOString() }).then(() => saveTimeline(sql, planId, planned.timeline));
        }}
      />
      <Text style={styles.caption}>Sources: {result.sources.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  block: { gap: space.sm, paddingVertical: space.sm },
  title: { color: colors.ink, fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
