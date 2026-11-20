import { isProductId, type ProductId } from '../config/products';
import type { Language } from '../i18n/i18n';

/** Production account API (`cloudflare/api`); `VITE_ACCOUNT_API_URL` overrides it. */
export const DEFAULT_ACCOUNT_API_URL = 'https://zeroed-api.zeroed.workers.dev';

/** Keeps a slow or unreachable API from holding the menu. */
const REQUEST_TIMEOUT_MS = 6_000;

export type LoginRequestOutcome = 'sent' | 'invalid-email' | 'rate-limited' | 'unavailable';

export interface IssuedSession {
  readonly token: string;
  readonly email: string;
}

/** Why the server refused a password sign-in; `no-account` also covers accounts that never set a password. */
export type SignInRejection = 'invalid-email' | 'no-account' | 'wrong-password' | 'rate-limited';
/** Why the server refused to create an account; `exists` means the address already has a password. */
export type RegistrationRejection = 'invalid-email' | 'weak-password' | 'exists';

export interface AccountEntitlements {
  readonly email: string;
  readonly products: ProductId[];
  readonly beta: boolean;
  readonly previews?: ProductId[];
}

/**
 * What `WebAccount` needs from an account server. Methods that return null
 * mean the server rejected the token; network and server errors reject.
 */
export interface AccountBackend {
  /** Creates the account and signs it in. */
  register(email: string, password: string): Promise<IssuedSession | RegistrationRejection>;
  signInWithPassword(email: string, password: string): Promise<IssuedSession | SignInRejection>;
  /** `credential` is a Google Identity Services ID token. */
  signInWithGoogle(credential: string): Promise<IssuedSession | null>;
  /** Null when the session was rejected. */
  changePassword(sessionToken: string, password: string): Promise<'changed' | 'weak-password' | null>;
  /** Mails a recovery link that signs in, so the player can then choose a new password. */
  requestLogin(email: string, language: Language): Promise<LoginRequestOutcome>;
  verifyLogin(loginToken: string): Promise<IssuedSession | null>;
  fetchEntitlements(sessionToken: string): Promise<AccountEntitlements | null>;
  logout(sessionToken: string): Promise<void>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** HTTP client for the account API. */
export class AccountApi implements AccountBackend {
  private readonly baseUrl: string;

  public constructor(baseUrl: string, private readonly fetchFn: FetchFn = (input, init) => fetch(input, init)) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async register(email: string, password: string): Promise<IssuedSession | RegistrationRejection> {
    const response = await this.post('/auth/register', { email, password });
    if (response.status === 409) return 'exists';
    if (response.status === 400) return (await AccountApi.readError(response)) === 'weak_password' ? 'weak-password' : 'invalid-email';
    return AccountApi.readSession(response);
  }

  public async signInWithPassword(email: string, password: string): Promise<IssuedSession | SignInRejection> {
    const response = await this.post('/auth/password', { email, password });
    if (response.status === 400) return 'invalid-email';
    if (response.status === 404) return 'no-account';
    if (response.status === 401) return 'wrong-password';
    if (response.status === 429) return 'rate-limited';
    return AccountApi.readSession(response);
  }

  public async changePassword(sessionToken: string, password: string): Promise<'changed' | 'weak-password' | null> {
    const response = await this.request('/me/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ password }),
    });
    if (response.status === 204) return 'changed';
    if (response.status === 400) return 'weak-password';
    if (response.status === 401) return null;
    throw new Error(`Account API responded ${response.status}`);
  }

  public async signInWithGoogle(credential: string): Promise<IssuedSession | null> {
    const response = await this.post('/auth/google', { credential });
    if (response.status === 400 || response.status === 401) return null;
    return AccountApi.readSession(response);
  }

  public async requestLogin(email: string, language: Language): Promise<LoginRequestOutcome> {
    try {
      const response = await this.post('/auth/request', { email, language });
      if (response.status === 202) return 'sent';
      if (response.status === 400) return 'invalid-email';
      if (response.status === 429) return 'rate-limited';
    } catch {
      // Offline or timed out: the same advice as a server error.
    }
    return 'unavailable';
  }

  public async verifyLogin(loginToken: string): Promise<IssuedSession | null> {
    const response = await this.post('/auth/verify', { token: loginToken });
    if (response.status === 400 || response.status === 401) return null;
    return AccountApi.readSession(response);
  }

  public async fetchEntitlements(sessionToken: string): Promise<AccountEntitlements | null> {
    const response = await this.request('/me/entitlements', { headers: { authorization: `Bearer ${sessionToken}` } });
    if (response.status === 401) return null;
    const body = await AccountApi.readJson(response);
    if (typeof body.email !== 'string' || !Array.isArray(body.products)) throw new Error('Malformed entitlements');
    return {
      email: body.email,
      products: body.products.filter(isProductId),
      beta: body.beta === true,
      ...(Array.isArray(body.previews) ? { previews: body.previews.filter(isProductId) } : {}),
    };
  }

  public async logout(sessionToken: string): Promise<void> {
    await this.request('/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } });
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  private static async readError(response: Response): Promise<unknown> {
    const body: unknown = await response.json().catch(() => null);
    return body !== null && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  }

  private static async readSession(response: Response): Promise<IssuedSession> {
    const body = await AccountApi.readJson(response);
    if (typeof body.token !== 'string' || typeof body.email !== 'string') throw new Error('Malformed session');
    return { token: body.token, email: body.email };
  }

  private static async readJson(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) throw new Error(`Account API responded ${response.status}`);
    const body: unknown = await response.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  }
}
