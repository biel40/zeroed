import { normalizeEmail } from './email';

const GOOGLE_ISSUERS: ReadonlySet<string> = new Set(['accounts.google.com', 'https://accounts.google.com']);
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const DEFAULT_KEYS_TTL_MS = 60 * 60 * 1000;
/** Tolerated clock difference with Google when checking expiry. */
const CLOCK_SKEW_SECONDS = 60;
const RSA_SHA256: RsaHashedImportParams = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

/** Google's public signing keys by key id (`kid`). */
export interface GoogleKeySource {
  getKey(keyId: string): Promise<JsonWebKey | null>;
}

type FetchFn = (input: string) => Promise<Response>;

/** Fetches Google's published keys, caches them for their `max-age` and refetches once for an unknown key. */
export class GoogleCertsKeySource implements GoogleKeySource {
  private keys = new Map<string, JsonWebKey>();
  private expiresAt = 0;

  public constructor(
    private readonly now: () => number,
    private readonly fetchFn: FetchFn = (input) => fetch(input),
  ) {}

  public async getKey(keyId: string): Promise<JsonWebKey | null> {
    const fresh = this.now() < this.expiresAt;
    if (fresh && this.keys.has(keyId)) return this.keys.get(keyId) ?? null;
    await this.reload();
    return this.keys.get(keyId) ?? null;
  }

  private async reload(): Promise<void> {
    const response = await this.fetchFn(GOOGLE_CERTS_URL);
    if (!response.ok) throw new Error(`Google keys responded ${response.status}`);
    const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    this.keys = new Map((body.keys ?? []).filter((key) => typeof key.kid === 'string').map((key) => [key.kid as string, key]));
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    this.expiresAt = this.now() + (maxAge ? Number(maxAge) * 1000 : DEFAULT_KEYS_TTL_MS);
  }
}

/** Checks a Google Identity Services credential (an RS256 ID token) issued for this game. */
export class GoogleIdTokenVerifier {
  public constructor(
    private readonly clientId: string,
    private readonly keys: GoogleKeySource,
    private readonly now: () => number,
  ) {}

  /** The verified, normalized address; null for any token that is malformed, forged, expired or for another app. */
  public async verify(credential: unknown): Promise<string | null> {
    if (typeof credential !== 'string') return null;
    const parts = credential.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    const payload = decodeJson(payloadPart);
    if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    // Failing to reach Google rejects; a key or signature that cannot be read is just an invalid token.
    const jwk = await this.keys.getKey(header.kid);
    if (!jwk || !(await GoogleIdTokenVerifier.hasValidSignature(jwk, `${headerPart}.${payloadPart}`, signaturePart))) return null;

    if (payload.aud !== this.clientId || !GOOGLE_ISSUERS.has(String(payload.iss))) return null;
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS <= this.now() / 1000) return null;
    if (payload.email_verified !== true) return null;
    return normalizeEmail(payload.email);
  }

  private static async hasValidSignature(jwk: JsonWebKey, signedText: string, signaturePart: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey('jwk', jwk, RSA_SHA256, false, ['verify']);
      return await crypto.subtle.verify(RSA_SHA256, key, decodeBase64Url(signaturePart), new TextEncoder().encode(signedText));
    } catch {
      return false;
    }
  }
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(part: string): Uint8Array {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
}
