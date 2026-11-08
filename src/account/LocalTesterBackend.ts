import { PRODUCT_IDS } from '../config/products';
import type { Language } from '../i18n/i18n';
import type {
  AccountBackend, AccountEntitlements, IssuedSession, LoginRequestOutcome, RegistrationRejection, SignInRejection,
} from './AccountApi';

/** Testers who sign in at once on a local dev server (`npm run dev`). */
export const LOCAL_TESTER_EMAILS: readonly string[] = ['bielet40@gmail.com'];

/** Local session tokens carry this prefix; the account server never issues it. */
const LOCAL_TOKEN_PREFIX = 'local-tester:';

/**
 * Development-only account backend. Local testers sign in or register with
 * any password and own every product with the beta badge, all without the
 * account server; anyone else goes to `remote`. `main.ts` loads it only in dev builds.
 */
export class LocalTesterBackend implements AccountBackend {
  private readonly testers: ReadonlySet<string>;

  public constructor(private readonly remote: AccountBackend, testerEmails: readonly string[]) {
    this.testers = new Set(testerEmails.map(LocalTesterBackend.normalize));
  }

  public async register(email: string, password: string): Promise<IssuedSession | RegistrationRejection> {
    return this.localSessionFor(email) ?? this.remote.register(email, password);
  }

  public async signInWithPassword(email: string, password: string): Promise<IssuedSession | SignInRejection> {
    return this.localSessionFor(email) ?? this.remote.signInWithPassword(email, password);
  }

  /** A local tester's password is never stored, so changing it always succeeds. */
  public async changePassword(sessionToken: string, password: string): Promise<'changed' | 'weak-password' | null> {
    return this.localTesterOf(sessionToken) ? 'changed' : this.remote.changePassword(sessionToken, password);
  }

  public signInWithGoogle(credential: string): Promise<IssuedSession | null> {
    return this.remote.signInWithGoogle(credential);
  }

  public requestLogin(email: string, language: Language): Promise<LoginRequestOutcome> {
    return this.remote.requestLogin(email, language);
  }

  public verifyLogin(loginToken: string): Promise<IssuedSession | null> {
    return this.remote.verifyLogin(loginToken);
  }

  public async fetchEntitlements(sessionToken: string): Promise<AccountEntitlements | null> {
    const email = this.localTesterOf(sessionToken);
    return email ? { email, products: [...PRODUCT_IDS], beta: true } : this.remote.fetchEntitlements(sessionToken);
  }

  public async logout(sessionToken: string): Promise<void> {
    if (!this.localTesterOf(sessionToken)) await this.remote.logout(sessionToken);
  }

  private localSessionFor(email: string): IssuedSession | null {
    const normalized = LocalTesterBackend.normalize(email);
    return this.testers.has(normalized) ? { token: `${LOCAL_TOKEN_PREFIX}${normalized}`, email: normalized } : null;
  }

  private localTesterOf(token: string): string | null {
    if (!token.startsWith(LOCAL_TOKEN_PREFIX)) return null;
    const email = token.slice(LOCAL_TOKEN_PREFIX.length);
    return this.testers.has(email) ? email : null;
  }

  private static normalize(email: string): string {
    return email.trim().toLowerCase();
  }
}
