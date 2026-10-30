import { Stack, router } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Backdrop } from '../components/Backdrop';
import { PressScale } from '../components/PressScale';
import { Waveform } from '../components/Waveform';
import { useConsent } from '../consent/ConsentProvider';
import { speechConfig } from '../config';
import { parseRequest, type ParseResult } from '../intent/parseClient';
import { listPlaces } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { useSQLiteContext } from 'expo-sqlite';
import type { TranscriptionResult } from '../speech/transcribeClient';
import { useVoiceCapture } from '../speech/useVoiceCapture';
import { colors, radius, space, type } from '../theme/tokens';

const SUGGESTIONS = ['Bake a cake by noon', 'Be at work for 9 tomorrow', 'Study for Friday’s exam'];

const MESSAGES: Record<string, string> = {
  consent_required: 'Speech is off. Turn it on in Speech and privacy, or type instead.',
  unavailable: 'Voice could not be reached. You can type instead.',
  timeout: 'Voice took too long. You can type instead.',
  rejected: 'The microphone is off, or the recording was refused. You can type instead.',
};

function messageFor(result: TranscriptionResult | null): string | null {
  return result && !result.ok ? MESSAGES[result.error] : null;
}

/** Plan a purpose, following the mockup: one question, suggestions, a talk button and a typed fallback. */
export default function CaptureScreen() {
  const { hasConsent } = useConsent();
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const aiAllowed = hasConsent('ai_reading');
  const voiceReady = speechConfig.baseUrl !== '';

  const { state, result, start, stop } = useVoiceCapture({
    baseUrl: speechConfig.baseUrl,
    token: speechConfig.token,
    hasConsent,
    onTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript)),
  });

  const recording = state === 'recording';
  const busy = state === 'transcribing';
  const notice = !voiceReady ? 'Voice is not set up on this build. Type your request below.' : messageFor(result);

  async function send() {
    if (!aiAllowed || text.trim() === '') return;
    setSending(true);
    setParseError(null);
    const places = (await listPlaces(sqlFrom(db))).map((p) => ({ label: p.label, area: p.area ?? undefined }));
    const outcome: ParseResult = await parseRequest(text.trim(), { baseUrl: speechConfig.baseUrl, token: speechConfig.token, places });
    setSending(false);
    if (!outcome.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (outcome.ok) router.push({ pathname: '/review', params: { data: JSON.stringify(outcome.value), text: text.trim() } });
    else setParseError(outcome.error === 'invalid' ? 'I could not understand that answer. Please try again.' : 'Could not reach the assistant. Please try again.');
  }

  const canSend = aiAllowed && text.trim() !== '' && !sending;

  return (
    <View style={styles.root}>
    <Backdrop />
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Plan a purpose', headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.paper } }} />

      <Text style={styles.question}>What do you need to get done?</Text>

      <View style={styles.suggestions}>
        <Text style={styles.caption}>Or try</Text>
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} style={styles.chip} onPress={() => setText(s)} accessibilityRole="button" accessibilityLabel={`Use: ${s}`}>
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <TextInput
        style={styles.input}
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Type instead"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Your request"
      />

      {voiceReady ? (
        <View style={styles.micWrap}>
          <PressScale
            style={[styles.mic, recording && styles.micActive, busy && styles.disabled]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (recording) void stop();
              else void start();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            accessibilityState={{ busy }}
          >
            <Text style={styles.micText}>{busy ? '…' : recording ? 'Stop' : 'Talk'}</Text>
          </PressScale>
          <Waveform active={recording} />
          <Text style={styles.caption}>{busy ? 'Turning speech into text' : recording ? 'Listening. Tap again to stop' : 'Tap to talk, or type'}</Text>
        </View>
      ) : null}

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
          <Text style={styles.link}>Allow WakeWise to read requests, so Send works</Text>
        </Pressable>
      ) : null}
      {!hasConsent('speech') && voiceReady ? (
        <Pressable onPress={() => router.push('/consent')} accessibilityRole="link">
          <Text style={styles.link}>Turn on speech to text</Text>
        </Pressable>
      ) : null}

      <PressScale
        style={[styles.send, !canSend && styles.disabled]}
        onPress={send}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send request"
      >
        <Text style={styles.sendText}>{sending ? 'Reading your request…' : 'Send'}</Text>
      </PressScale>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  container: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  question: { color: colors.ink, ...type.title, fontWeight: '400', marginTop: space.md },
  caption: { color: colors.muted, ...type.caption },
  suggestions: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.card },
  chipText: { color: colors.ink, ...type.label },
  input: { minHeight: 96, backgroundColor: colors.card, borderRadius: radius.button, padding: space.md, color: colors.ink, ...type.body, textAlignVertical: 'top' },
  micWrap: { alignItems: 'center', gap: space.sm, marginTop: space.md },
  mic: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  micActive: { backgroundColor: colors.dark },
  micText: { color: colors.onPrimary, ...type.label },
  notice: { color: colors.ink, ...type.caption, lineHeight: 19 },
  link: { color: colors.ink, textDecorationLine: 'underline', ...type.label },
  send: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', marginTop: 'auto' },
  sendText: { color: colors.onPrimary, ...type.label },
  disabled: { opacity: 0.5 },
});
