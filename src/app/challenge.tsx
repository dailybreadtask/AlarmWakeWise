import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PressScale } from '../components/PressScale';
import { challengeStep, startChallenge, SUMS_TO_SOLVE, type ChallengeEvent, type ChallengeState } from '../challenge/challengeFlow';
import { GRID, makePattern, PATTERN_LEVELS } from '../challenge/pattern';
import { makeSum, type ChallengeLevel } from '../challenge/sums';
import { loadPreferences, type ChallengeType } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { space } from '../theme/tokens';

// The ringing screens are dark, as in the approved design: charcoal ground, paper text, one yellow accent.
const GROUND = '#202020';
const PAPER = '#F5F5F2';
const DIM = '#BDBDB6';
const EDGE = '#4A4A46';
const YELLOW = '#F5E74B';
const HOLD_MS = 3000;

/**
 * The alarm was stopped. A short task, set in Wake mode, finishes waking up, and there is always a way out without it.
 * It reads the chosen challenge and difficulty first, then shows maths or a pattern.
 */
export default function ChallengeScreen() {
  const db = useSQLiteContext();
  const [choice, setChoice] = useState<{ type: ChallengeType; level: ChallengeLevel } | null>(null);

  useEffect(() => {
    let active = true;
    void loadPreferences(sqlFrom(db)).then((p) => {
      if (active) setChoice({ type: p.challengeType, level: p.challengeLevel });
    });
    return () => {
      active = false;
    };
  }, [db]);

  if (!choice) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      </View>
    );
  }
  return choice.type === 'pattern' ? <PatternChallenge level={choice.level} /> : <MathsChallenge level={choice.level} />;
}

/** The dark page both challenges sit on: a header, the task, and the way out at the bottom. */
function Frame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTitle}>Alarm stopped</Text>
        <Text style={styles.headerDate}>{dateLine}</Text>
      </View>
      {children}
    </View>
  );
}

/** The way out: hold for three seconds, with the fill showing the time passing, or the plain accessible link. */
function WayOut({ onLeave }: { onLeave: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // How far the three-second hold has got, from 0 to 1.
  const hold = useSharedValue(0);
  const holdFill = useAnimatedStyle(() => ({ width: `${hold.get() * 100}%` }));
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
      <Pressable
        style={styles.hold}
        onPressIn={() => {
          hold.set(0);
          // The fill shows the three seconds passing. With reduced motion it stays still and the hold alone counts.
          if (!reduced) hold.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear }));
        }}
        onPressOut={() => {
          cancelAnimation(hold);
          hold.set(withTiming(0, { duration: 150 }));
        }}
        onLongPress={onLeave}
        delayLongPress={HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel="Can’t do this? Hold for three seconds to finish"
        accessibilityHint="Hold for three seconds to finish without the task"
      >
        <Animated.View style={[styles.holdFill, holdFill]} />
        <Text style={styles.holdText}>Can’t do this? Hold for 3 seconds to finish</Text>
      </Pressable>
      <Pressable onPress={onLeave} accessibilityRole="button" style={styles.link}>
        <Text style={styles.linkText}>Finish without the task (accessible option)</Text>
      </Pressable>
    </View>
  );
}

/** The screen after the task is done. */
function Done({ summary }: { summary: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Frame>
      <View style={styles.doneBody}>
        <View style={styles.check} accessibilityElementsHidden>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={GROUND} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        </View>
        <Text style={styles.doneTitle}>Alarm off.{'\n'}Good morning.</Text>
        <Text style={styles.doneSub}>{summary} Your briefing is ready.</Text>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PressScale style={styles.primary} onPress={() => router.replace('/briefing')} accessibilityRole="button" accessibilityLabel="Start my morning">
          <Text style={styles.primaryText}>Start my morning</Text>
        </PressScale>
      </View>
    </Frame>
  );
}

const newSums = (level: ChallengeLevel) => Array.from({ length: SUMS_TO_SOLVE }, () => makeSum(Math.random, level));

function MathsChallenge({ level }: { level: ChallengeLevel }) {
  const [sums] = useState(() => newSums(level));
  const [state, dispatch] = useReducer((s: ChallengeState, e: ChallengeEvent) => challengeStep(s, e), sums, startChallenge);
  const [message, setMessage] = useState<string | null>(null);

  function answer(choice: number) {
    const sum = state.sums[state.current];
    if (choice === sum.answer) {
      setMessage(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setMessage('Not quite. Try another.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    dispatch({ type: 'answer', choice });
  }

  function leave() {
    dispatch({ type: 'leaveWithoutSums' });
    router.replace('/');
  }

  if (state.finishedBy === 'sums') {
    return <Done summary={`You solved ${SUMS_TO_SOLVE} sums${state.wrongAttempts > 0 ? ` with ${state.wrongAttempts} wrong ${state.wrongAttempts === 1 ? 'try' : 'tries'}` : ''}.`} />;
  }

  const sum = state.sums[state.current];
  return (
    <Frame>
      <View style={styles.body}>
        <Text style={styles.step}>
          Solve to finish, {state.current + 1} of {SUMS_TO_SOLVE}
        </Text>
        <Text style={styles.question} accessibilityLabel={`What is ${sum.question}?`} accessibilityLiveRegion="polite">
          {sum.question}
        </Text>
        <Text style={styles.feedback} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {message ?? ' '}
        </Text>

        <View style={styles.choices}>
          {sum.choices.map((choice) => (
            <PressScale key={choice} style={styles.choice} onPress={() => answer(choice)} accessibilityRole="button" accessibilityLabel={`${choice}`}>
              <Text style={styles.choiceText}>{choice}</Text>
            </PressScale>
          ))}
        </View>
      </View>
      <WayOut onLeave={leave} />
    </Frame>
  );
}

/**
 * Trace the lit points in order. Easy leaves them on screen, numbered. Medium and hard show them once, then hide them.
 * After a mistake, medium shows the same points again; hard makes a new pattern, so there is no replay.
 */
function PatternChallenge({ level }: { level: ChallengeLevel }) {
  const config = PATTERN_LEVELS[level];
  const { width } = useWindowDimensions();
  const [pattern, setPattern] = useState(() => makePattern(Math.random, level));
  const [showing, setShowing] = useState(true);
  const [done, setDone] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const side = Math.min(width - 56, 312);
  const cell = side / GRID;

  // Hides the points after a moment, unless this level keeps them on screen.
  useEffect(() => {
    if (config.showMs === null || !showing) return;
    const id = setTimeout(() => setShowing(false), config.showMs);
    return () => clearTimeout(id);
  }, [showing, pattern, config.showMs]);

  function tap(index: number) {
    if (showing && config.showMs !== null) return;
    if (index === pattern[done]) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMessage(null);
      if (done + 1 === pattern.length) setFinished(true);
      else setDone(done + 1);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMistakes((m) => m + 1);
    setDone(0);
    if (level === 2) {
      setMessage('Not quite. Here is a new pattern.');
      setPattern(makePattern(Math.random, level));
      setShowing(true);
    } else if (level === 1) {
      setMessage('Not quite. Look once more.');
      setShowing(true);
    } else {
      setMessage('Not quite. Start again from point 1.');
    }
  }

  if (finished) return <Done summary={`You traced the pattern${mistakes > 0 ? ` with ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}` : ''}.`} />;

  const visible = showing || config.showMs === null;
  return (
    <Frame>
      <View style={styles.body}>
        <Text style={styles.step}>{visible && config.showMs !== null ? 'Remember the points, in order' : `Trace the points in order, ${done} of ${pattern.length}`}</Text>
        <Text style={styles.patternTitle}>{config.hint}</Text>
        <Text style={styles.feedback} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {message ?? ' '}
        </Text>

        <View style={[styles.grid, { width: side, height: side }]}>
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const order = pattern.indexOf(i);
            const lit = visible && order >= 0;
            const traced = order >= 0 && order < done;
            return (
              <Pressable key={i} onPress={() => tap(i)} accessibilityRole="button" accessibilityLabel={`Row ${Math.floor(i / GRID) + 1}, column ${(i % GRID) + 1}${lit ? `, point ${order + 1}` : ''}`} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
                <View style={[styles.pip, lit && styles.pipLit, traced && styles.pipTraced]}>{lit ? <Text style={styles.pipNumber}>{order + 1}</Text> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <WayOut onLeave={() => router.replace('/')} />
    </Frame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GROUND },
  header: { paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headerTitle: { color: PAPER, fontSize: 17, fontWeight: '500' },
  headerDate: { color: DIM, fontSize: 15 },
  body: { flex: 1, paddingHorizontal: 28 },
  step: { color: DIM, fontSize: 15, marginTop: 40 },
  question: { color: PAPER, fontSize: 104, fontWeight: '100', letterSpacing: -6, lineHeight: 116, marginTop: 8, fontVariant: ['tabular-nums'] },
  patternTitle: { color: PAPER, fontSize: 44, fontWeight: '100', letterSpacing: -2, lineHeight: 50, marginTop: 8 },
  feedback: { color: YELLOW, fontSize: 16, minHeight: 22, marginTop: 6 },
  choices: { marginTop: 'auto', marginBottom: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { width: '48.5%', height: 76, borderRadius: 24, borderWidth: 1, borderColor: EDGE, backgroundColor: '#2A2A28', alignItems: 'center', justifyContent: 'center' },
  choiceText: { color: PAPER, fontSize: 34, fontWeight: '200', fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', marginTop: 'auto', marginBottom: 18 },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5A5A55', alignItems: 'center', justifyContent: 'center' },
  pipLit: { width: 26, height: 26, borderRadius: 13, backgroundColor: YELLOW },
  pipTraced: { width: 26, height: 26, borderRadius: 13, backgroundColor: YELLOW, borderWidth: 2, borderColor: PAPER },
  pipNumber: { color: GROUND, fontSize: 13, fontWeight: '600' },
  footer: { paddingHorizontal: 24, gap: space.xs },
  hold: { minHeight: 52, borderRadius: 26, borderWidth: 1, borderStyle: 'dashed', borderColor: '#6B6B66', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(245,231,75,0.22)' },
  holdText: { color: DIM, fontSize: 15 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: DIM, fontSize: 14, textDecorationLine: 'underline' },
  doneBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: PAPER, fontSize: 44, fontWeight: '200', letterSpacing: -1.3, lineHeight: 46, marginTop: 12 },
  doneSub: { color: DIM, fontSize: 17, lineHeight: 25 },
  primary: { minHeight: 64, borderRadius: 32, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: GROUND, fontSize: 19, fontWeight: '600' },
});
