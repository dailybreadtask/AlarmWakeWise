import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import { CONSENT_TABLE_SQL } from '../consent/consentRepository';
import { ALARM_TABLE_SQL } from '../storage/alarmRepository';
import { CONTEXT_TABLE_SQL, loadPreferences, migrateContext } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { TIMER_TABLE_SQL } from '../timers/timerRepository';
import { PLAN_TABLE_SQL } from '../plans/planRepository';
import { ConsentProvider } from '../consent/ConsentProvider';
import { applyAppearance } from '../theme/appearance';
import { colors } from '../theme/tokens';

// Night is the default, so the first frame is dark. The saved choice is applied as soon as the database is open.
Appearance.setColorScheme('dark');

// Reminders show as a banner even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Opens the tables and brings older databases up to date. It is declared once, outside the component, on purpose:
 * SQLiteProvider reopens the database whenever this function changes. A new function on every render closed the
 * database in the middle of a query whenever the layout drew again, which happened when the appearance changed.
 */
async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CONSENT_TABLE_SQL + ALARM_TABLE_SQL + CONTEXT_TABLE_SQL + TIMER_TABLE_SQL + PLAN_TABLE_SQL);
  await migrateContext(sqlFrom(db));
}

/** Applies the saved night, day or automatic choice. Renders nothing. */
function AppearanceBoot() {
  const db = useSQLiteContext();
  useEffect(() => {
    void loadPreferences(sqlFrom(db))
      .then((p) => applyAppearance(p.appearance))
      .catch(() => undefined);
  }, [db]);
  return null;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="wakewise.db" onInit={initDatabase}>
      <ConsentProvider>
        <StatusBar style="auto" />
        <AppearanceBoot />
        <Stack
          screenOptions={{
            // Every screen draws its own header, in the approved style.
            headerShown: false,
            contentStyle: { backgroundColor: colors.paper },
          }}
        />
      </ConsentProvider>
    </SQLiteProvider>
  );
}
