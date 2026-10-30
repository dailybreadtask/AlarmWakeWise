import nativeAlarm, { type WakeWiseAlarmNativeModule } from '../../modules/wakewise-alarm';

import type { AlarmBridge, AuthState } from './alarmScheduler';

const UNSUPPORTED: AlarmBridge = {
  isSupported: () => false,
  getAuthorization: (): AuthState => 'unsupported',
  requestAuthorization: async (): Promise<AuthState> => 'unsupported',
  schedule: async () => {
    throw new Error('AlarmKit is not available in this build');
  },
  cancel: async () => undefined,
  scheduled: async () => [],
};

export function bridgeFrom(native: WakeWiseAlarmNativeModule | null): AlarmBridge {
  if (!native) return UNSUPPORTED;
  return {
    isSupported: () => native.isSupported(),
    getAuthorization: () => native.getAuthorization(),
    requestAuthorization: () => native.requestAuthorization(),
    schedule: (request) => native.schedule(request),
    cancel: (id) => native.cancel(id),
    scheduled: () => native.scheduled(),
    consumePendingDismissal: () => native.consumePendingDismissal(),
  };
}

/** The real AlarmKit bridge on iOS 26.1+. Unsupported on Android, web and Expo Go, where the module is not linked. */
export const alarmBridge: AlarmBridge = bridgeFrom(nativeAlarm);
