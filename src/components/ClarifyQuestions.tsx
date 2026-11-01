import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { speechConfig } from '../config';
import { useConsent } from '../consent/ConsentProvider';
import { withAnswers } from '../domain/answers';
import { parseRequest } from '../intent/parseClient';
import { colors, space } from '../theme/tokens';
import { Field, PrimaryButton } from './Layout';

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
      <Text style={styles.eyebrow}>I need to ask</Text>
      {questions.map((q, i) => (
        <Field
          key={i}
          label={q}
          value={answers[i]}
          onChangeText={(value) => setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)))}
          placeholder="Your answer"
          returnKeyType="done"
        />
      ))}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {!aiAllowed ? <Text style={styles.body}>Turn on “Let WakeWise read my requests” in Speech and privacy to update the plan.</Text> : null}
      <PrimaryButton label={sending ? 'Updating…' : 'Update the plan'} onPress={() => void send()} disabled={!complete || sending || !aiAllowed} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingVertical: space.sm },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 14 },
});
