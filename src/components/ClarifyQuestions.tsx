import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { speechConfig } from '../config';
import { useConsent } from '../consent/ConsentProvider';
import { withAnswers } from '../domain/answers';
import { parseRequest } from '../intent/parseClient';
import { colors, radius, space, type } from '../theme/tokens';
import { PressScale } from './PressScale';

interface Props {
  questions: string[];
  /** The request as the person first wrote it. Answers are added to it. */
  originalText: string;
}

/**
 * The open questions, each with a field to answer. Answers go back with the
 * original request for a new reading, so the plan is built from the whole picture.
 */
export function ClarifyQuestions({ questions, originalText }: Props) {
  const { hasConsent } = useConsent();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiAllowed = hasConsent('ai_reading');
  const complete = answers.every((a) => a.trim() !== '');

  async function send() {
    if (!complete || sending || !aiAllowed) return;
    setSending(true);
    setError(null);
    const text = withAnswers(originalText, questions, answers);
    const outcome = await parseRequest(text, { baseUrl: speechConfig.baseUrl, token: speechConfig.token });
    setSending(false);
    if (outcome.ok) {
      router.replace({ pathname: '/review', params: { data: JSON.stringify(outcome.value), text } });
    } else {
      const reason: Record<string, string> = {
        unavailable: 'The assistant could not be reached.',
        timeout: 'The assistant took too long.',
        rejected: 'The assistant refused the request.',
        invalid: 'The assistant answered, but the answer did not pass the checks.',
      };
      setError(`I could not update the plan. ${reason[outcome.error] ?? ''}`.trim());
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>I need to ask</Text>
      {questions.map((q, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.body}>{q}</Text>
          <TextInput
            style={styles.input}
            value={answers[i]}
            onChangeText={(value) => setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)))}
            placeholder="Your answer"
            placeholderTextColor={colors.muted}
            accessibilityLabel={q}
            returnKeyType="done"
          />
        </View>
      ))}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {!aiAllowed ? <Text style={styles.body}>Turn on “Let WakeWise read my requests” in Speech and privacy to update the plan.</Text> : null}
      <PressScale
        style={[styles.send, (!complete || sending || !aiAllowed) && styles.disabled]}
        onPress={send}
        disabled={!complete || sending || !aiAllowed}
        accessibilityRole="button"
        accessibilityLabel="Update the plan with my answers"
      >
        <Text style={styles.sendText}>{sending ? 'Updating…' : 'Update the plan'}</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingVertical: space.sm },
  title: { color: colors.ink, ...type.title },
  item: { gap: space.xs },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  input: { backgroundColor: colors.card, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line, padding: space.md, color: colors.ink, ...type.body },
  error: { color: colors.danger, ...type.caption },
  send: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  sendText: { color: colors.onPrimary, ...type.label },
  disabled: { opacity: 0.5 },
});
