import { requireOptionalNativeModule } from 'expo';

export type NativeAlarmState = 'scheduled' | 'countdown' | 'paused' | 'alerting';

export interface NativeScheduleRequest {
  id: string;
  hour: number;
  minute: number;
  /** 0 = Monday ... 6 = Sunday. Empty means the next occurrence only. */
  weekdays: number[];
  /** Exact instant for a one-time alarm, in milliseconds since 1970. Null for a time of day. */
  fireAtMs?: number | null;
  title: string;
  soundFile: string | null;
  snoozeMinutes: number;
  openAppOnStop: boolean;
}

export interface WakeWiseAlarmNativeModule {
  isSupported(): boolean;
  getAuthorization(): 'authorized' | 'denied' | 'notDetermined' | 'unsupported';
  requestAuthorization(): Promise<'authorized' | 'denied' | 'notDetermined' | 'unsupported'>;
  bundledSoundExists(file: string): boolean;
  schedule(request: NativeScheduleRequest): Promise<{ usedSound: 'bundled' | 'systemDefault' }>;
  cancel(id: string): Promise<void>;
  scheduled(): Promise<{ id: string; state: NativeAlarmState }[]>;
  consumePendingDismissal(): { id: string; at: number } | null;
  addListener(
    event: 'onAlarmsChanged',
    listener: (payload: { alarms: { id: string; state: NativeAlarmState }[] }) => void,
  ): { remove(): void };
}

/** Null on Android, web and Expo Go, where the AlarmKit bridge is not linked. */
export default requireOptionalNativeModule<WakeWiseAlarmNativeModule>('WakeWiseAlarm');
