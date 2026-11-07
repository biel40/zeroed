import { AccountStore } from './AccountStore';
import { createAccountApp } from './app';
import { GoogleCertsKeySource, GoogleIdTokenVerifier } from './googleIdToken';
import { ConsoleMailer, ResendMailer, type LoginMailer } from './LoginMailer';
import type { SqlDatabase } from './SqlDatabase';

/** Bindings and variables from `wrangler.jsonc`; `.dev.vars` overrides them locally. */
interface Env {
  readonly DB: SqlDatabase;
  readonly APP_URL: string;
  /** Comma-separated origins allowed to call the API from a browser. */
  readonly ALLOWED_ORIGINS: string;
  readonly EMAIL_FROM: string;
  /** `console` prints login links instead of sending them; local development only. */
  readonly MAIL_TRANSPORT?: string;
  /** Secret, set with `wrangler secret put RESEND_API_KEY`. */
  readonly RESEND_API_KEY?: string;
  /** OAuth web client id from Google Cloud Console; empty disables Google sign-in. */
  readonly GOOGLE_CLIENT_ID?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function createMailer(env: Env): LoginMailer {
  if (env.MAIL_TRANSPORT === 'console') return new ConsoleMailer();
  // A missing key fails only login requests, not entitlement reads.
  return new ResendMailer(env.RESEND_API_KEY ?? '', env.EMAIL_FROM);
}

/** Module scope so warm isolates reuse Google's keys between requests. */
const googleKeys = new GoogleCertsKeySource(Date.now);

function createGoogleVerifier(env: Env): GoogleIdTokenVerifier | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  return clientId ? new GoogleIdTokenVerifier(clientId, googleKeys, Date.now) : null;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const app = createAccountApp({
      database: env.DB,
      mailer: createMailer(env),
      now: Date.now,
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      appUrl: env.APP_URL,
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
      google: createGoogleVerifier(env),
    });
    return app.fetch(request);
  },

  /** Daily cron from `wrangler.jsonc`. */
  scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(new AccountStore(env.DB).purgeExpired(Date.now()));
  },
};
