import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useReducer, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PressScale } from '../components/PressScale';
import { challengeStep, startChallenge, SUMS_TO_SOLVE, type ChallengeEvent, type ChallengeState } from '../challenge/challengeFlow';
import { makeSum } from '../challenge/sums';
import { space } from '../theme/tokens';

// The ringing screens are dark, as in the approved design: charcoal ground, paper text, one yellow accent.
const GROUND = '#202020';
const PAPER = '#F5F5F2';
const DIM = '#BDBDB6';
const EDGE = '#4A4A46';
const YELLOW = '#F5E74B';
const HOLD_MS = 3000;

const newSums = () => Array.from({ length: SUMS_TO_SOLVE }, () => makeSum(Math.random));

/** The alarm was stopped. Three sums finish waking up, and there is always a way out without them. */
export default function ChallengeScreen() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [sums] = useState(newSums);
  const [state, dispatch] = useReducer(
    (s: ChallengeState, e: ChallengeEvent) => challengeStep(s, e),
    sums,
    startChallenge,
  );
  const [message, setMessage] = useState<string | null>(null);
  // How far the three-second hold has got, from 0 to 1.
  const hold = useSharedValue(0);
  const holdFill = useAnimatedStyle(() => ({ width: `${hold.get() * 100}%` }));
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());

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
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <Text style={styles.headerTitle}>Alarm stopped</Text>
          <Text style={styles.headerDate}>{dateLine}</Text>
        </View>
        <View style={styles.doneBody}>
          <View style={styles.check} accessibilityElementsHidden>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={GROUND} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12.5l4.5 4.5L19 7.5" />
            </Svg>
          </View>
          <Text style={styles.doneTitle}>Alarm off.{'\n'}Good morning.</Text>
          <Text style={styles.doneSub}>
            You solved {SUMS_TO_SOLVE} sums{state.wrongAttempts > 0 ? ` with ${state.wrongAttempts} wrong ${state.wrongAttempts === 1 ? 'try' : 'tries'}` : ''}. Your briefing is ready.
          </Text>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <PressScale style={styles.primary} onPress={() => router.replace('/briefing')} accessibilityRole="button" accessibilityLabel="Start my morning">
            <Text style={styles.primaryText}>Start my morning</Text>
          </PressScale>
        </View>
      </View>
    );
  }

  const sum = state.sums[state.current];
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTitle}>Alarm stopped</Text>
        <Text style={styles.headerDate}>{dateLine}</Text>
      </View>

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
          onLongPress={leave}
          delayLongPress={HOLD_MS}
          accessibilityRole="button"
          accessibilityLabel="Can’t do this? Hold for three seconds to finish"
          accessibilityHint="Hold for three seconds to finish without sums"
        >
          <Animated.View style={[styles.holdFill, holdFill]} />
          <Text style={styles.holdText}>Can’t do this? Hold for 3 seconds to finish</Text>
        </Pressable>
        <Pressable onPress={leave} accessibilityRole="button" style={styles.link}>
          <Text style={styles.linkText}>Finish without sums (accessible option)</Text>
        </Pressable>
      </View>
    </View>
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
  feedback: { color: YELLOW, fontSize: 16, minHeight: 22, marginTop: 6 },
  choices: { marginTop: 'auto', marginBottom: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { width: '48.5%', height: 76, borderRadius: 24, borderWidth: 1, borderColor: EDGE, backgroundColor: '#2A2A28', alignItems: 'center', justifyContent: 'center' },
  choiceText: { color: PAPER, fontSize: 34, fontWeight: '200', fontVariant: ['tabular-nums'] },
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
