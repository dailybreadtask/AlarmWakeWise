import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { loadPreferences } from '../context/contextRepository';
import { StyleSheet, Text, View } from 'react-native';

import { alarmBridge } from '../alarm/nativeBridge';
import { saveAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { DEFAULT_WAKE_SOUND_ID, soundById } from '../sound/wakeSounds';
import { SoundChoice } from './SoundChoice';
import { ensureAuthorized, scheduleAlarm } from '../alarm/alarmScheduler';
import { colors, radius, space, type } from '../theme/tokens';
import { PressScale } from './PressScale';

type Status = 'ready' | 'setting' | 'set' | 'set_default' | 'denied' | 'unsupported' | 'failed';

/** Snooze is offered as a button on the alarm; the countdown is the system's. */
const SNOOZE_MINUTES = 5;

const clock = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(at);

const MESSAGES: Record<Status, string> = {
  ready: '',
  setting: 'Setting your alarm…',
  set: 'Set. iOS holds this alarm, so it rings even if WakeWise is closed.',
  set_default: 'Set, but iOS used its standard tone. The chosen tone could not be played on this build.',
  denied: 'Alarms are off for WakeWise. Turn them on in Settings, then try again.',
  unsupported: 'Alarms need iOS 26.1 or later on a real iPhone.',
  failed: 'iOS did not accept the alarm. Please try again.',
};

interface Props {
  at: Date;
  timezone: string;
  /** Small label above the time, e.g. "Alarm" or "Wake alarm". */
  caption?: string;
  /** Shown under the button, for what this does not yet cover. */
  note?: string;
  /** Called once the alarm is set, e.g. to save the plan it belongs to. */
  onSet?: (nativeId: string) => void;
}

/** One alarm and one confirmation. Nothing is scheduled until the person approves. */
export function QuickAlarm({ at, timezone, caption = 'Alarm', note, onSet }: Props) {
  // Created once, so a second tap cannot make a second alarm.
  const [nativeId] = useState(() => randomUUID());
  const [status, setStatus] = useState<Status>('ready');
  const db = useSQLiteContext();
  const [soundId, setSoundId] = useState(DEFAULT_WAKE_SOUND_ID);
  useEffect(() => {
    let active = true;
    void loadPreferences(sqlFrom(db)).then((p) => {
      if (active) setSoundId(p.soundId);
    });
    return () => {
      active = false;
    };
  }, [db]);

  async function approve() {
    setStatus('setting');
    const authorization = await ensureAuthorized(alarmBridge);
    if (authorization === 'unsupported') return finish('unsupported');
    if (authorization !== 'authorized') return finish('denied');
    const result = await scheduleAlarm(alarmBridge, { nativeId, wakeAt: at, title: 'WakeWise alarm', soundFile: soundById(soundId).alarmFile, snoozeMinutes: SNOOZE_MINUTES });
    if (result.ok) {
      // Keep a record of what was set. A failure to save does not undo the alarm, so it is not shown as a failure.
      onSet?.(nativeId);
      void saveAlarm(sqlFrom(db), { id: randomUUID(), nativeId, wakeAt: at.toISOString(), title: 'WakeWise alarm', source: caption === 'Alarm' ? 'quick' : 'plan', createdAt: new Date().toISOString() }).catch(() => undefined);
      return finish(result.usedSound === 'bundled' ? 'set' : 'set_default');
    }
    finish(result.error === 'not_authorized' ? 'denied' : result.error === 'unsupported' ? 'unsupported' : 'failed');
  }

  function finish(next: Status) {
    setStatus(next);
    const ok = next === 'set' || next === 'set_default';
    void Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  }

  const done = status === 'set' || status === 'set_default';
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>{caption}</Text>
      <Text style={styles.display} accessibilityLabel={`Alarm at ${clock(at, timezone)}`}>
        {clock(at, timezone)}
      </Text>
      {done ? null : <SoundChoice selectedId={soundId} onSelect={(sound) => setSoundId(sound.id)} />}
      <PressScale
        style={[styles.primary, (done || status === 'setting') && styles.disabled]}
        onPress={approve}
        disabled={done || status === 'setting'}
        accessibilityRole="button"
        accessibilityLabel={`Set alarm for ${clock(at, timezone)}`}
      >
        <Text style={styles.primaryText}>{done ? 'Alarm set' : `Set alarm for ${clock(at, timezone)}`}</Text>
      </PressScale>
      {MESSAGES[status] ? <Text style={styles.message} accessibilityRole="alert">{MESSAGES[status]}</Text> : null}
      {note ? <Text style={styles.message}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  caption: { color: colors.muted, ...type.caption },
  display: { color: colors.ink, ...type.display },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', marginTop: space.md },
  primaryText: { color: colors.onPrimary, ...type.label },
  disabled: { opacity: 0.5 },
  message: { color: colors.ink, ...type.caption, lineHeight: 19 },
});
