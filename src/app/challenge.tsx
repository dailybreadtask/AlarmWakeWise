import { Stack, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import { challengeStep, startChallenge, SUMS_TO_SOLVE, type ChallengeEvent, type ChallengeState } from '../challenge/challengeFlow';
import { makeSum } from '../challenge/sums';
import { colors, radius, space, type } from '../theme/tokens';

const newSums = () => Array.from({ length: SUMS_TO_SOLVE }, () => makeSum(Math.random));

/** The alarm was stopped. Three sums finish waking up, and there is always a way out without them. */
export default function ChallengeScreen() {
  const [sums] = useState(newSums);
  const [state, dispatch] = useReducer(
    (s: ChallengeState, e: ChallengeEvent) => challengeStep(s, e),
    sums,
    startChallenge,
  );
  const [message, setMessage] = useState<string | null>(null);

  function answer(choice: number) {
    const sum = state.sums[state.current];
    if (choice === sum.answer) {
      setMessage(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setMessage('Not quite. Try again.');
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
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Awake', headerBackVisible: false }} />
        <Text style={styles.display}>You’re up.</Text>
        <Text style={styles.body}>You solved {SUMS_TO_SOLVE} sums{state.wrongAttempts > 0 ? ` with ${state.wrongAttempts} wrong ${state.wrongAttempts === 1 ? 'try' : 'tries'}` : ''}.</Text>
        <PressScale style={styles.primary} onPress={() => router.replace('/briefing')} accessibilityRole="button">
          <Text style={styles.primaryText}>Done</Text>
        </PressScale>
      </View>
    );
  }

  const sum = state.sums[state.current];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Stopped', headerBackVisible: false }} />
      <Text style={styles.caption}>Alarm stopped. Sum {state.current + 1} of {SUMS_TO_SOLVE}</Text>
      <Text style={styles.question} accessibilityLabel={`What is ${sum.question}?`}>{sum.question} =</Text>
      <View style={styles.grid}>
        {sum.choices.map((choice) => (
          <PressScale key={choice} style={styles.choice} onPress={() => answer(choice)} accessibilityRole="button" accessibilityLabel={`${choice}`}>
            <Text style={styles.choiceText}>{choice}</Text>
          </PressScale>
        ))}
      </View>
      {message ? <Text style={styles.message} accessibilityRole="alert">{message}</Text> : null}

      <Pressable style={styles.escape} onLongPress={leave} delayLongPress={3000} accessibilityRole="button" accessibilityHint="Hold for three seconds to finish without sums">
        <Text style={styles.escapeText}>Can’t do this? Hold for 3 seconds to finish</Text>
      </Pressable>
      <Pressable onPress={leave} accessibilityRole="button">
        <Text style={styles.link}>Finish without sums (accessible option)</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, backgroundColor: colors.paper, flexGrow: 1 },
  caption: { color: colors.muted, ...type.caption },
  question: { color: colors.ink, fontSize: 56, fontWeight: '200', letterSpacing: -1, marginTop: space.md },
  display: { color: colors.ink, fontSize: 48, fontWeight: '200', letterSpacing: -1 },
  body: { color: colors.ink, ...type.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  choice: { width: '47%', backgroundColor: colors.card, borderRadius: radius.button, paddingVertical: space.lg, alignItems: 'center' },
  choiceText: { color: colors.ink, fontSize: 28, fontWeight: '300' },
  message: { color: colors.danger, ...type.label },
  escape: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.muted, borderRadius: radius.button, padding: space.md, alignItems: 'center', marginTop: space.xl },
  escapeText: { color: colors.ink, ...type.label },
  link: { color: colors.ink, textDecorationLine: 'underline', ...type.label, textAlign: 'center' },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', marginTop: space.lg },
  primaryText: { color: colors.onPrimary, ...type.label },
});
