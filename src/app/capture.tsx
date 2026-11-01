import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Backdrop, BACKDROP_PAPER } from '../components/Backdrop';
import { Glow } from '../components/Glow';
import { PlanningDisc } from '../components/PlanningDisc';
import { PressScale } from '../components/PressScale';
import { Waveform } from '../components/Waveform';
import { useConsent } from '../consent/ConsentProvider';
import { speechConfig } from '../config';
import { listPlaces } from '../context/contextRepository';
import { dayBeingPlanned } from '../domain/planningDay';
import { parseRequest, type ParseResult } from '../intent/parseClient';
import { sqlFrom } from '../storage/sqlAdapter';
import type { TranscriptionResult } from '../speech/transcribeClient';
import { useVoiceCapture } from '../speech/useVoiceCapture';
import { colors, space, useTheme } from '../theme/tokens';

const SUGGESTIONS = ['Get me to work for 9, with a run first', 'Bake a cake by noon', 'Study for Friday’s exam'];

const MESSAGES: Record<string, string> = {
  consent_required: 'Speech is off. Turn it on in Speech and privacy, or type instead.',
  unavailable: 'Voice could not be reached. You can type instead.',
  timeout: 'Voice took too long. You can type instead.',
  rejected: 'The microphone is off, or the recording was refused. You can type instead.',
};

function messageFor(result: TranscriptionResult | null): string | null {
  return result && !result.ok ? MESSAGES[result.error] : null;
}

type Phase = 'speak' | 'planning' | 'ready';
type Parsed = Extract<ParseResult, { ok: true }>;

/**
 * Plan a purpose, following the goal screens: one question in large type, what you say or type appearing under it,
 * then a short "planning" moment while the request is read, and "See my plan" to review the result.
 */
export default function CaptureScreen() {
  const { hasConsent } = useConsent();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const voiceReady = speechConfig.baseUrl !== '';
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(!voiceReady);
  const [phase, setPhase] = useState<Phase>('speak');
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const aiAllowed = hasConsent('ai_reading');

  const { state, result, start, stop } = useVoiceCapture({
    baseUrl: speechConfig.baseUrl,
    token: speechConfig.token,
    hasConsent,
    onTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript)),
  });

  const recording = state === 'recording';
  const busy = state === 'transcribing';
  const notice = !voiceReady ? 'Voice is not set up on this build. Type your request instead.' : messageFor(result);
  const { word, date } = dayBeingPlanned(new Date());
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

  // While the request is read the disc fills towards, but never reaches, the end. It completes when the answer arrives.
  useEffect(() => {
    if (phase !== 'planning') return;
    const id = setInterval(() => setProgress((p) => p + (90 - p) * 0.07), 100);
    return () => clearInterval(id);
  }, [phase]);

  async function send() {
    if (!aiAllowed || text.trim() === '') return;
    setParseError(null);
    setProgress(0);
    setPhase('planning');
    const places = (await listPlaces(sqlFrom(db))).map((p) => ({ label: p.label, area: p.area ?? undefined }));
    const outcome: ParseResult = await parseRequest(text.trim(), { baseUrl: speechConfig.baseUrl, token: speechConfig.token, places });
    if (outcome.ok) {
      setParsed(outcome);
      setProgress(100);
      setPhase('ready');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPhase('speak');
      setParseError(outcome.error === 'invalid' ? 'I could not understand that. Please try again.' : 'Could not reach the assistant. Please try again.');
    }
  }

  function seePlan() {
    if (!parsed) return;
    router.push({ pathname: '/review', params: { data: JSON.stringify(parsed.value), text: text.trim() } });
  }

  function startAgain() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setText('');
    setParseError(null);
  }

  const planning = phase !== 'speak';
  const canPlan = aiAllowed && text.trim() !== '' && !recording && !busy;

  return (
    <View style={styles.root}>
      <Backdrop />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        {planning ? (
          <View style={styles.headerText}>
            <Text style={styles.planTitle}>{phase === 'ready' ? 'Your plan is ready' : 'Planning your day'}</Text>
            <Text style={styles.sub}>{phase === 'ready' ? 'Here is what I worked out' : 'Reading what you asked for'}</Text>
          </View>
        ) : (
          <>
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={styles.back}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2} strokeLinecap="round">
                <Path d="M15 6l-6 6 6 6" />
              </Svg>
              <Text style={styles.headerTitle}>{word}</Text>
            </Pressable>
            <Text style={styles.sub}>{dateLine}</Text>
          </>
        )}
      </View>

      {planning ? (
        <View style={styles.planning}>
          <View style={styles.discWrap}>
            <Glow size={360} color={c.indigo} opacity={0.3} style={styles.discGlow} />
            <PlanningDisc progress={progress} litColor={c.indigoSoft} />
          </View>
          <View style={styles.pips} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}>
            {Array.from({ length: 20 }, (_, i) => (
              <View key={i} style={[styles.pip, i < Math.round(progress / 5) && styles.pipOn]} />
            ))}
          </View>
          <View style={styles.checks}>
            <Check title="Heard you" note={text.length > 60 ? `${text.slice(0, 57)}…` : text} done />
            <Check title="Reading your request" note="Working out what you need to get done" done={phase === 'ready'} />
          </View>
          <View style={styles.planningFooter}>
            {phase === 'ready' ? (
              <PressScale style={styles.seePlan} onPress={seePlan} accessibilityRole="button" accessibilityLabel="See my plan">
                <Text style={styles.seePlanText}>See my plan</Text>
              </PressScale>
            ) : null}
            <Pressable onPress={() => setPhase('speak')} accessibilityRole="button" accessibilityLabel="Change my request" style={styles.textButton}>
              <Text style={styles.textButtonText}>Change my request</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={styles.middle} contentContainerStyle={styles.middleContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.question}>What’s {word.toLowerCase()} for?</Text>
            {typing ? (
              <TextInput keyboardAppearance="dark" selectionColor={colors.primary}
                style={styles.typed}
                multiline
                autoFocus
                value={text}
                onChangeText={setText}
                placeholder="Type it here"
                placeholderTextColor="#9A9A94"
                accessibilityLabel="Your request"
              />
            ) : text ? (
              <Words text={text} />
            ) : (
              <View style={styles.suggestions}>
                <Text style={styles.hint}>{recording ? 'Listening…' : busy ? 'Turning speech into text…' : 'Tap the microphone and say it, or try one of these.'}</Text>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} onPress={() => setText(s)} accessibilityRole="button" accessibilityLabel={`Use: ${s}`} style={styles.suggestion}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          {voiceReady ? <Waveform active={recording} /> : null}

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {notice ? (
              <Text style={styles.notice} accessibilityRole="alert">
                {notice}
              </Text>
            ) : null}
            {parseError ? (
              <Text style={styles.notice} accessibilityRole="alert">
                {parseError}
              </Text>
            ) : null}
            {!aiAllowed ? (
              <Pressable onPress={() => router.push('/consent')} accessibilityRole="link">
                <Text style={styles.link}>Allow WakeWise to read requests, so planning works</Text>
              </Pressable>
            ) : null}
            {voiceReady && !hasConsent('speech') ? (
              <Pressable onPress={() => router.push('/consent')} accessibilityRole="link">
                <Text style={styles.link}>Turn on speech to text</Text>
              </Pressable>
            ) : null}

            {text.trim() !== '' && !recording && !busy ? (
              <PressScale style={[styles.plan, !canPlan && styles.disabled]} onPress={() => void send()} disabled={!canPlan} accessibilityRole="button" accessibilityLabel="Plan it">
                <Text style={styles.planText}>Plan it</Text>
              </PressScale>
            ) : null}

            <View style={styles.controls}>
              <Pressable onPress={startAgain} disabled={recording || busy || text === ''} accessibilityRole="button" accessibilityLabel="Start again" style={[styles.restart, (recording || busy || text === '') && styles.disabled]}>
                <View style={styles.restartMark} />
              </Pressable>

              <PressScale
                style={[styles.mic, (!voiceReady || busy) && styles.disabled]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTyping(false);
                  if (recording) void stop();
                  else void start();
                }}
                disabled={!voiceReady || busy}
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
                accessibilityState={{ busy }}
              >
                {busy ? (
                  <Text style={styles.micBusy}>…</Text>
                ) : recording ? (
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.onPrimary}>
                    <Rect x={6} y={6} width={12} height={12} rx={2} />
                  </Svg>
                ) : (
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.onPrimary} strokeWidth={2} strokeLinecap="round">
                    <Rect x={9} y={3} width={6} height={12} rx={3} />
                    <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </Svg>
                )}
              </PressScale>

              <Pressable onPress={() => setTyping((t) => !t)} accessibilityRole="button" accessibilityLabel={typing ? 'Hide the keyboard' : 'Type instead'} accessibilityState={{ selected: typing }} style={[styles.keys, typing && styles.keysOn]}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={1.6} strokeLinecap="round">
                  <Rect x={3} y={6} width={18} height={12} rx={2} />
                  <Path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
                </Svg>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

/** What you said, in large type. Words fade in as they arrive. */
function Words({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const words = text.trim().split(/\s+/);
  return (
    <View style={styles.words} accessibilityLabel={text}>
      {words.map((w, i) => (
        <Animated.Text key={`${i}-${w}`} entering={FadeIn.duration(reduced ? 150 : 350).delay(reduced ? 0 : Math.min(i, 20) * 40)} style={styles.word}>
          {w}{' '}
        </Animated.Text>
      ))}
    </View>
  );
}

function Check({ title, note, done }: { title: string; note: string; done?: boolean }) {
  return (
    <View style={styles.check}>
      <View style={[styles.mark, done && styles.markDone]}>
        {done ? (
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.onPrimary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        ) : null}
      </View>
      <View style={styles.checkText}>
        <Text style={styles.checkTitle}>{title}</Text>
        <Text style={styles.checkNote} numberOfLines={2}>
          {note}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKDROP_PAPER },
  header: { paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headerText: { gap: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginLeft: -6 },
  headerTitle: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  sub: { color: colors.quiet, fontSize: 15 },
  planTitle: { color: colors.ink, fontSize: 30, fontWeight: '600', letterSpacing: -0.8 },
  middle: { flex: 1 },
  middleContent: { flexGrow: 1, paddingHorizontal: space.xl, justifyContent: 'center', gap: 18 },
  question: { color: colors.quiet, fontSize: 17 },
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  word: { color: colors.ink, fontSize: 36, fontWeight: '500', letterSpacing: -1, lineHeight: 40 },
  typed: { color: colors.ink, fontSize: 36, fontWeight: '500', letterSpacing: -1, lineHeight: 40, minHeight: 120, padding: 0, textAlignVertical: 'top' },
  suggestions: { gap: 4 },
  hint: { color: colors.quiet, fontSize: 15, marginBottom: space.sm },
  suggestion: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  suggestionText: { color: colors.ink, fontSize: 17 },
  footer: { paddingHorizontal: space.xl, paddingTop: 22, gap: 14 },
  notice: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  link: { color: colors.ink, textDecorationLine: 'underline', fontSize: 15 },
  plan: { minHeight: 58, borderRadius: 29, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  planText: { color: colors.paper, fontSize: 18, fontWeight: '600' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restart: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(253,110,136,0.16)', alignItems: 'center', justifyContent: 'center' },
  restartMark: { width: 16, height: 16, borderRadius: 3, backgroundColor: colors.coral },
  mic: { width: 120, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ring },
  micBusy: { color: colors.ink, fontSize: 22 },
  keys: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  keysOn: { borderColor: colors.ink },
  disabled: { opacity: 0.4 },
  planning: { flex: 1, paddingTop: 26 },
  discWrap: { alignItems: 'center', justifyContent: 'center' },
  discGlow: { left: '50%', marginLeft: -180, top: -60 },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 24, marginHorizontal: space.xl },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  pipOn: { backgroundColor: colors.ink },
  checks: { marginTop: 24, marginHorizontal: space.xl, gap: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: colors.primary, borderStyle: 'solid', borderColor: colors.primary },
  checkText: { flex: 1 },
  checkTitle: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  checkNote: { color: colors.quiet, fontSize: 14 },
  planningFooter: { marginTop: 'auto', paddingHorizontal: space.xl, paddingBottom: 40, gap: 10 },
  seePlan: { minHeight: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ring },
  seePlanText: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.quiet, fontSize: 15 },
});
