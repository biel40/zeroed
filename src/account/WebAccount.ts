import { isProductId, type ProductId } from '../config/products';
import type { EntitlementProvider } from '../entitlements/EntitlementProvider';
import type { Language } from '../i18n/i18n';
import type { AccountBackend, LoginRequestOutcome } from './AccountApi';

export type AccountStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoginCompletion = 'signed-in' | 'invalid-link' | 'unavailable';

/** A login request either mails a link or, for a local tester, signs in at once. */
export type LoginAttempt = LoginRequestOutcome | 'signed-in';

/** Issues a login token without mailing a link; only local development provides one. */
export interface LocalLogin {
  loginTokenFor(email: string): string | null;
}

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
    private readonly localLogin: LocalLogin | null = null,
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

  /** Never rejects. */
  public async requestLogin(email: string, language: Language): Promise<LoginAttempt> {
    const localToken = this.localLogin?.loginTokenFor(email) ?? null;
    if (!localToken) return this.api.requestLogin(email, language);
    return (await this.completeLogin(localToken)) === 'signed-in' ? 'signed-in' : 'unavailable';
  }

  /** Never rejects. A signed-in account whose products could not load yet owns none until the next refresh. */
  public async completeLogin(loginToken: string): Promise<LoginCompletion> {
    let session;
    try {
      session = await this.api.verifyLogin(loginToken);
    } catch {
      return 'unavailable';
    }
    if (!session) return 'invalid-link';
    this.update({ sessionToken: session.token, email: session.email, products: [], beta: false });
    await this.refresh();
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
