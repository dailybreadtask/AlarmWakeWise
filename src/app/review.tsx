import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadPreferences } from '../context/contextRepository';
import { earliestWakeFor } from '../domain/time';
import { sqlFrom } from '../storage/sqlAdapter';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlanView, type Assumptions } from '../components/PlanView';
import { QuickAlarm } from '../components/QuickAlarm';
import { RemindersButton } from '../components/RemindersButton';
import { savePlan, saveTimeline } from '../plans/planRepository';
import { randomUUID } from 'expo-crypto';
import { expoReminderBridge } from '../reminders/expoReminders';
import { startTimer } from '../timers/timerService';
import { alarmBridge } from '../alarm/nativeBridge';
import { ClarifyQuestions } from '../components/ClarifyQuestions';
import { EstimatedPlan } from '../journey/EstimatedPlan';
import { journeyNeed } from '../journey/estimateMode';
import { RailPlan } from '../rail/RailPlan';
import { validateInterpretation, type Interpretation } from '../domain/interpretation';
import { planFromInterpretation } from '../domain/planFromInterpretation';
import { resolveDeadline } from '../domain/resolveDeadline';
import { colors, radius, space, type } from '../theme/tokens';

/** Tells the person when the app chose a.m. or p.m. for them, so they can change it. */
function AssumedTimeNote({ interpretation }: { interpretation: Interpretation }) {
  const assumed = interpretation.commitments.find((c) => c.deadline.timeAssumed && c.deadline.time);
  if (!assumed?.deadline.time) return null;
  const [hh, mm] = assumed.deadline.time.split(':').map(Number);
  const at = new Date(Date.UTC(2026, 0, 1, hh, mm));
  const part = hh < 12 ? 'morning' : 'evening';
  return (
    <Text style={styles.body}>
      I have assumed {part} at {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(at)}. Tell me if you meant the other part of the day.
    </Text>
  );
}

/** When the event is, for working out the day the wake limit applies to. Falls back to now. */
function eventInstant(interpretation: Interpretation, timezone: string, now: Date): Date {
  const commitment = interpretation.commitments[0];
  const resolved = commitment ? resolveDeadline(commitment.deadline, timezone, now) : null;
  return resolved?.ok ? resolved.at : now;
}

function parseParam(data: string | string[] | undefined): Interpretation | null {
  if (typeof data !== 'string') return null;
  try {
    const checked = validateInterpretation(JSON.parse(data));
    return checked.ok ? checked.value : null;
  } catch {
    return null;
  }
}

export default function ReviewScreen() {
  const { data, text } = useLocalSearchParams<{ data?: string; text?: string }>();
  const interpretation = parseParam(data);
  const originalText = typeof text === 'string' ? text : interpretation?.goal ?? '';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const db = useSQLiteContext();
  const [assumptions, setAssumptions] = useState<Assumptions>({ getReadyMinutes: 30, bufferMinutes: 10 });
  const [earliestWake, setEarliestWake] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadPreferences(sqlFrom(db)).then((p) => {
      if (active) {
        setAssumptions({ getReadyMinutes: p.getReadyMinutes, bufferMinutes: p.bufferMinutes });
        setEarliestWake(p.earliestWake);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  if (!interpretation) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Review' }} />
        <Text style={styles.body}>This request could not be shown. Please try again.</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const now = new Date();
  if (interpretation.intentType === 'quick_alarm') {
    const commitment = interpretation.commitments[0];
    const resolved = commitment ? resolveDeadline(commitment.deadline, timezone, now) : null;
    const passed = resolved?.ok === true && resolved.at <= now;
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Stack.Screen options={{ title: 'Quick alarm' }} />
        <Text style={styles.quote}>“{interpretation.goal}”</Text>
        {resolved?.ok && !passed ? (
          <QuickAlarm at={resolved.at} timezone={timezone} />
        ) : (
          <View style={styles.block}>
            <Text style={styles.title}>{passed ? 'That time has already passed.' : 'What time should the alarm go off?'}</Text>
            {!passed ? <ClarifyQuestions questions={[resolved && !resolved.ok ? resolved.question : 'What time should the alarm go off?']} originalText={originalText} /> : null}
          </View>
        )}
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Edit my request</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const railRequest = interpretation.requests.find((r) => r.capability === 'rail');
  if (railRequest) {
    const commitment = interpretation.commitments[0];
    const resolved = commitment ? resolveDeadline(commitment.deadline, timezone, now) : null;
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Stack.Screen options={{ title: 'Proposed plan' }} />
        <Text style={styles.quote}>“{interpretation.goal}”</Text>
        <AssumedTimeNote interpretation={interpretation} />
        {resolved?.ok ? (
          <RailPlan
            originalText={originalText}
            goal={interpretation.goal}
            fromRaw={railRequest.params.from?.toString()}
            toRaw={railRequest.params.to?.toString()}
            deadlineAt={resolved.at}
            timezone={timezone}
            assumptions={assumptions}
            onChange={setAssumptions}
          />
        ) : (
          <View style={styles.block}>
            <Text style={styles.title}>I need a few details first</Text>
            <ClarifyQuestions questions={[resolved?.ok === false ? resolved.question : 'When do you need to be there?']} originalText={originalText} />
          </View>
        )}
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.secondaryText}>Edit</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // A bus, car or other journey: a typical time from the web or TomTom. A journey with no way of travelling: ask.
  const need = journeyNeed(interpretation);
  const commitmentForNeed = interpretation.commitments[0];
  const deadlineForNeed = commitmentForNeed ? resolveDeadline(commitmentForNeed.deadline, timezone, now) : null;
  if (need === 'needs_mode' || (need && deadlineForNeed && !deadlineForNeed.ok)) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Stack.Screen options={{ title: 'Proposed plan' }} />
        <Text style={styles.quote}>“{interpretation.goal}”</Text>
        <AssumedTimeNote interpretation={interpretation} />
        <View style={styles.block}>
          {need === 'needs_mode' ? (
            <ClarifyQuestions questions={['How will you travel: bus, train, car, or on foot?']} originalText={originalText} />
          ) : (
            <ClarifyQuestions questions={[deadlineForNeed && !deadlineForNeed.ok ? deadlineForNeed.question : 'When do you need to be there?']} originalText={originalText} />
          )}
        </View>
      </ScrollView>
    );
  }
  if (need && typeof need === 'object' && deadlineForNeed?.ok) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Stack.Screen options={{ title: 'Proposed plan' }} />
        <Text style={styles.quote}>“{interpretation.goal}”</Text>
        <AssumedTimeNote interpretation={interpretation} />
        <EstimatedPlan need={need} interpretation={interpretation} goal={interpretation.goal} deadlineAt={deadlineForNeed.at} timezone={timezone} assumptions={assumptions} onChange={setAssumptions} />
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.secondaryText}>Edit</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const planned = planFromInterpretation(interpretation, {
    timezone,
    now,
    earliestWakeAt: earliestWakeFor(eventInstant(interpretation, timezone, now), earliestWake, timezone),
    getReadyMinutes: assumptions.getReadyMinutes,
    bufferMinutes: assumptions.bufferMinutes,
  });

  const approvedWake = planned.ok && planned.outcome.ok ? planned.outcome.wakeAt : null;
  const approvedTimeline = planned.ok && planned.outcome.ok ? planned.outcome.timeline : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Proposed plan' }} />
      <Text style={styles.quote}>“{interpretation.goal}”</Text>
      <AssumedTimeNote interpretation={interpretation} />

      {planned.ok && planned.outcome.ok ? (
        <>
          <PlanView
            outcome={planned.outcome}
            timezone={timezone}
            assumptions={assumptions}
            onChange={setAssumptions}
            onStartTimer={(entry) => {
              void startTimer(expoReminderBridge, sqlFrom(db), { id: randomUUID(), label: entry.label, minutes: entry.minutes, now: new Date(), startAt: entry.startsAt, nativeId: randomUUID() }, alarmBridge).then((result) => {
                Alert.alert(result.ok ? 'Timer set' : 'Timer not set', result.ok ? `${entry.label} ends at ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(result.timer.endsAt))}.` : 'Check that notifications are on and the time is still ahead.');
              });
            }}
          />
          <QuickAlarm
            at={planned.outcome.wakeAt}
            timezone={timezone}
            caption="Approve the wake alarm"
            onSet={() => {
              if (!approvedWake || !approvedTimeline) return;
              const planId = randomUUID();
              void savePlan(sqlFrom(db), {
                id: planId,
                goal: interpretation.goal,
                eventAt: eventInstant(interpretation, timezone, now).toISOString(),
                wakeAt: approvedWake.toISOString(),
                getReadyMinutes: assumptions.getReadyMinutes,
                createdAt: new Date().toISOString(),
              }).then(() => saveTimeline(sqlFrom(db), planId, approvedTimeline));
            }}
            note="Only the wake alarm is set here. Use the reminders button for each step."
          />
          <RemindersButton timeline={planned.outcome.timeline} />
        </>
      ) : (
        <View style={styles.block}>
          <Text style={styles.title}>{planned.ok ? planReason(planned.outcome.ok ? '' : planned.outcome.reason) : 'I need a few details first'}</Text>
          {planned.ok ? null : <ClarifyQuestions questions={planned.questions.map((q) => q.question)} originalText={originalText} />}
        </View>
      )}
      {interpretation.questions.length > 0 && planned.ok ? <ClarifyQuestions questions={interpretation.questions.map((q) => q.question)} originalText={originalText} /> : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.secondaryText}>Edit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function planReason(reason: string): string {
  switch (reason) {
    case 'wake_in_past':
      return 'That time has already gone. Choose a later time.';
    case 'wake_before_limit':
      return 'This would wake you before your earliest wake time.';
    case 'longer_than_a_day':
      return 'This plan is longer than a day. Please check the times.';
    default:
      return 'I could not make a plan from this.';
  }
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  quote: { color: colors.ink, ...type.title, fontWeight: '400' },
  title: { color: colors.ink, ...type.title },
  body: { color: colors.ink, ...type.body },
  block: { gap: space.sm, paddingVertical: space.sm },
  link: { color: colors.ink, textDecorationLine: 'underline', ...type.label },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.md, paddingHorizontal: space.xl, alignItems: 'center' },
  secondaryText: { color: colors.ink, ...type.label },
});
