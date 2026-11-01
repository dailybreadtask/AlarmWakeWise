import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Intro, Page, PrimaryButton, SecondaryButton, SectionLabel } from '../components/Layout';
import { alarmBridge } from '../alarm/nativeBridge';
import { ensureAuthorized, scheduleAlarm, type AuthState } from '../alarm/alarmScheduler';
import { colors, space } from '../theme/tokens';

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
    <Page title="Alarm test">
      <Intro>Development only. Use it to check that iOS rings an alarm with the app closed and the phone locked.</Intro>
      <Text style={styles.label}>Permission: {auth}</Text>

      <PrimaryButton label="Allow alarms" onPress={() => void allow()} />
      <SecondaryButton label="Schedule test alarm in 2 minutes" onPress={() => void scheduleTest()} />
      {testId ? <SecondaryButton label="Cancel test alarm" onPress={() => void cancelTest()} /> : null}

      <Text style={styles.body}>{status}</Text>
      <View style={styles.list}>
        <SectionLabel>Held by the OS</SectionLabel>
        {held.length === 0 ? <Text style={styles.body}>None.</Text> : held.map((h) => <Text key={h} style={styles.body}>{h}</Text>)}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '500' },
  list: { gap: space.sm },
});
