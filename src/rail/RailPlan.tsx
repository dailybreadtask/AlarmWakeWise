import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ClarifyQuestions } from '../components/ClarifyQuestions';
import { QuickAlarm } from '../components/QuickAlarm';
import { PlanView, type Assumptions } from '../components/PlanView';
import { planBackwards, type PlanOutcome } from '../domain/planner';
import { chooseTrain } from '../domain/railJourney';
import { randomUUID } from 'expo-crypto';
import { earliestWakeFor } from '../domain/time';
import { loadPreferences } from '../context/contextRepository';
import { saveJourney, savePlan, saveTimeline } from '../plans/planRepository';
import { speechConfig } from '../config';
import { useSQLiteContext } from 'expo-sqlite';
import { listPlaces, type SavedPlace } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space, type } from '../theme/tokens';
import { fetchRailBoard, searchRailStations, type RailBoardResult, type StationMatch } from './railClient';

/** Walk to the station. An estimate, labelled on screen. */
export const WALK_MINUTES = 10;
const BUFFER_MINUTES = 10;

const isCode = (raw: string): boolean => /^[A-Z]{3}$/.test(raw.trim().toUpperCase());

type Resolved = { status: 'ready'; crs: string } | { status: 'ask'; text: string; options: StationMatch[] } | { status: 'missing' };

/** A station code is used as it is. A name is used only when exactly one station matches it. */
async function resolveStation(raw: string | undefined, saved: SavedPlace[]): Promise<Resolved> {
  const text = (raw ?? '').trim();
  if (!text) return { status: 'missing' };
  if (isCode(text)) return { status: 'ready', crs: text.toUpperCase() };
  // A station the person saved by name, such as "Home station", needs no search.
  const mine = saved.find((p) => p.kind === 'station' && p.crs && p.label.toLowerCase() === text.toLowerCase());
  if (mine?.crs) return { status: 'ready', crs: mine.crs };
  const matches = await searchRailStations(text, { baseUrl: speechConfig.baseUrl, token: speechConfig.token });
  const exact = matches.find((m) => m.name.toLowerCase() === text.toLowerCase());
  if (exact) return { status: 'ready', crs: exact.crs };
  if (matches.length === 1) return { status: 'ready', crs: matches[0].crs };
  return { status: 'ask', text, options: matches };
}

const clock = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(at);

interface Props {
  /** The request as the person wrote it, so a station answer can be added to it. */
  originalText: string;
  /** What the person wants to do, saved as the plan's goal. */
  goal: string;
  fromRaw: string | undefined;
  toRaw: string | undefined;
  deadlineAt: Date;
  timezone: string;
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
}

/** A purpose plan built from the live timetable. Shows the source and time it came from. */
export function RailPlan({ originalText, goal, fromRaw, toRaw, deadlineAt, timezone, assumptions, onChange }: Props) {
  const [stations, setStations] = useState<{ from: Resolved; to: Resolved } | null>(null);
  const [board, setBoard] = useState<RailBoardResult | null>(null);
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);

  useEffect(() => {
    let active = true;
    void listPlaces(sqlFrom(db)).then((saved) => Promise.all([resolveStation(fromRaw, saved), resolveStation(toRaw, saved)])).then(([from, to]) => {
      if (active) setStations({ from, to });
    });
    return () => {
      active = false;
    };
  }, [db, fromRaw, toRaw]);

  const from = stations?.from.status === 'ready' ? stations.from.crs : null;
  const to = stations?.to.status === 'ready' ? stations.to.crs : null;

  useEffect(() => {
    if (!from || !to) return;
    let active = true;
    void fetchRailBoard(from, to, { baseUrl: speechConfig.baseUrl, token: speechConfig.token }).then((result) => {
      if (active) setBoard(result);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (!stations) return <Text style={styles.body}>Finding your stations…</Text>;
  if (!from || !to) {
    const questions = [
      { resolved: stations.from, leg: 'leave from' },
      { resolved: stations.to, leg: 'go to' },
    ].flatMap(({ resolved, leg }) => {
      if (resolved.status === 'ready') return [];
      if (resolved.status === 'ask') {
        const names = resolved.options.slice(0, 4).map((m) => m.name);
        return [names.length === 0
          ? `Which station do you ${leg}? Give its name or three-letter code.`
          : `Which station do you ${leg}? "${resolved.text}" could be ${names.join(', ')}. Say which, or give the code.`];
      }
      return [`Which station do you ${leg}? Give its name or three-letter code.`];
    });
    return (
      <View style={styles.block}>
        <ClarifyQuestions questions={questions} originalText={originalText} />
      </View>
    );
  }
  if (!board) return <Text style={styles.body}>Checking the live timetable…</Text>;
  if (!board.ok) {
    const message: Record<string, string> = {
      no_feed: 'The live timetable is not connected yet, so I cannot show a train.',
      unknown_station: 'I do not recognise one of those station codes.',
      unauthorised: 'The timetable service refused the connection.',
      timeout: 'The timetable took too long to answer. Please try again.',
      unavailable: 'The timetable could not be reached. Please try again.',
    };
    return (
      <View style={styles.block}>
        <Text style={styles.title}>No live train</Text>
        <Text style={styles.body}>{message[board.error]}</Text>
      </View>
    );
  }

  const now = new Date();
  const choice = chooseTrain(board.departures, {
    deadlineAt,
    bufferMinutes: BUFFER_MINUTES,
    earliestDepartAt: new Date(now.getTime() + (assumptions.getReadyMinutes + WALK_MINUTES) * 60_000),
    timezone,
  });
  if (!choice) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>No train gets you there in time</Text>
        <Text style={styles.body}>
          Nothing from {from} reaches {to} before your deadline with the live timetable. Try a later time or another station.
        </Text>
      </View>
    );
  }

  const outcome: PlanOutcome = planBackwards({
    eventAt: choice.departsAt,
    bufferMinutes: 0,
    steps: [
      { id: 'get-ready', label: 'Get ready', kind: 'prep', minutes: assumptions.getReadyMinutes, source: 'estimated' },
      { id: 'walk', label: 'Walk to the station', kind: 'travel', minutes: WALK_MINUTES, source: 'estimated' },
    ],
    earliestWakeAt: null,
    now,
    eventLabel: `Train to ${to} at ${clock(choice.departsAt, timezone)}`,
  });
  if (!outcome.ok) return <Text style={styles.body}>This plan cannot be made: {outcome.reason}.</Text>;

  const feedTime = board.feedLastMessageAt ? clock(new Date(board.feedLastMessageAt), timezone) : null;

  // Everything the journey check needs, captured now so the save below does not depend on render-time narrowing.
  const recordable = { choice, outcome, from, to, deadlineAt, assumptions };
  async function recordJourney(nativeId: string) {
    const { choice: picked, outcome: plannedOutcome, from: fromCode, to: toCode, deadlineAt: deadline, assumptions: a } = recordable;
    if (!plannedOutcome.ok) return;
    const planId = randomUUID();
    const prefs = await loadPreferences(sql);
    const createdAt = new Date().toISOString();
    await savePlan(sql, { id: planId, goal, eventAt: deadline.toISOString(), wakeAt: plannedOutcome.wakeAt.toISOString(), getReadyMinutes: a.getReadyMinutes, createdAt });
    await saveTimeline(sql, planId, plannedOutcome.timeline);
    await saveJourney(sql, {
      planId,
      fromCrs: fromCode ?? '',
      toCrs: toCode ?? '',
      trainId: picked.trainId,
      departsAt: picked.departsAt,
      arrivesAt: picked.arrivesAt,
      deadlineAt: deadline,
      leaveAfterWakeMinutes: a.getReadyMinutes + WALK_MINUTES,
      bufferMinutes: BUFFER_MINUTES,
      earliestWakeAt: earliestWakeFor(deadline, prefs.earliestWake, timezone),
      wakeAt: plannedOutcome.wakeAt,
      wakeNativeId: nativeId,
      timezone,
    });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        Train {choice.trainId}, {from} to {to}. Live timetable{feedTime ? `, as of ${feedTime}` : ''}.
      </Text>
      <Text style={styles.caption}>{choice.platform ? `Platform ${choice.platform}` : 'Platform not confirmed yet'}. Powered by National Rail Enquiries.</Text>
      <PlanView outcome={outcome} timezone={timezone} assumptions={assumptions} onChange={onChange} />
      <QuickAlarm at={outcome.wakeAt} timezone={timezone} caption="Approve the wake alarm" note="Only the wake alarm is set here. The train itself is not booked." onSet={(nativeId) => void recordJourney(nativeId)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  block: { gap: space.sm, paddingVertical: space.sm },
  title: { color: colors.ink, ...type.title },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  caption: { color: colors.muted, ...type.caption },
});
