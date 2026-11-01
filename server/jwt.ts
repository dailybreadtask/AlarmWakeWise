import { createPrivateKey, sign } from 'node:crypto';

const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/**
 * A JSON Web Token signed with ES256, which both Apple WeatherKit and the Apple Push Notification service ask for.
 * The signature is the raw r and s values, not the DER form Node produces by default.
 */
export function signEs256Jwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKeyPem: string): string {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(signature)}`;
}
