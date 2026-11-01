import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { loadPreferences } from '../context/contextRepository';
import { StyleSheet, Text, View } from 'react-native';

import { alarmBridge } from '../alarm/nativeBridge';
import { saveAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { DEFAULT_WAKE_SOUND_ID, soundById } from '../sound/wakeSounds';
import { CollapsibleLine } from './CollapsibleLine';
import { SoundChoice } from './SoundChoice';
import { ensureAuthorized, scheduleAlarm } from '../alarm/alarmScheduler';
import { colors, glow, space } from '../theme/tokens';
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
  /** Shows only the approval button and its messages, for a screen's bottom bar. */
  footer?: boolean;
  /** A quieter action shown beside the approval button in footer mode, e.g. Change. */
  secondary?: ReactNode;
}

/** One alarm and one confirmation. Nothing is scheduled until the person approves. */
export function QuickAlarm({ at, timezone, caption = 'Alarm', note, onSet, footer, secondary }: Props) {
  // Created once, so a second tap cannot make a second alarm.
  const [nativeId] = useState(() => randomUUID());
  const [status, setStatus] = useState<Status>('ready');
  const db = useSQLiteContext();
  const [soundId, setSoundId] = useState(DEFAULT_WAKE_SOUND_ID);
  const [soundOpen, setSoundOpen] = useState(false);
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
  if (footer) {
    return (
      <View style={styles.footer}>
        {MESSAGES[status] ? <Text style={[styles.message, done ? styles.messageOk : status !== 'setting' && styles.messageBad]} accessibilityRole="alert">{MESSAGES[status]}</Text> : null}
        {note ? <Text style={styles.message}>{note}</Text> : null}
        <View style={styles.footerRow}>
          {secondary}
          <PressScale
            style={[styles.setButton, (done || status === 'setting') && styles.disabled]}
            onPress={approve}
            disabled={done || status === 'setting'}
            accessibilityRole="button"
            accessibilityLabel={`Set alarm for ${clock(at, timezone)}`}
          >
            <Text style={styles.setText}>{done ? 'Alarm set' : `Set for ${clock(at, timezone)}`}</Text>
          </PressScale>
        </View>
      </View>
    );
  }
  const soundName = soundById(soundId).name;
  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.display} accessibilityLabel={`Alarm at ${clock(at, timezone)}`}>
          {clock(at, timezone)}
        </Text>
      </View>
      {done ? null : (
        <CollapsibleLine title="Sound" value={soundName} open={soundOpen} onToggle={() => setSoundOpen((open) => !open)}>
          <SoundChoice selectedId={soundId} onSelect={(sound) => setSoundId(sound.id)} />
        </CollapsibleLine>
      )}
      <PressScale
        style={[styles.setButton, (done || status === 'setting') && styles.disabled]}
        onPress={approve}
        disabled={done || status === 'setting'}
        accessibilityRole="button"
        accessibilityLabel={`Set alarm for ${clock(at, timezone)}`}
      >
        <Text style={styles.setText}>{done ? 'Alarm set' : `Set alarm for ${clock(at, timezone)}`}</Text>
      </PressScale>
      {MESSAGES[status] ? <Text style={[styles.message, done ? styles.messageOk : status !== 'setting' && styles.messageBad]} accessibilityRole="alert">{MESSAGES[status]}</Text> : null}
      {note ? <Text style={styles.message}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  caption: { color: colors.quiet, fontSize: 17 },
  display: { color: colors.ink, fontSize: 112, fontWeight: '100', letterSpacing: -7.3, lineHeight: 120, marginLeft: -4, fontVariant: ['tabular-nums'], ...glow },
  disabled: { opacity: 0.5 },
  message: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  messageOk: { color: colors.mint },
  messageBad: { color: colors.coral },
  footer: { gap: space.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  setButton: { flex: 1, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  setText: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
});
