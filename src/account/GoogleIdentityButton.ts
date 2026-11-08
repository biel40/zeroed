/** Draws a "Continue with Google" button; lets the sign-in dialog stay independent of Google's script. */
export interface GoogleSignInButton {
  /** Resolves false when Google's script cannot load, e.g. offline or blocked. */
  render(host: HTMLElement, onCredential: (credential: string) => void): Promise<boolean>;
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const MAX_BUTTON_WIDTH = 400;
const FALLBACK_BUTTON_WIDTH = 320;

/** The subset of Google Identity Services (`google.accounts.id`) this game uses. */
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: unknown }) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
  }): void;
  renderButton(host: HTMLElement, options: Record<string, string | number>): void;
}

/**
 * Google Identity Services button, web only: Google refuses sign-in inside
 * app web views. Its script loads the first time the button is drawn.
 */
export class GoogleIdentityButton implements GoogleSignInButton {
  private loading: Promise<GoogleAccountsId | null> | null = null;
  private onCredential: ((credential: string) => void) | null = null;

  public constructor(private readonly clientId: string, private readonly locale: () => string) {}

  public async render(host: HTMLElement, onCredential: (credential: string) => void): Promise<boolean> {
    this.onCredential = onCredential;
    const accountsId = await this.load();
    if (!accountsId) return false;
    host.replaceChildren();
    accountsId.renderButton(host, {
      // Google's familiar white pill with the "G" logo, which stands out on the dark dialog.
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'center',
      width: Math.min(MAX_BUTTON_WIDTH, host.clientWidth || FALLBACK_BUTTON_WIDTH),
      locale: this.locale(),
    });
    return true;
  }

  /** A failed load is retried the next time the button is drawn. */
  private load(): Promise<GoogleAccountsId | null> {
    this.loading ??= new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(this.initialize());
      script.onerror = () => {
        script.remove();
        this.loading = null;
        resolve(null);
      };
      document.head.append(script);
    });
    return this.loading;
  }

  private initialize(): GoogleAccountsId | null {
    const accountsId = (window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }).google?.accounts?.id;
    if (!accountsId) return null;
    accountsId.initialize({
      client_id: this.clientId,
      callback: ({ credential }) => {
        if (typeof credential === 'string') this.onCredential?.(credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    return accountsId;
  }
}
