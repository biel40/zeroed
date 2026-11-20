import { describe, expect, it } from 'vitest';
import { AccountApi } from '../src/account/AccountApi';
import { readLoginToken } from '../src/account/loginLink';
import { WebAccount, type AccountStorage } from '../src/account/WebAccount';

const API = 'https://api.zeroed.test';
const STORAGE_KEY = 'zeroed.account';

interface Route {
  readonly status: number;
  readonly body?: unknown;
}

/** Answers each `METHOD path` from a table and records every request. */
class FakeServer {
  public readonly requests: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  public offline = false;

  public constructor(public routes: Record<string, Route> = {}) {}

  public readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.requests.push({
      method,
      path: url.pathname,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const route = this.routes[`${method} ${url.pathname}`] ?? { status: 404 };
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status });
  };
}

function memoryStorage(initial: Record<string, string> = {}): AccountStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function savedAccount(products: string[] = ['map.station-33'], beta = true): Record<string, string> {
  return { [STORAGE_KEY]: JSON.stringify({ sessionToken: 'session-1', email: 'tester@example.com', products, beta }) };
}

const ENTITLED = { status: 200, body: { email: 'tester@example.com', products: ['map.station-33'], beta: true } };

describe('login link', () => {
  it('reads the token from the URL fragment only', () => {
    expect(readLoginToken('#login=abc_DEF-123')).toBe('abc_DEF-123');
    expect(readLoginToken('')).toBeNull();
    expect(readLoginToken('#login=')).toBeNull();
    expect(readLoginToken('#login=bad token')).toBeNull();
    expect(readLoginToken('#other=abc')).toBeNull();
  });
});

describe('account API client', () => {
  it('maps login request responses to outcomes', async () => {
    const server = new FakeServer();
    const api = new AccountApi(API, server.fetch);
    const cases: [number, string][] = [[202, 'sent'], [400, 'invalid-email'], [429, 'rate-limited'], [502, 'unavailable']];
    for (const [status, outcome] of cases) {
      server.routes['POST /auth/request'] = { status };
      expect(await api.requestLogin('a@example.com', 'ca')).toBe(outcome);
    }
    expect(server.requests[0].body).toEqual({ email: 'a@example.com', language: 'ca' });

    server.offline = true;
    expect(await api.requestLogin('a@example.com', 'en')).toBe('unavailable');
  });

  it('drops products this build does not know from entitlement responses', async () => {
    const server = new FakeServer({
      'GET /me/entitlements': { status: 200, body: { email: 'a@example.com', products: ['map.station-33', 'map.future', 7], beta: false } },
    });
    const entitlements = await new AccountApi(`${API}/`, server.fetch).fetchEntitlements('session-1');
    expect(entitlements).toEqual({ email: 'a@example.com', products: ['map.station-33'], beta: false });
    expect(server.requests[0].headers.get('authorization')).toBe('Bearer session-1');
  });

  it('maps password sign-in responses to a session or the reason it was refused', async () => {
    const server = new FakeServer();
    const api = new AccountApi(API, server.fetch);
    const cases: [Route, unknown][] = [
      [{ status: 200, body: { token: 'session-1', email: 'a@example.com' } }, { token: 'session-1', email: 'a@example.com' }],
      [{ status: 400, body: { error: 'invalid_email' } }, 'invalid-email'],
      [{ status: 404, body: { error: 'no_account' } }, 'no-account'],
      [{ status: 401, body: { error: 'wrong_password' } }, 'wrong-password'],
      [{ status: 429, body: { error: 'rate_limited' } }, 'rate-limited'],
    ];
    for (const [route, result] of cases) {
      server.routes['POST /auth/password'] = route;
      expect(await api.signInWithPassword('a@example.com', 'password1')).toEqual(result);
    }
    expect(server.requests[0].body).toEqual({ email: 'a@example.com', password: 'password1' });

    server.routes['POST /auth/password'] = { status: 500 };
    await expect(api.signInWithPassword('a@example.com', 'password1')).rejects.toThrow();
  });

  it('maps registration responses to a session or the reason it was refused', async () => {
    const server = new FakeServer();
    const api = new AccountApi(API, server.fetch);
    const cases: [Route, unknown][] = [
      [{ status: 201, body: { token: 'session-1', email: 'a@example.com' } }, { token: 'session-1', email: 'a@example.com' }],
      [{ status: 400, body: { error: 'invalid_email' } }, 'invalid-email'],
      [{ status: 400, body: { error: 'weak_password' } }, 'weak-password'],
      [{ status: 409, body: { error: 'account_exists' } }, 'exists'],
    ];
    for (const [route, result] of cases) {
      server.routes['POST /auth/register'] = route;
      expect(await api.register('a@example.com', 'password1')).toEqual(result);
    }
    expect(server.requests[0].body).toEqual({ email: 'a@example.com', password: 'password1' });
  });

  it('changes the password with the session token', async () => {
    const server = new FakeServer({ 'POST /me/password': { status: 204 } });
    const api = new AccountApi(API, server.fetch);
    expect(await api.changePassword('session-1', 'new password')).toBe('changed');
    expect(server.requests[0].headers.get('authorization')).toBe('Bearer session-1');
    expect(server.requests[0].body).toEqual({ password: 'new password' });
    server.routes['POST /me/password'] = { status: 400 };
    expect(await api.changePassword('session-1', 'short')).toBe('weak-password');
    server.routes['POST /me/password'] = { status: 401 };
    expect(await api.changePassword('expired', 'new password')).toBeNull();
    server.routes['POST /me/password'] = { status: 500 };
    await expect(api.changePassword('session-1', 'new password')).rejects.toThrow();
  });

  it('maps Google sign-in responses to a session, a rejection or an error', async () => {
    const server = new FakeServer({ 'POST /auth/google': { status: 200, body: { token: 'session-1', email: 'a@gmail.com' } } });
    const api = new AccountApi(API, server.fetch);
    expect(await api.signInWithGoogle('credential')).toEqual({ token: 'session-1', email: 'a@gmail.com' });
    expect(server.requests[0].body).toEqual({ credential: 'credential' });

    server.routes['POST /auth/google'] = { status: 401 };
    expect(await api.signInWithGoogle('forged')).toBeNull();
    server.routes['POST /auth/google'] = { status: 404 };
    await expect(api.signInWithGoogle('credential')).rejects.toThrow();
  });
});

describe('web account sign-in', () => {
  it('remembers known preview grants for the signed-in account and clears them on sign-out', async () => {
    const server = new FakeServer({
      'POST /auth/password': { status: 200, body: { token: 'session-1', email: 'player@example.com' } },
      'GET /me/entitlements': { status: 200, body: {
        email: 'player@example.com', products: [], beta: false, previews: ['map.die-kathedrale', 'map.future', 7],
      } },
    });
    const storage = memoryStorage();
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);
    expect(account.canPreview('map.die-kathedrale')).toBe(false);
    expect(await account.signInWithPassword('player@example.com', 'password1')).toBe('signed-in');
    expect(account.canPreview('map.die-kathedrale')).toBe(true);
    expect(account.canPreview('map.station-33')).toBe(false);
    expect(account.owns('map.die-kathedrale')).toBe(false);
    expect(new WebAccount(new AccountApi(API, server.fetch), storage).canPreview('map.die-kathedrale')).toBe(true);
    await account.signOut();
    expect(account.canPreview('map.die-kathedrale')).toBe(false);
  });

  it('signs in with a password, loads its products and remembers them', async () => {
    const server = new FakeServer({
      'POST /auth/password': { status: 200, body: { token: 'session-1', email: 'tester@example.com' } },
      'GET /me/entitlements': ENTITLED,
    });
    const storage = memoryStorage();
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);
    expect(await account.signInWithPassword('tester@example.com', 'password1')).toBe('signed-in');
    expect(account.owns('map.station-33')).toBe(true);
    expect(account.isBetaTester()).toBe(true);
    expect(new WebAccount(new AccountApi(API, new FakeServer().fetch), storage).getEmail()).toBe('tester@example.com');
  });

  it('reports refused passwords and network failures without signing in', async () => {
    const server = new FakeServer({ 'POST /auth/password': { status: 401 } });
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage());
    expect(await account.signInWithPassword('a@example.com', 'password1')).toBe('wrong-password');
    server.offline = true;
    expect(await account.signInWithPassword('a@example.com', 'password1')).toBe('unavailable');
    expect(account.getEmail()).toBeNull();
  });

  it('registers and signs the new account in', async () => {
    const server = new FakeServer({
      'POST /auth/register': { status: 201, body: { token: 'session-1', email: 'new@example.com' } },
      'GET /me/entitlements': { status: 200, body: { email: 'new@example.com', products: [], beta: false } },
    });
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage());
    expect(await account.register('new@example.com', 'password1')).toBe('signed-in');
    expect(account.getEmail()).toBe('new@example.com');
    server.routes['POST /auth/register'] = { status: 409 };
    expect(await account.register('new@example.com', 'password1')).toBe('exists');
  });

  it('changes the password, and signs out when the session has expired', async () => {
    const server = new FakeServer({ 'POST /me/password': { status: 204 } });
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage(savedAccount()));
    expect(await account.changePassword('new password')).toBe('changed');
    server.offline = true;
    expect(await account.changePassword('new password')).toBe('unavailable');
    expect(account.getEmail()).toBe('tester@example.com');
    server.offline = false;
    server.routes['POST /me/password'] = { status: 401 };
    expect(await account.changePassword('new password')).toBe('signed-out');
    expect(account.getEmail()).toBeNull();
    expect(await account.changePassword('new password')).toBe('signed-out');
  });

  it('signs in with Google and reports rejected credentials and failures', async () => {
    const server = new FakeServer({
      'POST /auth/google': { status: 401 },
      'GET /me/entitlements': ENTITLED,
    });
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage());
    expect(await account.signInWithGoogle('forged')).toBe('rejected');
    server.routes['POST /auth/google'] = { status: 502 };
    expect(await account.signInWithGoogle('credential')).toBe('unavailable');
    expect(account.getEmail()).toBeNull();

    server.routes['POST /auth/google'] = { status: 200, body: { token: 'session-1', email: 'tester@example.com' } };
    expect(await account.signInWithGoogle('credential')).toBe('signed-in');
    expect(account.owns('map.station-33')).toBe(true);
  });
});

describe('web account', () => {
  it('owns nothing while signed out and makes no request', async () => {
    const server = new FakeServer();
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage());
    await account.refresh();
    expect(account.owns('map.station-33')).toBe(false);
    expect(account.getEmail()).toBeNull();
    expect(server.requests).toHaveLength(0);
  });

  it('signs in from a login link, loads its products and remembers them', async () => {
    const server = new FakeServer({
      'POST /auth/verify': { status: 200, body: { token: 'session-1', email: 'tester@example.com', expiresAt: 1 } },
      'GET /me/entitlements': ENTITLED,
    });
    const storage = memoryStorage();
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);

    expect(await account.completeLogin('link-1')).toBe('signed-in');
    expect(server.requests[0].body).toEqual({ token: 'link-1' });
    expect(account.owns('map.station-33')).toBe(true);
    expect(account.isBetaTester()).toBe(true);
    expect(account.getEmail()).toBe('tester@example.com');

    const restored = new WebAccount(new AccountApi(API, new FakeServer().fetch), storage);
    expect(restored.owns('map.station-33')).toBe(true);
  });

  it('reports used or expired links and network failures without signing in', async () => {
    const server = new FakeServer({ 'POST /auth/verify': { status: 401 } });
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage());
    expect(await account.completeLogin('used')).toBe('invalid-link');
    server.offline = true;
    expect(await account.completeLogin('link')).toBe('unavailable');
    expect(account.getEmail()).toBeNull();
  });

  it('keeps the remembered products offline so installed copies still open premium maps', async () => {
    const server = new FakeServer();
    server.offline = true;
    const account = new WebAccount(new AccountApi(API, server.fetch), memoryStorage(savedAccount()));
    await account.refresh();
    expect(account.owns('map.station-33')).toBe(true);
  });

  it('updates remembered products on refresh, e.g. after a refund', async () => {
    const server = new FakeServer({ 'GET /me/entitlements': { status: 200, body: { email: 'tester@example.com', products: [], beta: false } } });
    const storage = memoryStorage(savedAccount());
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);
    await account.refresh();
    expect(account.owns('map.station-33')).toBe(false);
    expect(JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}').products).toEqual([]);
  });

  it('forgets an expired or revoked session', async () => {
    const server = new FakeServer({ 'GET /me/entitlements': { status: 401 } });
    const storage = memoryStorage(savedAccount());
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);
    await account.refresh();
    expect(account.getEmail()).toBeNull();
    expect(account.owns('map.station-33')).toBe(false);
    expect(storage.values.has(STORAGE_KEY)).toBe(false);
  });

  it('signs out locally even when the server cannot be reached', async () => {
    const server = new FakeServer();
    server.offline = true;
    const storage = memoryStorage(savedAccount());
    const account = new WebAccount(new AccountApi(API, server.fetch), storage);
    await account.signOut();
    expect(account.getEmail()).toBeNull();
    expect(storage.values.has(STORAGE_KEY)).toBe(false);
  });

  it('ignores corrupt saved data and works without storage', () => {
    const api = new AccountApi(API, new FakeServer().fetch);
    expect(new WebAccount(api, memoryStorage({ [STORAGE_KEY]: '{not json' })).getEmail()).toBeNull();
    expect(new WebAccount(api, memoryStorage({ [STORAGE_KEY]: '{"email":5}' })).getEmail()).toBeNull();
    expect(new WebAccount(api, undefined).owns('map.station-33')).toBe(false);
  });
});
