/**
 * Overnight journey watching, from the phone's side. It runs only when the person has allowed it: it asks iOS for
 * permission to send notifications, tells the server how to reach this phone, and hands over each journey to watch.
 * Turning it off removes the device from the server.
 */
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';

import { speechConfig } from '../config';
import type { SqlDb } from '../storage/alarmRepository';
import { deleteDevice, registerDevice, watchJourney, type WatchError, type WatchedJourney } from './watchClient';

const DEVICE_KEY = 'watchDeviceId';

const options = () => ({ baseUrl: speechConfig.baseUrl, token: speechConfig.token });

async function savedDeviceId(sql: SqlDb): Promise<string | null> {
  const rows = await sql.getAllAsync<{ value: string }>('SELECT value FROM preference WHERE key = ?', [DEVICE_KEY]);
  return rows[0]?.value || null;
}

async function saveDeviceId(sql: SqlDb, id: string | null): Promise<void> {
  if (id === null) await sql.runAsync('DELETE FROM preference WHERE key = ?', [DEVICE_KEY]);
  else await sql.runAsync('INSERT OR REPLACE INTO preference (key, value, updated_at) VALUES (?, ?, ?)', [DEVICE_KEY, id, new Date().toISOString()]);
}

/**
 * Which Apple push service this build's token belongs to. Builds from Xcode and development builds get a sandbox token;
 * TestFlight and the App Store get a production one. The build's own entitlement says which, so it is asked rather than
 * guessed: a release build run straight from Xcode is still sandbox. A token sent to the wrong service is refused.
 */
export async function pushEnvironment(): Promise<'sandbox' | 'production'> {
  try {
    const environment = await Application.getIosPushNotificationServiceEnvironmentAsync();
    if (environment) return environment === 'production' ? 'production' : 'sandbox';
  } catch {
    // Fall through to the build type.
  }
  return __DEV__ ? 'sandbox' : 'production';
}

export type EnableResult = { ok: true } | { ok: false; reason: 'no_server' | 'notifications_off' | 'no_token' | WatchError };

/** Turns watching on: permission to notify, this phone's push token, and its id on the server. */
export async function enableWatching(sql: SqlDb): Promise<EnableResult> {
  if (!speechConfig.baseUrl) return { ok: false, reason: 'no_server' };
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: 'notifications_off' };
  let pushToken: string;
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    pushToken = String(device.data);
  } catch {
    return { ok: false, reason: 'no_token' };
  }
  const registered = await registerDevice(pushToken, await pushEnvironment(), options());
  if (!registered.ok) return { ok: false, reason: registered.error };
  await saveDeviceId(sql, registered.deviceId);
  return { ok: true };
}

/** Turns watching off: the server forgets this phone and its journeys. */
export async function disableWatching(sql: SqlDb): Promise<void> {
  const id = await savedDeviceId(sql);
  if (id) await deleteDevice(id, options());
  await saveDeviceId(sql, null);
}

/**
 * Hands a journey to the server to watch, if watching is on. Quiet when it is off or the server cannot be reached:
 * the journey card in the app still checks the board whenever you open it.
 */
export async function syncJourney(sql: SqlDb, journey: WatchedJourney): Promise<void> {
  const id = await savedDeviceId(sql);
  if (!id) return;
  const result = await watchJourney(id, journey, options());
  // The server lost this device, for example after a reset. Register again and retry once.
  if (!result.ok && result.error === 'unknown_device') {
    const again = await enableWatching(sql);
    const fresh = again.ok ? await savedDeviceId(sql) : null;
    if (fresh) await watchJourney(fresh, journey, options());
  }
}
