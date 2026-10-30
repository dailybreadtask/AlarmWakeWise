import { Stack } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import { alarmBridge } from '../alarm/nativeBridge';
import { ensureAuthorized, scheduleAlarm, type AuthState } from '../alarm/alarmScheduler';
import { colors, radius, space, type } from '../theme/tokens';

const TEST_DELAY_MS = 2 * 60 * 1000;

/** Development only. Schedules one real alarm two minutes ahead, to prove the OS rings it. */
export default function AlarmTestScreen() {
  const [auth, setAuth] = useState<AuthState>('notDetermined');
  const [status, setStatus] = useState<string>('Not scheduled yet.');
  const [testId, setTestId] = useState<string | null>(null);
  const [held, setHeld] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const alarms = await alarmBridge.scheduled();
    setAuth(alarmBridge.getAuthorization());
    setHeld(alarms.map((a) => `${a.id.slice(0, 8)}… ${a.state}`));
  }, []);

  useEffect(() => {
    let active = true;
    void alarmBridge.scheduled().then((alarms) => {
      if (!active) return;
      setAuth(alarmBridge.getAuthorization());
      setHeld(alarms.map((a) => `${a.id.slice(0, 8)}… ${a.state}`));
    });
    return () => {
      active = false;
    };
  }, []);

  async function allow() {
    setAuth(await ensureAuthorized(alarmBridge));
    void refresh();
  }

  async function scheduleTest() {
    const id = randomUUID();
    const wakeAt = new Date(Date.now() + TEST_DELAY_MS);
    const result = await scheduleAlarm(alarmBridge, { nativeId: id, wakeAt, title: 'WakeWise test' });
    if (result.ok) {
      setTestId(id);
      setStatus(`OS accepted the alarm for ${wakeAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Lock the phone and wait.`);
    } else {
      setStatus(`Not scheduled: ${result.error}.`);
    }
    void refresh();
  }

  async function cancelTest() {
    if (testId) await alarmBridge.cancel(testId);
    setTestId(null);
    setStatus('Test alarm cancelled.');
    void refresh();
  }

  if (!__DEV__) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Alarm test' }} />
      <Text style={styles.body}>Development only. Use it to check that iOS rings an alarm with the app closed and the phone locked.</Text>
      <Text style={styles.label}>Permission: {auth}</Text>

      <PressScale style={styles.button} onPress={allow} accessibilityRole="button">
        <Text style={styles.buttonText}>Allow alarms</Text>
      </PressScale>
      <PressScale style={styles.button} onPress={scheduleTest} accessibilityRole="button">
        <Text style={styles.buttonText}>Schedule test alarm in 2 minutes</Text>
      </PressScale>
      {testId ? (
        <PressScale style={styles.secondary} onPress={cancelTest} accessibilityRole="button">
          <Text style={styles.label}>Cancel test alarm</Text>
        </PressScale>
      ) : null}

      <Text style={styles.body}>{status}</Text>
      <View style={styles.list}>
        <Text style={styles.label}>Held by the OS</Text>
        {held.length === 0 ? <Text style={styles.body}>None.</Text> : held.map((h) => <Text key={h} style={styles.body}>{h}</Text>)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  label: { color: colors.ink, ...type.label },
  button: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  buttonText: { color: colors.ink, ...type.label },
  secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  list: { gap: space.xs, marginTop: space.lg },
});
