import { generateKeyPairSync, verify } from 'node:crypto';

import { sendPush, type ApnsConfig, type ApnsTransport } from '../../server/push';

const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const config: ApnsConfig = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), topic: 'com.example.app' };

function recorder(status: number, body = '') {
  const calls: { host: string; path: string; headers: Record<string, string>; body: string }[] = [];
  const transport: ApnsTransport = async (host, path, headers, text) => {
    calls.push({ host, path, headers, body: text });
    return { status, body };
  };
  return { transport, calls };
}

describe('sendPush', () => {
  it('sends an alert to the right host, with a signed token and the app as the topic', async () => {
    const { transport, calls } = recorder(200);
    const result = await sendPush(config, { token: 'abc123', environment: 'sandbox' }, { title: 'Hello', body: 'World', data: { kind: 'journey' } }, transport, 1_700_000_000);
    expect(result).toEqual({ ok: true });
    expect(calls[0].host).toBe('https://api.sandbox.push.apple.com');
    expect(calls[0].path).toBe('/3/device/abc123');
    expect(calls[0].headers['apns-topic']).toBe('com.example.app');
    expect(calls[0].headers['apns-push-type']).toBe('alert');
    expect(JSON.parse(calls[0].body)).toEqual({ aps: { alert: { title: 'Hello', body: 'World' }, sound: 'default' }, kind: 'journey' });

    const [header, claims, signature] = calls[0].headers.authorization.replace('bearer ', '').split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ iss: 'TEAM123456', iat: expect.any(Number) });
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('uses the production host for a production token', async () => {
    const { transport, calls } = recorder(200);
    await sendPush(config, { token: 't', environment: 'production' }, { title: 'a', body: 'b' }, transport);
    expect(calls[0].host).toBe('https://api.push.apple.com');
  });

  it('reports a token Apple no longer knows as invalid, and other failures as plain failures', async () => {
    const gone = recorder(410, JSON.stringify({ reason: 'Unregistered' }));
    expect(await sendPush(config, { token: 't', environment: 'sandbox' }, { title: 'a', body: 'b' }, gone.transport)).toMatchObject({ ok: false, status: 410, invalidToken: true });
    const busy = recorder(503, JSON.stringify({ reason: 'ServiceUnavailable' }));
    expect(await sendPush(config, { token: 't', environment: 'sandbox' }, { title: 'a', body: 'b' }, busy.transport)).toMatchObject({ ok: false, invalidToken: false, reason: 'ServiceUnavailable' });
  });

  it('turns a network failure into a result instead of throwing', async () => {
    const transport: ApnsTransport = async () => {
      throw new Error('socket hang up');
    };
    expect(await sendPush(config, { token: 't', environment: 'sandbox' }, { title: 'a', body: 'b' }, transport)).toMatchObject({ ok: false, status: 0, invalidToken: false });
  });
});
