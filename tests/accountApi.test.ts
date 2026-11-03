import { beforeEach, describe, expect, it } from 'vitest';
import { createAccountApp } from '../cloudflare/api/src/app';
import { buildBetaSeedSql } from '../cloudflare/api/src/betaSeed';
import type { LoginEmail, LoginMailer } from '../cloudflare/api/src/LoginMailer';
import { AccountStore } from '../cloudflare/api/src/AccountStore';
import { PRODUCT_IDS } from '../src/config/products';
import { createMigratedDatabase, type SqliteDatabase } from './support/sqliteDatabase';

const APP_URL = 'https://zeroed.test';
const ORIGIN = 'https://zeroed.test';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

class RecordingMailer implements LoginMailer {
  public readonly sent: LoginEmail[] = [];
  public failing = false;

  public async send(email: LoginEmail): Promise<void> {
    if (this.failing) throw new Error('mail provider down');
    this.sent.push(email);
  }

  public lastToken(): string {
    const match = /#login=([A-Za-z0-9_-]+)/.exec(this.sent.at(-1)?.text ?? '');
    if (!match) throw new Error('No login link sent');
    return match[1];
  }
}

describe('account API', () => {
  let database: SqliteDatabase;
  let mailer: RecordingMailer;
  let now: number;
  let app: ReturnType<typeof createAccountApp>;

  beforeEach(() => {
    database = createMigratedDatabase();
    mailer = new RecordingMailer();
    now = Date.UTC(2026, 10, 3, 12);
    let calls = 0;
    app = createAccountApp({
      database,
      mailer,
      now: () => now,
      // Deterministic yet unique per call: a counter in the first bytes.
      randomBytes: (length) => {
        const bytes = new Uint8Array(length);
        new DataView(bytes.buffer).setUint32(0, ++calls);
        return bytes;
      },
      appUrl: APP_URL,
      allowedOrigins: [ORIGIN],
    });
  });

  function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return Promise.resolve(app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
      body: JSON.stringify(body),
    }));
  }

  function getEntitlements(sessionToken?: string): Promise<Response> {
    const headers: Record<string, string> = sessionToken ? { authorization: `Bearer ${sessionToken}` } : {};
    return Promise.resolve(app.request('/me/entitlements', { headers }));
  }

  async function signIn(email = 'player@example.com'): Promise<string> {
    expect((await post('/auth/request', { email })).status).toBe(202);
    const response = await post('/auth/verify', { token: mailer.lastToken() });
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  }

  it('mails a one-time link to the normalized address in the requested language', async () => {
    const response = await post('/auth/request', { email: '  Player@Example.COM ', language: 'es' });

    expect(response.status).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('player@example.com');
    expect(mailer.sent[0].subject).toContain('Zeroed');
    expect(mailer.sent[0].text).toContain(`${APP_URL}/#login=`);
    expect(mailer.sent[0].text).toContain('15 minutos');
  });

  it('rejects malformed addresses without sending mail', async () => {
    for (const email of ['', 'no-at-sign', 'a@b', 42]) {
      expect((await post('/auth/request', { email })).status).toBe(400);
    }
    expect(mailer.sent).toHaveLength(0);
  });

  it('limits login requests per address and per requester within an hour', async () => {
    for (let i = 0; i < 5; i++) expect((await post('/auth/request', { email: 'a@example.com' })).status).toBe(202);
    expect((await post('/auth/request', { email: 'a@example.com' })).status).toBe(429);

    for (let i = 0; i < 15; i++) {
      expect((await post('/auth/request', { email: `user${i}@example.com` })).status).toBe(202);
    }
    expect((await post('/auth/request', { email: 'other@example.com' })).status).toBe(429);
    expect(mailer.sent).toHaveLength(20);

    now += 61 * MINUTE;
    expect((await post('/auth/request', { email: 'a@example.com' })).status).toBe(202);
  });

  it('reports a mail failure so the player can retry', async () => {
    mailer.failing = true;
    expect((await post('/auth/request', { email: 'a@example.com' })).status).toBe(502);
  });

  it('exchanges a login link once for a session', async () => {
    await post('/auth/request', { email: 'player@example.com' });
    const token = mailer.lastToken();

    const response = await post('/auth/verify', { token });
    expect(response.status).toBe(200);
    const session = (await response.json()) as { token: string; email: string; expiresAt: number };
    expect(session.email).toBe('player@example.com');
    expect(session.token).not.toBe(token);
    expect(session.expiresAt).toBe(now + 90 * DAY);

    expect((await post('/auth/verify', { token })).status).toBe(401);
    expect((await post('/auth/verify', { token: 'unknown' })).status).toBe(401);
    expect((await post('/auth/verify', {})).status).toBe(400);
  });

  it('rejects login links after 15 minutes', async () => {
    await post('/auth/request', { email: 'player@example.com' });
    now += 15 * MINUTE;
    expect((await post('/auth/verify', { token: mailer.lastToken() })).status).toBe(401);
  });

  it('keeps one account per address across devices', async () => {
    await signIn('player@example.com');
    await signIn('PLAYER@example.com');
    const users = await database.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    expect(users?.count).toBe(1);
  });

  it('requires a valid session to read entitlements', async () => {
    expect((await getEntitlements()).status).toBe(401);
    expect((await getEntitlements('forged')).status).toBe(401);
  });

  it('gives a new account no premium products', async () => {
    const response = await getEntitlements(await signIn());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'player@example.com', products: [] });
  });

  it('expands an all-premium beta grant to every product, present and future', async () => {
    database.exec(buildBetaSeedSql(['tester@example.com'], now));
    const response = await getEntitlements(await signIn('tester@example.com'));
    expect(await response.json()).toEqual({ email: 'tester@example.com', products: [...PRODUCT_IDS] });
  });

  it('ignores revoked grants and products this build does not know', async () => {
    const token = await signIn();
    const user = await database.prepare('SELECT id FROM users').first<{ id: string }>();
    database.exec(`
      INSERT INTO grants (user_id, product_id, source, created_at, revoked_at)
        VALUES ('${user?.id}', 'map.station-33', 'manual', 0, 1);
      INSERT INTO grants (user_id, product_id, source, created_at)
        VALUES ('${user?.id}', 'map.future', 'manual', 0);
    `);
    expect(await (await getEntitlements(token)).json()).toEqual({ email: 'player@example.com', products: [] });

    database.exec(`INSERT INTO grants (user_id, product_id, source, created_at) VALUES ('${user?.id}', 'map.station-33', 'purchase', 0)`);
    expect(await (await getEntitlements(token)).json()).toEqual({ email: 'player@example.com', products: ['map.station-33'] });
  });

  it('renews an active session at most daily and expires an idle one', async () => {
    const token = await signIn();
    now += 89 * DAY;
    expect((await getEntitlements(token)).status).toBe(200);
    now += 89 * DAY;
    expect((await getEntitlements(token)).status).toBe(200);
    now += 90 * DAY;
    expect((await getEntitlements(token)).status).toBe(401);
  });

  it('signs out by deleting the session', async () => {
    const token = await signIn();
    const response = await post('/auth/logout', {}, { authorization: `Bearer ${token}` });
    expect(response.status).toBe(204);
    expect((await getEntitlements(token)).status).toBe(401);
  });

  it('allows cross-origin calls only from the configured origins', async () => {
    const allowed = await app.request('/me/entitlements', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'GET' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);

    const denied = await app.request('/me/entitlements', { method: 'OPTIONS', headers: { origin: 'https://evil.test', 'access-control-request-method': 'GET' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('purges expired login links and sessions', async () => {
    const token = await signIn();
    await post('/auth/request', { email: 'idle@example.com' });
    now += 91 * DAY;
    await new AccountStore(database).purgeExpired(now);

    const tokens = await database.prepare('SELECT COUNT(*) AS count FROM login_tokens').first<{ count: number }>();
    const sessions = await database.prepare('SELECT COUNT(*) AS count FROM sessions').first<{ count: number }>();
    expect(tokens?.count).toBe(0);
    expect(sessions?.count).toBe(0);
    expect((await getEntitlements(token)).status).toBe(401);
  });
});

describe('beta seed', () => {
  it('creates one all-premium grant per normalized tester and can be applied twice', () => {
    const database = createMigratedDatabase();
    const sql = buildBetaSeedSql([' Tester@Example.com ', 'tester@example.com', 'second@example.com'], 1);
    database.exec(sql);
    database.exec(sql);

    return database.prepare('SELECT u.email, g.product_id, g.source FROM grants g JOIN users u ON u.id = g.user_id ORDER BY u.email')
      .all<{ email: string; product_id: string; source: string }>()
      .then(({ results }) => expect(results).toEqual([
        { email: 'second@example.com', product_id: '*', source: 'beta' },
        { email: 'tester@example.com', product_id: '*', source: 'beta' },
      ]));
  });

  it('refuses addresses that are not plain emails', () => {
    expect(() => buildBetaSeedSql(["x'); DROP TABLE users; --@a.b"], 1)).toThrow();
  });
});
