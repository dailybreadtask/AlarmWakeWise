/**
 * Sends one test notification to every device the server knows, to check the push key and the phone end to end.
 * Run: npx tsx --env-file=server/.env.local server/scripts/testPush.ts
 * It prints only the outcome for each device, never a token.
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

import { sendPush } from '../push';

const databaseUrl = process.env.DATABASE_URL ?? '';
const keyPath = process.env.APNS_PRIVATE_KEY_PATH ?? '';
const encoded = process.env.APNS_PRIVATE_KEY_BASE64;
if (!databaseUrl || !process.env.APNS_TEAM_ID || !process.env.APNS_KEY_ID || (!keyPath && !encoded)) {
  console.log('Set DATABASE_URL, APNS_TEAM_ID, APNS_KEY_ID and the push key first.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl.replace('sslmode=require', 'sslmode=verify-full'), max: 1 });
const privateKeyPem = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : readFileSync(keyPath, 'utf8');
const config = { teamId: process.env.APNS_TEAM_ID, keyId: process.env.APNS_KEY_ID, privateKeyPem, topic: process.env.APNS_TOPIC ?? 'com.dailytaskapps.wakewise' };

async function main() {
  const { rows } = await pool.query<{ apns_token: string; environment: 'sandbox' | 'production' }>('SELECT apns_token, environment FROM device');
  console.log(`${rows.length} device(s)`);
  for (const [i, row] of rows.entries()) {
    const result = await sendPush(config, { token: row.apns_token, environment: row.environment }, { title: 'WakeWise test', body: 'Overnight watching is on. If your train is cancelled or late, you will hear from me here.', data: { kind: 'test' } });
    console.log(`device ${i + 1} (${row.environment}):`, result.ok ? 'sent' : `failed, status ${result.status}, ${result.reason}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.log('error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
