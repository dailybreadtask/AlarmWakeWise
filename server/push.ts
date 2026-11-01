/**
 * Push notifications through the Apple Push Notification service, straight from the server with a key from the
 * developer account. The key never leaves the server. A push only ever tells the person something changed:
 * it never moves an alarm.
 */
import { connect } from 'node:http2';

import { signEs256Jwt } from './jwt';
import type { PushEnvironment } from './watchStore';

export interface ApnsConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  /** The app's bundle id. */
  topic: string;
}

export interface PushTarget {
  token: string;
  environment: PushEnvironment;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Extra values the app reads when the notification is opened. */
  data?: Record<string, string>;
}

export type PushResult = { ok: true } | { ok: false; status: number; reason: string; /** The token is no longer valid, so it should be forgotten. */ invalidToken: boolean };

export type ApnsTransport = (host: string, path: string, headers: Record<string, string>, body: string) => Promise<{ status: number; body: string }>;

const HOSTS: Record<PushEnvironment, string> = { sandbox: 'https://api.sandbox.push.apple.com', production: 'https://api.push.apple.com' };

/** The real transport: one HTTP/2 request, then the connection is closed. A night's pushes are few, so there is no pool. */
export const http2Transport: ApnsTransport = (host, path, headers, body) =>
  new Promise((resolve, reject) => {
    const client = connect(host);
    client.on('error', reject);
    const request = client.request({ ':method': 'POST', ':path': path, ...headers });
    let status = 0;
    let text = '';
    request.setEncoding('utf8');
    request.on('response', (h) => {
      status = Number(h[':status']);
    });
    request.on('data', (chunk) => {
      text += chunk;
    });
    request.on('end', () => {
      client.close();
      resolve({ status, body: text });
    });
    request.on('error', (e) => {
      client.close();
      reject(e);
    });
    request.setTimeout(10_000, () => request.close());
    request.end(body);
  });

let cached: { token: string; at: number } | null = null;

/** A provider token, reused for 40 minutes. Apple asks that tokens are refreshed at most once an hour and no later than every hour. */
function providerToken(config: ApnsConfig, nowSeconds: number): string {
  if (cached && nowSeconds - cached.at < 40 * 60) return cached.token;
  const token = signEs256Jwt({ alg: 'ES256', kid: config.keyId }, { iss: config.teamId, iat: nowSeconds }, config.privateKeyPem);
  cached = { token, at: nowSeconds };
  return token;
}

export async function sendPush(config: ApnsConfig, target: PushTarget, payload: PushPayload, transport: ApnsTransport = http2Transport, nowSeconds = Math.floor(Date.now() / 1000)): Promise<PushResult> {
  const body = JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' }, ...(payload.data ?? {}) });
  try {
    const res = await transport(
      HOSTS[target.environment],
      `/3/device/${target.token}`,
      { authorization: `bearer ${providerToken(config, nowSeconds)}`, 'apns-topic': config.topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json' },
      body,
    );
    if (res.status === 200) return { ok: true };
    let reason = 'unknown';
    try {
      reason = (JSON.parse(res.body) as { reason?: string }).reason ?? reason;
    } catch {
      // Apple sends JSON, but a failure before it should still be reported.
    }
    return { ok: false, status: res.status, reason, invalidToken: res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic' };
  } catch {
    return { ok: false, status: 0, reason: 'network', invalidToken: false };
  }
}
