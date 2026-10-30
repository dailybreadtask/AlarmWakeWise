import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from './PressScale';

import type { PlanOutcome, TimelineEntry } from '../domain/planner';
import { colors, radius, space, type } from '../theme/tokens';

const clock = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(at);
const dayLine = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(at);

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

/** A plan that is shown, not scheduled. Estimated values can be changed here. */
export function PlanView({ outcome, timezone, assumptions, onChange, onStartTimer }: Props) {
  const reduced = useReducedMotion();
  const step = (key: keyof Assumptions, delta: number) => {
    // One tick per change, on the change itself.
    void Haptics.selectionAsync();
    onChange({ ...assumptions, [key]: Math.max(0, assumptions[key] + delta) });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>Not scheduled</Text>
      </View>
      <Text style={styles.caption}>Wake {dayLine(outcome.wakeAt, timezone)} at</Text>
      <Text style={styles.display} accessibilityLabel={`Wake at ${clock(outcome.wakeAt, timezone)}`}>
        {clock(outcome.wakeAt, timezone)}
      </Text>

      <View style={styles.timeline}>
        {outcome.timeline.map((entry, i) => {
          const last = i === outcome.timeline.length - 1;
          const dot = entry.kind === 'wake' ? styles.dotSignal : last ? styles.dotSquare : styles.dot;
          // Rows arrive in order. With reduced motion they only fade in.
          const entering = reduced ? FadeIn.duration(200).delay(i * 40) : FadeInDown.duration(280).delay(i * 40);
          return (
            <Animated.View key={entry.id} entering={entering} style={styles.row}>
              <Text style={styles.time}>{clock(entry.startsAt, timezone)}</Text>
              <View style={styles.rail}>
                <View style={[styles.dotBase, dot]} />
                {!last ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.entry}>
                <Text style={styles.entryTitle}>{entry.label}</Text>
                {entry.source === 'estimated' ? <Text style={styles.caption}>Estimate, you can change it</Text> : null}
                {entry.source === 'user' && entry.kind !== 'arrive' ? <Text style={styles.caption}>{entry.minutes} min, from you</Text> : null}
                {entry.kind === 'arrive' ? <Text style={styles.caption}>{entry.minutes} min spare</Text> : null}
                {entry.kind === 'timer' ? <Text style={styles.caption}>{entry.minutes} min timer</Text> : null}
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
        <Text style={styles.stepValue}>{value} {unit}</Text>
        <PressScale onPress={onPlus} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
          <Text style={styles.stepText}>+</Text>
        </PressScale>
      </View>
    </View>
  );
}

const DOT = 12;

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  badgeRow: { flexDirection: 'row' },
  badge: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.muted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, color: colors.muted, ...type.caption },
  caption: { color: colors.muted, ...type.caption },
  display: { color: colors.ink, ...type.display, },
  timeline: { marginTop: space.md },
  row: { flexDirection: 'row', minHeight: 56 },
  time: { width: 56, color: colors.ink, ...type.label, paddingTop: 2 },
  rail: { width: 28, alignItems: 'center' },
  dotBase: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.paper, zIndex: 1 },
  dot: {},
  dotSignal: { backgroundColor: colors.primary, borderColor: colors.ink },
  dotSquare: { backgroundColor: colors.ink, borderRadius: 2 },
  line: { position: 'absolute', top: DOT, bottom: -4, width: 1, backgroundColor: colors.line },
  entry: { flex: 1, paddingLeft: space.sm, paddingBottom: space.md },
  entryTitle: { color: colors.ink, ...type.body, fontWeight: '600' },
  sectionTitle: { color: colors.ink, ...type.title, marginTop: space.lg },
  stepper: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  label: { color: colors.ink, ...type.label },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.ink, fontSize: 18 },
  stepValue: { color: colors.ink, ...type.label, minWidth: 64, textAlign: 'center' },
  timerButton: { alignSelf: 'flex-start', marginTop: space.xs, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: colors.card },
});
