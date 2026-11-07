import type { GoogleKeySource } from '../../cloudflare/api/src/googleIdToken';

export const GOOGLE_CLIENT_ID = 'zeroed-test.apps.googleusercontent.com';
const KEY_ID = 'test-key';
const RSA_SHA256: RsaHashedKeyGenParams = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };

export interface GoogleSigner {
  /** Serves the signer's public key under its id, as Google's certs endpoint would. */
  readonly keys: GoogleKeySource;
  /** A Google-style ID token issued at `nowMs` for an hour; `claims` override the defaults. */
  sign(claims: Record<string, unknown>, nowMs: number, keyId?: string): Promise<string>;
}

/** Stands in for Google: an RSA key pair that issues ID tokens for this game's client id. */
export async function createGoogleSigner(): Promise<GoogleSigner> {
  const pair = await crypto.subtle.generateKey(RSA_SHA256, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    keys: { getKey: async (keyId) => (keyId === KEY_ID ? publicJwk : null) },
    async sign(claims, nowMs, keyId = KEY_ID): Promise<string> {
      const issuedAt = Math.floor(nowMs / 1000);
      const header = encode({ alg: 'RS256', kid: keyId, typ: 'JWT' });
      const payload = encode({
        iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub: '1234567890',
        email_verified: true, iat: issuedAt, exp: issuedAt + 3600, ...claims,
      });
      const signature = await crypto.subtle.sign(RSA_SHA256, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
      return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
    },
  };
}

function encode(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
