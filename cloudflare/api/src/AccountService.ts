import { PRODUCT_IDS, type ProductId } from '../../../src/config/products';
import type { AccountStore, SessionRecord } from './AccountStore';
import { normalizeEmail } from './email';
import { buildLoginEmail, type EmailLanguage } from './loginEmail';
import type { LoginMailer } from './LoginMailer';
import { generateId, generateToken, hashSecret, type RandomBytes } from './tokens';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const LOGIN_LINK_MINUTES = 15;
const RATE_WINDOW_MS = 60 * MINUTE_MS;
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_REQUESTER = 20;
const SESSION_TTL_MS = 90 * DAY_MS;

/** Active sessions slide forward, but at most one write per session per day. */
const SESSION_RENEWAL_INTERVAL_MS = DAY_MS;
/** A grant for every premium product, present and future. */
const ALL_PREMIUM = '*';

export type LoginRequestResult = 'sent' | 'invalid-email' | 'rate-limited' | 'mail-failed';

export interface IssuedSession {
  readonly token: string;
  readonly email: string;
  readonly expiresAt: number;
}

export interface AuthenticatedSession extends SessionRecord {
  readonly tokenHash: string;
}

export interface Entitlements {
  readonly email: string;
  readonly products: ProductId[];
  /** A closed-beta tester; the game thanks them on sign-in. */
  readonly beta: boolean;
}

export interface AccountServiceOptions {
  readonly store: AccountStore;
  readonly mailer: LoginMailer;
  readonly now: () => number;
  readonly randomBytes: RandomBytes;
  /** The game's origin; login links open `${appUrl}/#login=<token>` so the token never reaches its server logs. */
  readonly appUrl: string;
}

/** Passwordless web accounts: magic-link sign-in, bearer sessions and entitlement lookup. */
export class AccountService {
  public constructor(private readonly options: AccountServiceOptions) {}

  /** A mail failure is reported so the player can retry; its unused link simply expires. */
  public async requestLogin(rawEmail: unknown, requester: string, language: EmailLanguage): Promise<LoginRequestResult> {
    const email = normalizeEmail(rawEmail);
    if (!email) return 'invalid-email';

    const { store, now: clock, randomBytes, appUrl, mailer } = this.options;
    const now = clock();
    const requesterHash = await hashSecret(requester);
    const recent = await store.countLoginRequestsSince(email, requesterHash, now - RATE_WINDOW_MS);
    if (recent.byEmail >= MAX_REQUESTS_PER_EMAIL || recent.byRequester >= MAX_REQUESTS_PER_REQUESTER) return 'rate-limited';

    const token = generateToken(randomBytes);
    await store.saveLoginToken({
      tokenHash: await hashSecret(token),
      email,
      requesterHash,
      createdAt: now,
      expiresAt: now + LOGIN_LINK_MINUTES * MINUTE_MS,
    });
    try {
      await mailer.send(buildLoginEmail(email, `${appUrl}/#login=${token}`, LOGIN_LINK_MINUTES, language));
      return 'sent';
    } catch (error) {
      console.error('Login email failed', error);
      return 'mail-failed';
    }
  }

  /** Exchanges a login link token for a session; null when the link is unknown, used or expired. */
  public async verifyLogin(loginToken: string): Promise<IssuedSession | null> {
    const { store, now: clock, randomBytes } = this.options;
    const now = clock();
    const email = await store.consumeLoginToken(await hashSecret(loginToken), now);
    if (!email) return null;

    const userId = await store.upsertUser(email, generateId(randomBytes), now);
    const token = generateToken(randomBytes);
    const expiresAt = now + SESSION_TTL_MS;
    await store.createSession(await hashSecret(token), userId, now, expiresAt);
    return { token, email, expiresAt };
  }

  public async authenticate(sessionToken: string): Promise<AuthenticatedSession | null> {
    const { store, now: clock } = this.options;
    const now = clock();
    const tokenHash = await hashSecret(sessionToken);
    const session = await store.findSession(tokenHash, now);
    if (!session) return null;

    const renewedExpiry = now + SESSION_TTL_MS;
    if (renewedExpiry - session.expiresAt < SESSION_RENEWAL_INTERVAL_MS) return { ...session, tokenHash };
    await store.extendSession(tokenHash, renewedExpiry);
    return { ...session, expiresAt: renewedExpiry, tokenHash };
  }

  public async logout(session: AuthenticatedSession): Promise<void> {
    await this.options.store.deleteSession(session.tokenHash);
  }

  /** Known products only, in catalog order; grants for products this build does not sell are ignored. */
  public async getEntitlements(session: AuthenticatedSession): Promise<Entitlements> {
    const grants = await this.options.store.listActiveGrants(session.userId);
    const granted = new Set(grants.map((grant) => grant.productId));
    const products = PRODUCT_IDS.filter((product) => granted.has(ALL_PREMIUM) || granted.has(product));
    return { email: session.email, products, beta: grants.some((grant) => grant.source === 'beta') };
  }
}
