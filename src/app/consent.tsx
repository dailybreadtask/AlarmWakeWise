import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ContextScope } from '../domain/context';
import { useConsent } from '../consent/ConsentProvider';
import { Intro, Page, SwitchLine } from '../components/Layout';
import { colors } from '../theme/tokens';

/** What WakeWise may send, and when. Everything is off until you turn it on, and each choice has its own switch. */
export default function ConsentScreen() {
  const { ready, hasConsent, setScope } = useConsent();
  const [error, setError] = useState<string | null>(null);

  async function toggle(scope: ContextScope, granted: boolean) {
    setError(null);
    const saved = await setScope(scope, granted);
    if (!saved) setError('Could not save your choice. Please try again.');
  }

  return (
    <Page title="Speech and privacy">
      <Intro>Nothing is sent until you turn it on. You can change any of this at any time.</Intro>

      <View style={styles.group}>
        <SwitchLine title="Let WakeWise read my requests" value={hasConsent('ai_reading')} disabled={!ready} onChange={(on) => void toggle('ai_reading', on)} />
        <Text style={styles.body}>
          To understand what you need, WakeWise sends the words you type or say, the current date and time, your timezone, and the names of your saved places (such as work) to OpenAI. We do not store the request on our server. We do not send your calendar, and your location is only sent for the weather, if you turn that on below. Turn this off and planning stays disabled until you turn it back on.
        </Text>
      </View>

      <View style={styles.group}>
        <SwitchLine title="Allow speech to text" value={hasConsent('speech')} disabled={!ready} onChange={(on) => void toggle('speech', on)} />
        <Text style={styles.body}>
          When this is on, a recording you make is sent to the WakeWise speech service, which passes it to OpenAI to turn into text. The recording is not stored on our server. You can always type instead.
        </Text>
      </View>

      <View style={styles.group}>
        <SwitchLine title="Use my home for the weather" value={hasConsent('location')} disabled={!ready} onChange={(on) => void toggle('location', on)} />
        <Text style={styles.body}>
          When this is on, WakeWise sends the location of your home place (or its town or city, if it has no location saved) to the WakeWise server, which asks Apple Weather for today’s forecast. We do not store it. This is the only time a place’s location leaves your phone. Weather is provided by Apple Weather.
        </Text>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20, paddingTop: 4 },
  error: { color: colors.danger, fontSize: 15 },
});
