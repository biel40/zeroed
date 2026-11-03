import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { AccountService, type AuthenticatedSession } from './AccountService';
import { AccountStore } from './AccountStore';
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
    // Cloudflare sets this header on every request; it only feeds the rate limit, hashed.
    const requester = c.req.header('cf-connecting-ip') ?? 'unknown';
    const result = await accounts.requestLogin(body.email, requester, toEmailLanguage(body.language));
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

  app.use('/me/*', async (c, next) => {
    const session = await authenticate(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    c.set('session', session);
    return next();
  });

  app.get('/me/entitlements', async (c) => c.json(await accounts.getEntitlements(c.get('session'))));

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

async function readJsonObject(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
