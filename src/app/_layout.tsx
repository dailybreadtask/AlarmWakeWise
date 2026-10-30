import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SQLiteProvider } from 'expo-sqlite';

import { CONSENT_TABLE_SQL } from '../consent/consentRepository';
import { ALARM_TABLE_SQL } from '../storage/alarmRepository';
import { CONTEXT_TABLE_SQL } from '../context/contextRepository';
import { TIMER_TABLE_SQL } from '../timers/timerRepository';
import { PLAN_TABLE_SQL } from '../plans/planRepository';
import { ConsentProvider } from '../consent/ConsentProvider';
import { colors } from '../theme/tokens';

// Reminders show as a banner even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="wakewise.db" onInit={(db) => db.execAsync(CONSENT_TABLE_SQL + ALARM_TABLE_SQL + CONTEXT_TABLE_SQL + TIMER_TABLE_SQL + PLAN_TABLE_SQL)}>
      <ConsentProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.paper },
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            headerShadowVisible: false,
          }}
        />
      </ConsentProvider>
    </SQLiteProvider>
  );
}
