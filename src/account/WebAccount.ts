import { isProductId, type ProductId } from '../config/products';
import type { EntitlementProvider } from '../entitlements/EntitlementProvider';
import type { Language } from '../i18n/i18n';
import type { AccountBackend, IssuedSession, LoginRequestOutcome, RegistrationRejection, SignInRejection } from './AccountApi';

export type AccountStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoginCompletion = 'signed-in' | 'invalid-link' | 'unavailable';
export type Registration = 'signed-in' | RegistrationRejection | 'unavailable';
export type PasswordSignIn = 'signed-in' | SignInRejection | 'unavailable';
export type GoogleSignIn = 'signed-in' | 'rejected' | 'unavailable';
/** `signed-out`: the session had expired, so the player must sign in again. */
export type PasswordChange = 'changed' | 'weak-password' | 'signed-out' | 'unavailable';

interface SavedAccount {
  readonly sessionToken: string;
  readonly email: string;
  readonly products: readonly ProductId[];
  readonly beta: boolean;
}

const STORAGE_KEY = 'zeroed.account';

/**
 * The web player's account and its premium products. The last known products
 * are remembered so menus answer synchronously and installed copies keep
 * premium maps offline; `refresh` replaces them with the server's answer.
 */
export class WebAccount implements EntitlementProvider {
  private saved: SavedAccount | null;

  public constructor(
    private readonly api: AccountBackend,
    private readonly storage: AccountStorage | undefined,
  ) {
    this.saved = this.load();
  }

  public owns(product: ProductId): boolean {
    return this.saved?.products.includes(product) ?? false;
  }

  public getEmail(): string | null {
    return this.saved?.email ?? null;
  }

  public isBetaTester(): boolean {
    return this.saved?.beta ?? false;
  }

  /** Never rejects. Creates the account and signs it in. */
  public register(email: string, password: string): Promise<Registration> {
    return this.startSession(() => this.api.register(email, password));
  }

  /** Never rejects. */
  public signInWithPassword(email: string, password: string): Promise<PasswordSignIn> {
    return this.startSession(() => this.api.signInWithPassword(email, password));
  }

  /** Never rejects. */
  public signInWithGoogle(credential: string): Promise<GoogleSignIn> {
    return this.startSession(async () => (await this.api.signInWithGoogle(credential)) ?? 'rejected');
  }

  /** Never rejects. Sets a new password for the signed-in account. */
  public async changePassword(password: string): Promise<PasswordChange> {
    const saved = this.saved;
    if (!saved) return 'signed-out';
    let result;
    try {
      result = await this.api.changePassword(saved.sessionToken, password);
    } catch {
      return 'unavailable';
    }
    if (result !== null) return result;
    if (this.saved === saved) this.update(null);
    return 'signed-out';
  }

  /** Never rejects. Mails a recovery link for a forgotten password. */
  public requestLogin(email: string, language: Language): Promise<LoginRequestOutcome> {
    return this.api.requestLogin(email, language);
  }

  /** Never rejects. Signs in from an opened recovery link. */
  public async completeLogin(loginToken: string): Promise<LoginCompletion> {
    let session;
    try {
      session = await this.api.verifyLogin(loginToken);
    } catch {
      return 'unavailable';
    }
    if (!session) return 'invalid-link';
    await this.adopt(session);
    return 'signed-in';
  }

  /** Never rejects: offline keeps the remembered products, a rejected session signs out. */
  public async refresh(): Promise<void> {
    const saved = this.saved;
    if (!saved) return;
    try {
      const entitlements = await this.api.fetchEntitlements(saved.sessionToken);
      if (this.saved !== saved) return;
      this.update(entitlements ? { ...entitlements, sessionToken: saved.sessionToken } : null);
    } catch {
      // Keep the last known products.
    }
  }

  /** Signs out on this device even when the server cannot be told. */
  public async signOut(): Promise<void> {
    const saved = this.saved;
    this.update(null);
    if (!saved) return;
    try {
      await this.api.logout(saved.sessionToken);
    } catch {
      // The server session simply expires.
    }
  }

  /** Adopts the session a request returns; a string is the server's reason for refusing. */
  private async startSession<Rejection extends string>(
    request: () => Promise<IssuedSession | Rejection>,
  ): Promise<'signed-in' | Rejection | 'unavailable'> {
    let result;
    try {
      result = await request();
    } catch {
      return 'unavailable';
    }
    if (typeof result === 'string') return result;
    await this.adopt(result);
    return 'signed-in';
  }

  /** A new session owns nothing until its products load; if they cannot, until the next refresh. */
  private async adopt(session: IssuedSession): Promise<void> {
    this.update({ sessionToken: session.token, email: session.email, products: [], beta: false });
    await this.refresh();
  }

  private update(account: SavedAccount | null): void {
    this.saved = account;
    try {
      if (account) this.storage?.setItem(STORAGE_KEY, JSON.stringify(account));
      else this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Without storage the account lasts until the page closes.
    }
  }

  private load(): SavedAccount | null {
    try {
      const value: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null');
      if (!value || typeof value !== 'object') return null;
      const { sessionToken, email, products, beta } = value as Record<string, unknown>;
      if (typeof sessionToken !== 'string' || typeof email !== 'string' || !Array.isArray(products)) return null;
      return { sessionToken, email, products: products.filter(isProductId), beta: beta === true };
    } catch {
      return null;
    }
  }
}
