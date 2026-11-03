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
