import * as Notifications from 'expo-notifications';

import type { ReminderBridge } from './reminderScheduler';

/** Local notifications through expo-notifications. Works without a server or account. */
export const expoReminderBridge: ReminderBridge = {
  requestPermission: async () => (await Notifications.requestPermissionsAsync()).granted,
  schedule: (at, title, body) =>
    Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    }),
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};
