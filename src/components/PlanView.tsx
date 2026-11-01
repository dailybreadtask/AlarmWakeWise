import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from './PressScale';

import type { PlanOutcome, TimelineEntry } from '../domain/planner';
import { colors, radius, space } from '../theme/tokens';

const clock = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(at);
const fullDay = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(at);

export interface Assumptions {
  getReadyMinutes: number;
  bufferMinutes: number;
}

interface Props {
  outcome: Extract<PlanOutcome, { ok: true }>;
  timezone: string;
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
  /** Starts a countdown for a timer step, at its planned time. */
  onStartTimer?: (entry: TimelineEntry) => void;
}

/** The plan, following the approved "The plan" screen: the wake time large, then the steps on a rail. Estimates can be changed here. */
export function PlanView({ outcome, timezone, assumptions, onChange, onStartTimer }: Props) {
  const reduced = useReducedMotion();
  const step = (key: keyof Assumptions, delta: number) => {
    // One tick per change, on the change itself.
    void Haptics.selectionAsync();
    onChange({ ...assumptions, [key]: Math.max(0, assumptions[key] + delta) });
  };
  const arrival = outcome.timeline.find((entry) => entry.kind === 'arrive');

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.date}>{fullDay(outcome.wakeAt, timezone)}</Text>
        {arrival ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {arrival.label} by {clock(arrival.startsAt, timezone)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.wakeBlock}>
        <Text style={styles.wakeCaption}>Wake gently at</Text>
        <Text style={styles.display} accessibilityLabel={`Wake at ${clock(outcome.wakeAt, timezone)}`}>
          {clock(outcome.wakeAt, timezone)}
        </Text>
      </View>

      <View style={styles.timeline}>
        <View style={styles.spine} />
        {outcome.timeline.map((entry, i) => {
          const dot = entry.kind === 'wake' ? styles.dotWake : entry.kind === 'arrive' ? styles.dotArrive : styles.dotStep;
          // Rows arrive in order. With reduced motion they only fade in.
          const entering = reduced ? FadeIn.duration(200).delay(i * 40) : FadeInDown.duration(280).delay(i * 40);
          return (
            <Animated.View key={entry.id} entering={entering} style={styles.row}>
              <Text style={styles.time}>{clock(entry.startsAt, timezone)}</Text>
              <View style={[styles.dot, dot]} />
              <View style={styles.entry}>
                <Text style={styles.entryTitle}>{entry.label}</Text>
                {entry.source === 'estimated' ? <Text style={styles.note}>Estimate, you can change it</Text> : null}
                {entry.source === 'user' && entry.kind !== 'arrive' ? <Text style={styles.note}>{entry.minutes} min, from you</Text> : null}
                {entry.kind === 'arrive' ? <Text style={styles.note}>{entry.minutes} min spare</Text> : null}
                {entry.kind === 'timer' ? <Text style={styles.note}>{entry.minutes} min timer</Text> : null}
                {entry.kind === 'timer' && onStartTimer ? (
                  <PressScale onPress={() => onStartTimer(entry)} style={styles.timerButton} accessibilityRole="button" accessibilityLabel={`Start the ${entry.label} timer`}>
                    <Text style={styles.stepText}>Start timer</Text>
                  </PressScale>
                ) : null}
              </View>
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Assumptions you can change</Text>
      <Stepper label="Time to get ready" value={assumptions.getReadyMinutes} unit="min" onMinus={() => step('getReadyMinutes', -5)} onPlus={() => step('getReadyMinutes', 5)} />
      <Stepper label="Spare time before" value={assumptions.bufferMinutes} unit="min" onMinus={() => step('bufferMinutes', -5)} onPlus={() => step('bufferMinutes', 5)} />
    </View>
  );
}

function Stepper({ label, value, unit, onMinus, onPlus }: { label: string; value: number; unit: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}, ${value} ${unit}`}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperControls}>
        <PressScale onPress={onMinus} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`Less ${label.toLowerCase()}`}>
          <Text style={styles.stepText}>−</Text>
        </PressScale>
        <Text style={styles.stepValue}>
          {value} {unit}
        </Text>
        <PressScale onPress={onPlus} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
          <Text style={styles.stepText}>+</Text>
        </PressScale>
      </View>
    </View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  date: { color: '#5E5E59', fontSize: 15, flexShrink: 1 },
  pill: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: colors.ink, justifyContent: 'center' },
  pillText: { color: colors.paper, fontSize: 14, fontWeight: '500' },
  wakeBlock: { gap: 0 },
  wakeCaption: { color: '#5E5E59', fontSize: 17 },
  display: { color: colors.ink, fontSize: 132, fontWeight: '100', letterSpacing: -8.6, lineHeight: 116, marginLeft: -5, fontVariant: ['tabular-nums'] },
  timeline: { position: 'relative', marginTop: space.sm },
  // The spine runs behind the dots, from the first row's dot to the last row's.
  spine: { position: 'absolute', left: 71, top: 14, bottom: 14, width: 1, backgroundColor: '#CFCFC9' },
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 56 },
  time: { width: 52, color: colors.ink, fontSize: 17, fontWeight: '300', fontVariant: ['tabular-nums'], paddingTop: 1 },
  dot: { width: DOT, height: DOT, marginLeft: 13, marginRight: 4, marginTop: 4 },
  dotStep: { width: 9, height: 9, borderRadius: 5, marginLeft: 15, marginRight: 6, marginTop: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.ink },
  dotWake: { borderRadius: DOT / 2, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.ink },
  dotArrive: { borderRadius: 3, backgroundColor: colors.ink },
  entry: { flex: 1, paddingLeft: space.sm, gap: 2, paddingBottom: space.md },
  entryTitle: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  note: { color: '#5E5E59', fontSize: 14, lineHeight: 19 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  stepper: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: '#ECECE7', paddingVertical: space.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  label: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#CFCFC9', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.ink, fontSize: 18 },
  stepValue: { color: colors.ink, fontSize: 14, fontWeight: '500', minWidth: 64, textAlign: 'center' },
  timerButton: { alignSelf: 'flex-start', marginTop: space.xs, borderWidth: 1, borderColor: '#CFCFC9', borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: colors.card },
});
