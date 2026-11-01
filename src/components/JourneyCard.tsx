import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { alarmBridge } from '../alarm/nativeBridge';
import { speechConfig } from '../config';
import { loadJourney, listPlans, saveJourney, type SavedJourneyRecord } from '../plans/planRepository';
import { assessJourney, type JourneyAssessment, type WakeAlternative } from '../journey/journeyCheck';
import { journeyText, proposalText } from '../journey/journeyText';
import { moveWakeAlarm } from '../journey/moveWakeAlarm';
import { fetchRailBoard, type RailBoardResult } from '../rail/railClient';
import { markAlarmCancelled, saveAlarm } from '../storage/alarmRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';
import { PressScale } from './PressScale';

interface Loaded {
  journey: SavedJourneyRecord;
  assessment: JourneyAssessment;
  checkedAt: string | null;
  error: string | null;
}

/** The latest train journey, checked against the live board. Changes need the person's approval. */
export function JourneyCard() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const plans = await listPlans(sql);
      let journey: SavedJourneyRecord | null = null;
      for (const p of plans) {
        journey = await loadJourney(sql, p.id);
        if (journey) break;
      }
      if (!journey) return active && setLoaded(null);
      const board: RailBoardResult = await fetchRailBoard(journey.fromCrs, journey.toCrs, { baseUrl: speechConfig.baseUrl, token: speechConfig.token });
      if (!active) return;
      if (!board.ok) {
        return setLoaded({ journey, assessment: { status: 'not_on_board', expectedDepartAt: null, alternatives: [], proposal: null }, checkedAt: null, error: 'The live timetable could not be checked right now.' });
      }
      const assessment = assessJourney(journey, board.departures, new Date());
      setLoaded({ journey, assessment, checkedAt: board.feedLastMessageAt, error: null });
    })();
    return () => {
      active = false;
    };
  }, [sql, reload]);

  if (!loaded) return null;
  const { journey, assessment, checkedAt, error } = loaded;
  const text = journeyText(assessment, journey, checkedAt);
  const proposal: WakeAlternative | null = assessment.proposal;
  // On time is mint, a delay that still works is yellow, and a risk or a cancellation is coral.
  const tone = assessment.status === 'on_time' ? colors.mint : assessment.status === 'delayed_still_ok' ? colors.primary : assessment.status === 'not_on_board' ? colors.dim : colors.coral;

  async function approve(p: WakeAlternative) {
    const newNativeId = randomUUID();
    const title = 'WakeWise alarm';
    const result = await moveWakeAlarm({ bridge: alarmBridge, oldNativeId: journey.wakeNativeId, newNativeId, wakeAt: p.wakeAt, title });
    if (!result.ok) {
      setMessage('I could not move your alarm, so it stays where it is.');
      return;
    }
    const now = new Date().toISOString();
    await saveAlarm(sql, { id: randomUUID(), nativeId: newNativeId, wakeAt: p.wakeAt.toISOString(), title, source: 'plan', createdAt: now });
    if (result.cancelledOld) await markAlarmCancelled(sql, journey.wakeNativeId, now);
    await saveJourney(sql, { ...journey, trainId: p.trainId, departsAt: p.departsAt, arrivesAt: p.arrivesAt, wakeAt: p.wakeAt, wakeNativeId: newNativeId });
    setMessage(result.cancelledOld ? 'Your alarm has moved.' : 'Your new alarm is set. The old one could not be cancelled, so check your alarms.');
    setReload((n) => n + 1);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.statusDot, { backgroundColor: tone, shadowColor: tone }]} />
        <Text style={styles.eyebrow}>Your journey</Text>
      </View>
      <Text style={styles.headline}>{text.headline}</Text>
      <Text style={styles.body}>{error ?? text.detail}</Text>
      {proposal ? (
        <>
          <Text style={styles.body}>{proposalText(proposal, journey.timezone)}</Text>
          <View style={styles.row}>
            <PressScale style={styles.primary} onPress={() => void approve(proposal)} accessibilityRole="button" accessibilityLabel={`Move my alarm to ${proposal.wakeAt.toISOString()}`}>
              <Text style={styles.primaryText}>Move my alarm</Text>
            </PressScale>
            <PressScale style={styles.secondary} onPress={() => setMessage('Your alarm stays where it is.')} accessibilityRole="button">
              <Text style={styles.secondaryText}>Keep it</Text>
            </PressScale>
          </View>
        </>
      ) : null}
      {message ? (
        <Text style={styles.body} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.ink },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  headline: { color: colors.ink, fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10, marginTop: space.xs },
  primary: { flex: 1.4, minHeight: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ring },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  secondary: { flex: 1, minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.ink, fontSize: 16 },
});
