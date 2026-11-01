import { router } from 'expo-router';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listAlarms } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';

/** The bedside clock is its own tiny world: true black and one dim warm colour, whatever the app's appearance. */
const BLACK = '#000000';
const DIM = 'rgba(245,231,75,0.5)';
const DIMMER = 'rgba(245,231,75,0.28)';
/** How bright the screen is while this is open, from 0 to 1. Dim enough not to light the room. */
const BRIGHTNESS = 0.02;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Bedside mode: a very dim clock for glancing at in the dark. The screen stays on, its brightness goes right down,
 * and nothing on it is bright. It shows the time and your next alarm. Tap anywhere to leave, and the brightness comes back.
 * The clock drifts a few points each minute, so nothing sits on the same pixels all night.
 */
export default function BedsideScreen() {
  useKeepAwake('bedside');
  const db = useSQLiteContext();
  const [now, setNow] = useState(() => new Date());
  const [nextAt, setNextAt] = useState<Date | null>(null);

  // The screen goes dim while this is open, and returns to how it was when it closes.
  useEffect(() => {
    let previous: number | null = null;
    let active = true;
    void (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        if (active) await Brightness.setBrightnessAsync(BRIGHTNESS);
      } catch {
        // Without the brightness module the clock still works, only brighter.
      }
    })();
    return () => {
      active = false;
      if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    void listAlarms(sqlFrom(db))
      .then((all) => {
        const upcoming = all.filter((a) => a.status === 'scheduled' && new Date(a.wakeAt).getTime() > Date.now()).sort((a, b) => new Date(a.wakeAt).getTime() - new Date(b.wakeAt).getTime())[0];
        if (active) setNextAt(upcoming ? new Date(upcoming.wakeAt) : null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db]);

  const minutesToNext = nextAt ? Math.max(0, Math.round((nextAt.getTime() - now.getTime()) / 60000)) : 0;
  const drift = ((now.getMinutes() % 6) - 2.5) * 5;
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return (
    <Pressable style={styles.root} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={`Bedside clock, ${pad(now.getHours())}:${pad(now.getMinutes())}. Tap to leave.`}>
      <StatusBar hidden />
      <View style={[styles.content, { transform: [{ translateX: drift }, { translateY: -drift }] }]}>
        <Text style={styles.time}>
          {pad(now.getHours())}:{pad(now.getMinutes())}
        </Text>
        <Text style={styles.line}>{nextAt ? `Next alarm ${pad(nextAt.getHours())}:${pad(nextAt.getMinutes())}, in ${Math.floor(minutesToNext / 60)}h ${minutesToNext % 60}m` : 'No alarm set'}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <Text style={styles.hint}>Tap to leave</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLACK, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: 10 },
  time: { color: DIM, fontSize: 132, fontWeight: '100', letterSpacing: -6, fontVariant: ['tabular-nums'] },
  line: { color: DIM, fontSize: 18 },
  date: { color: DIMMER, fontSize: 15 },
  hint: { position: 'absolute', bottom: 48, color: DIMMER, fontSize: 13 },
});
