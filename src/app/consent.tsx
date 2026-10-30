import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { ContextScope } from '../domain/context';
import { useConsent } from '../consent/ConsentProvider';
import { colors, space, type as typeScale } from '../theme/tokens';

export default function ConsentScreen() {
  const { ready, hasConsent, setScope } = useConsent();
  const [error, setError] = useState<string | null>(null);

  async function toggle(scope: ContextScope, granted: boolean) {
    setError(null);
    const saved = await setScope(scope, granted);
    if (!saved) setError('Could not save your choice. Please try again.');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Speech and privacy' }} />

      <View style={styles.row}>
        <Text style={styles.label}>Let WakeWise read my requests</Text>
        <Switch
          value={hasConsent('ai_reading')}
          disabled={!ready}
          onValueChange={(on) => toggle('ai_reading', on)}
          accessibilityLabel="Let WakeWise read my requests"
        />
      </View>
      <Text style={styles.body}>
        To understand what you need, WakeWise sends the words you type or say, the current date and time, your timezone, and the names of your saved places (such as work) to OpenAI. We do not store the request on our server. We do not send your location or calendar. Turn this off and Send stays disabled until you turn it back on.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Allow speech to text</Text>
        <Switch
          value={hasConsent('speech')}
          disabled={!ready}
          onValueChange={(on) => toggle('speech', on)}
          accessibilityLabel="Allow speech to text"
        />
      </View>
      <Text style={styles.body}>
        When this is on, a recording you make is sent to the WakeWise speech service, which passes it to OpenAI to turn into text. The recording is not stored on our server. You can always type instead.
      </Text>

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, backgroundColor: colors.paper, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.ink, ...typeScale.label, fontSize: 17 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  error: { fontSize: 15, color: colors.danger },
});
