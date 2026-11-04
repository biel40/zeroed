import { PRODUCT_IDS } from '../config/products';
import type { Language } from '../i18n/i18n';
import type { AccountBackend, AccountEntitlements, IssuedSession, LoginRequestOutcome } from './AccountApi';
import type { LocalLogin } from './WebAccount';

/** Testers who sign in at once on a local dev server (`npm run dev`). */
export const LOCAL_TESTER_EMAILS: readonly string[] = ['bielet40@gmail.com'];

/** Login and session tokens share this prefix; the account server never issues it. */
const LOCAL_TOKEN_PREFIX = 'local-tester:';

/**
 * Development-only account backend. Local testers sign in without a mailed
 * link and own every product with the beta badge, all without the account
 * server; anyone else goes to `remote`. `main.ts` loads it only in dev builds.
 */
export class LocalTesterBackend implements AccountBackend, LocalLogin {
  private readonly testers: ReadonlySet<string>;

  public constructor(private readonly remote: AccountBackend, testerEmails: readonly string[]) {
    this.testers = new Set(testerEmails.map(LocalTesterBackend.normalize));
  }

  public loginTokenFor(email: string): string | null {
    const normalized = LocalTesterBackend.normalize(email);
    return this.testers.has(normalized) ? `${LOCAL_TOKEN_PREFIX}${normalized}` : null;
  }

  public requestLogin(email: string, language: Language): Promise<LoginRequestOutcome> {
    return this.remote.requestLogin(email, language);
  }

  public async verifyLogin(loginToken: string): Promise<IssuedSession | null> {
    const email = this.localTesterOf(loginToken);
    return email ? { token: loginToken, email } : this.remote.verifyLogin(loginToken);
  }

  public async fetchEntitlements(sessionToken: string): Promise<AccountEntitlements | null> {
    const email = this.localTesterOf(sessionToken);
    return email ? { email, products: [...PRODUCT_IDS], beta: true } : this.remote.fetchEntitlements(sessionToken);
  }

  public async logout(sessionToken: string): Promise<void> {
    if (!this.localTesterOf(sessionToken)) await this.remote.logout(sessionToken);
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
