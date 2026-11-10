import { PRODUCT_IDS, type ProductId } from '../../../src/config/products';
import type { AccountStore, SessionRecord } from './AccountStore';
import { normalizeEmail } from './email';
import type { GoogleIdTokenVerifier } from './googleIdToken';
import { buildLoginEmail, type EmailLanguage } from './loginEmail';
import type { LoginMailer } from './LoginMailer';
import { hashPassword, isAcceptablePassword, verifyPassword } from './passwords';
import { generateId, generateToken, hashSecret, type RandomBytes } from './tokens';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const LOGIN_LINK_MINUTES = 15;
const RATE_WINDOW_MS = 60 * MINUTE_MS;
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_REQUESTER = 20;
const MAX_PASSWORD_FAILURES_PER_EMAIL = 10;
const MAX_PASSWORD_FAILURES_PER_REQUESTER = 30;
const SESSION_TTL_MS = 90 * DAY_MS;

/** Active sessions slide forward, but at most one write per session per day. */
const SESSION_RENEWAL_INTERVAL_MS = DAY_MS;
/** A grant for every premium product, present and future. */
const ALL_PREMIUM = '*';

export type LoginRequestResult = 'sent' | 'invalid-email' | 'rate-limited' | 'mail-failed';

export type PasswordSignInResult = IssuedSession | 'invalid-email' | 'no-account' | 'wrong-password' | 'rate-limited';
export type RegistrationResult = IssuedSession | 'invalid-email' | 'weak-password' | 'exists';

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
  /** Null when Google sign-in is not configured. */
  readonly google: GoogleIdTokenVerifier | null;
}

/**
 * Web accounts keyed by email: registration, password, Google and
 * recovery-link sign-in, bearer sessions and entitlement lookup. Registering
 * does not verify the address: any address without a password can register,
 * including seeded beta testers who have not signed in yet.
 */
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
      await mailer.send(buildLoginEmail({
        to: email,
        link: `${appUrl}/#login=${token}`,
        expiryMinutes: LOGIN_LINK_MINUTES,
        language,
        appUrl,
      }));
      return 'sent';
    } catch (error) {
      console.error('Login email failed', error);
      return 'mail-failed';
    }
  }

  /** Exchanges a recovery link token for a session; null when the link is unknown, used or expired. */
  public async verifyLogin(loginToken: string): Promise<IssuedSession | null> {
    const { store, now: clock, randomBytes } = this.options;
    const email = await store.consumeLoginToken(await hashSecret(loginToken), clock());
    
    if (!email) {
      return null;
    }
    
    return this.issueSession(await store.upsertUser(email, generateId(randomBytes), clock()), email);
  }

  /** Creates the account, or gives a password to one that has none (seeded, Google or link sign-ins). */
  public async register(rawEmail: unknown, password: unknown): Promise<RegistrationResult> {
    const email = normalizeEmail(rawEmail);
    if (!email) return 'invalid-email';
    if (!isAcceptablePassword(password)) return 'weak-password';

    const { store, now: clock, randomBytes } = this.options;
    const credentials = await store.findCredentials(email);
    if (credentials?.passwordHash) return 'exists';
    const userId = credentials?.userId ?? await store.upsertUser(email, generateId(randomBytes), clock());
    // Another registration may have set the password meanwhile.
    if (!(await store.claimPassword(userId, await hashPassword(password, randomBytes)))) return 'exists';
    return this.issueSession(userId, email);
  }

  /** Unknown addresses and accounts without a password count as failures too, so guessing either is rate limited. */
  public async signInWithPassword(rawEmail: unknown, password: unknown, requester: string): Promise<PasswordSignInResult> {
    const email = normalizeEmail(rawEmail);
    if (!email) return 'invalid-email';

    const { store, now: clock } = this.options;
    const requesterHash = await hashSecret(requester);
    const failures = await store.countPasswordFailuresSince(email, requesterHash, clock() - RATE_WINDOW_MS);
    if (failures.byEmail >= MAX_PASSWORD_FAILURES_PER_EMAIL || failures.byRequester >= MAX_PASSWORD_FAILURES_PER_REQUESTER) {
      return 'rate-limited';
    }

    const credentials = await store.findCredentials(email);
    if (credentials?.passwordHash && typeof password === 'string' && await verifyPassword(password, credentials.passwordHash)) {
      return this.issueSession(credentials.userId, email);
    }
    await store.recordPasswordFailure(email, requesterHash, clock());
    return credentials?.passwordHash ? 'wrong-password' : 'no-account';
  }

  /** Sets a new password for a signed-in account, e.g. after a recovery link; false when it is not acceptable. */
  public async changePassword(session: AuthenticatedSession, password: unknown): Promise<boolean> {
    if (!isAcceptablePassword(password)) return false;
    const { store, randomBytes } = this.options;
    await store.setPassword(session.userId, await hashPassword(password, randomBytes));
    return true;
  }

  /** 'unconfigured' without a Google client id; null for a credential Google did not issue to this game. */
  public async signInWithGoogle(credential: unknown): Promise<IssuedSession | null | 'unconfigured'> {
    const { google, store, now: clock, randomBytes } = this.options;
    if (!google) return 'unconfigured';
    const email = await google.verify(credential);
    if (!email) return null;
    return this.issueSession(await store.upsertUser(email, generateId(randomBytes), clock()), email);
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

  private async issueSession(userId: string, email: string): Promise<IssuedSession> {
    const { store, now: clock, randomBytes } = this.options;
    const now = clock();
    const token = generateToken(randomBytes);
    const expiresAt = now + SESSION_TTL_MS;
    await store.createSession(await hashSecret(token), userId, now, expiresAt);
    return { token, email, expiresAt };
  }

  /** Known products only, in catalog order; grants for products this build does not sell are ignored. */
  public async getEntitlements(session: AuthenticatedSession): Promise<Entitlements> {
    const grants = await this.options.store.listActiveGrants(session.userId);
    const granted = new Set(grants.map((grant) => grant.productId));
    const products = PRODUCT_IDS.filter((product) => granted.has(ALL_PREMIUM) || granted.has(product));
    return { email: session.email, products, beta: grants.some((grant) => grant.source === 'beta') };
  }
}
