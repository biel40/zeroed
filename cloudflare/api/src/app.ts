import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { AccountService, type AuthenticatedSession } from './AccountService';
import { AccountStore } from './AccountStore';
import type { GoogleIdTokenVerifier } from './googleIdToken';
import { toEmailLanguage } from './loginEmail';
import type { LoginMailer } from './LoginMailer';
import type { SqlDatabase } from './SqlDatabase';
import type { RandomBytes } from './tokens';

export interface AccountAppOptions {
  readonly database: SqlDatabase;
  readonly mailer: LoginMailer;
  readonly now: () => number;
  readonly randomBytes: RandomBytes;
  readonly appUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly google: GoogleIdTokenVerifier | null;
}

type AppEnv = { Variables: { session: AuthenticatedSession } };

const BEARER_PREFIX = 'Bearer ';

/** HTTP routes of the account API. All state and policy live in `AccountService`. */
export function createAccountApp(options: AccountAppOptions): Hono<AppEnv> {
  const accounts = new AccountService({
    store: new AccountStore(options.database),
    mailer: options.mailer,
    now: options.now,
    randomBytes: options.randomBytes,
    appUrl: options.appUrl,
    google: options.google,
  });
  const app = new Hono<AppEnv>();

  app.use('*', cors({
    origin: (origin) => (options.allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type'],
    maxAge: 86_400,
  }));

  app.post('/auth/request', async (c) => {
    const body = await readJsonObject(c);
    const result = await accounts.requestLogin(body.email, requesterOf(c), toEmailLanguage(body.language));
    if (result === 'invalid-email') return c.json({ error: 'invalid_email' }, 400);
    if (result === 'rate-limited') return c.json({ error: 'rate_limited' }, 429);
    if (result === 'mail-failed') return c.json({ error: 'email_unavailable' }, 502);
    return c.json({ ok: true }, 202);
  });

  app.post('/auth/verify', async (c) => {
    const { token } = await readJsonObject(c);
    if (typeof token !== 'string' || token.length === 0) return c.json({ error: 'missing_token' }, 400);
    const session = await accounts.verifyLogin(token);
    return session ? c.json(session) : c.json({ error: 'invalid_token' }, 401);
  });

  app.post('/auth/register', async (c) => {
    const { email, password } = await readJsonObject(c);
    const result = await accounts.register(email, password);
    if (result === 'invalid-email') return c.json({ error: 'invalid_email' }, 400);
    if (result === 'weak-password') return c.json({ error: 'weak_password' }, 400);
    if (result === 'exists') return c.json({ error: 'account_exists' }, 409);
    return c.json(result, 201);
  });

  app.post('/auth/password', async (c) => {
    const { email, password } = await readJsonObject(c);
    const result = await accounts.signInWithPassword(email, password, requesterOf(c));
    if (result === 'invalid-email') return c.json({ error: 'invalid_email' }, 400);
    if (result === 'no-account') return c.json({ error: 'no_account' }, 404);
    if (result === 'wrong-password') return c.json({ error: 'wrong_password' }, 401);
    if (result === 'rate-limited') return c.json({ error: 'rate_limited' }, 429);
    return c.json(result);
  });

  app.post('/auth/google', async (c) => {
    const { credential } = await readJsonObject(c);
    let session;
    try {
      session = await accounts.signInWithGoogle(credential);
    } catch (error) {
      console.error('Google sign-in failed', error);
      return c.json({ error: 'google_unavailable' }, 502);
    }
    if (session === 'unconfigured') return c.json({ error: 'google_disabled' }, 404);
    return session ? c.json(session) : c.json({ error: 'invalid_credential' }, 401);
  });

  app.use('/me/*', async (c, next) => {
    const session = await authenticate(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    c.set('session', session);
    return next();
  });

  app.get('/me/entitlements', async (c) => c.json(await accounts.getEntitlements(c.get('session'))));

  app.post('/me/password', async (c) => {
    const { password } = await readJsonObject(c);
    return (await accounts.changePassword(c.get('session'), password)) ? c.body(null, 204) : c.json({ error: 'weak_password' }, 400);
  });

  app.post('/auth/logout', async (c) => {
    const session = await authenticate(c);
    if (session) await accounts.logout(session);
    return c.body(null, 204);
  });

  async function authenticate(c: Context<AppEnv>): Promise<AuthenticatedSession | null> {
    const header = c.req.header('authorization');
    if (!header?.startsWith(BEARER_PREFIX)) return null;
    return accounts.authenticate(header.slice(BEARER_PREFIX.length));
  }

  return app;
}

/** Cloudflare sets this header on every request; it only feeds rate limits, hashed. */
function requesterOf(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

async function readJsonObject(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
