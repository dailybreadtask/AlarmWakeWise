import { useCallback, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

import type { ContextScope } from '../domain/context';
import { transcribeRecording, type TranscriptionResult } from './transcribeClient';

export interface VoiceCaptureOptions {
  baseUrl: string;
  token?: string;
  hasConsent: (scope: ContextScope) => boolean;
  /** Called with the text once a recording has been transcribed. */
  onTranscript?: (text: string) => void;
}

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'done' | 'error';

/**
 * Press to talk: record on the phone, then send the recording for speech to
 * text. Typed entry is always available as the fallback, so the caller must
 * show it whenever `result` is an error.
 */
export function useVoiceCapture(options: VoiceCaptureOptions) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  const fail = useCallback((error: TranscriptionResult & { ok: false }) => {
    setState('error');
    setResult(error);
  }, []);

  const start = useCallback(async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) return fail({ ok: false, error: 'rejected' });
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setResult(null);
      setState('recording');
    } catch {
      fail({ ok: false, error: 'unavailable' });
    }
  }, [recorder, fail]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      return fail({ ok: false, error: 'unavailable' });
    }
    const uri = recorder.uri;
    if (!uri) return fail({ ok: false, error: 'unavailable' });
    setState('transcribing');
    const transcript = await transcribeRecording(uri, { baseUrl: options.baseUrl, token: options.token, hasConsent: options.hasConsent });
    setResult(transcript);
    setState(transcript.ok ? 'done' : 'error');
    if (transcript.ok && transcript.text) options.onTranscript?.(transcript.text);
  }, [recorder, options, fail]);

  return { state, result, start, stop };
}
