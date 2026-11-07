import type { LoginRequestOutcome } from '../account/AccountApi';
import type { GoogleSignInButton } from '../account/GoogleIdentityButton';
import type { GoogleSignIn, PasswordSignIn } from '../account/WebAccount';
import { setTranslatedText, t, type TranslationKey } from '../i18n/i18n';

/** What the dialog needs from the player's account; `main.ts` supplies it. */
export interface MapUnlockAccount {
  getEmail(): string | null;
  signInWithPassword(email: string, password: string): Promise<PasswordSignIn>;
  signInWithGoogle(credential: string): Promise<GoogleSignIn>;
  /** Mails a link for a forgotten password. */
  requestRecovery(email: string): Promise<LoginRequestOutcome>;
  signOut(): Promise<void>;
  /** Null where Google sign-in is not offered (not configured, or inside the apps). */
  readonly google: GoogleSignInButton | null;
}

export interface MapUnlockElements {
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  /** "Locked map" label, hidden when opened from the account button. */
  readonly kicker: HTMLElement;
  readonly mapName: HTMLElement;
  readonly hint: HTMLElement;
  /** Everything for signing in, hidden while signed in. */
  readonly signInFields: HTMLElement;
  /** Google's button and the divider below it. */
  readonly googleField: HTMLElement;
  readonly googleButton: HTMLElement;
  readonly email: HTMLInputElement;
  readonly password: HTMLInputElement;
  readonly forgotButton: HTMLButtonElement;
  readonly message: HTMLElement;
  readonly cancelButton: HTMLElement;
  readonly submitButton: HTMLButtonElement;
  readonly signOutButton: HTMLButtonElement;
}

type Failure = Exclude<PasswordSignIn | GoogleSignIn | LoginRequestOutcome, 'signed-in' | 'sent'>;

const FAILURE_MESSAGES: Readonly<Record<Failure, TranslationKey>> = {
  'invalid-email': 'account.invalidEmail',
  'weak-password': 'account.weakPassword',
  'wrong-password': 'account.wrongPassword',
  'rate-limited': 'account.rateLimited',
  rejected: 'account.googleRejected',
  unavailable: 'account.unavailable',
};

/**
 * Opened from a locked map card or the menu's account button. Signed out, it
 * signs in with Google or with email and password (the first password used
 * with an address creates its account) and closes; a forgotten password gets
 * a mailed recovery link. Signed in, it names the account (and, for a map,
 * that it is not owned) and offers to sign out. Access rules stay in the account.
 */
export class MapUnlockDialog {
  private account: MapUnlockAccount | null = null;
  private onAccountChanged: () => void = () => undefined;
  private busy = false;

  public constructor(private readonly view: MapUnlockElements) {
    view.form.onsubmit = (event) => {
      event.preventDefault();
      void this.submit();
    };
    view.cancelButton.onclick = () => view.dialog.close();
    view.forgotButton.onclick = () => void this.requestRecovery();
    view.signOutButton.onclick = () => void this.signOut();
  }

  public setAccount(account: MapUnlockAccount, onAccountChanged: () => void): void {
    this.account = account;
    this.onAccountChanged = onAccountChanged;
  }

  /** `mapNameKey` is the locked map, or null when opened from the account button. */
  public open(mapNameKey: TranslationKey | null): void {
    const { view } = this;
    const email = this.account?.getEmail() ?? null;
    setTranslatedText(view.mapName, mapNameKey ?? 'account.title');
    view.kicker.classList.toggle('hidden', mapNameKey === null);
    if (email) this.setText(view.hint, t(mapNameKey ? 'account.notOwned' : 'account.signedInAs', { email }));
    else setTranslatedText(view.hint, mapNameKey ? 'account.unlockHint' : 'account.signInHint');
    view.signInFields.classList.toggle('hidden', email !== null);
    view.submitButton.classList.toggle('hidden', email !== null);
    view.signOutButton.classList.toggle('hidden', email === null);
    view.email.value = '';
    view.password.value = '';
    this.setText(view.message, '');
    this.showGoogle(email === null ? this.account?.google ?? null : null);
    if (!view.dialog.open) view.dialog.showModal();
  }

  private showGoogle(google: GoogleSignInButton | null): void {
    const { googleField, googleButton } = this.view;
    googleField.classList.toggle('hidden', google === null);
    if (!google) return;
    void google.render(googleButton, (credential) => void this.signInWithGoogle(credential))
      .then((shown) => googleField.classList.toggle('hidden', !shown || this.account?.getEmail() != null));
  }

  private async submit(): Promise<void> {
    const { view } = this;
    const email = view.email.value.trim().toLowerCase();
    const password = view.password.value;
    await this.run('account.signingIn', (account) => account.signInWithPassword(email, password));
  }

  private async signInWithGoogle(credential: string): Promise<void> {
    await this.run('account.signingIn', (account) => account.signInWithGoogle(credential));
  }

  private async requestRecovery(): Promise<void> {
    const email = this.view.email.value.trim().toLowerCase();
    const outcome = await this.run('account.sending', (account) => account.requestRecovery(email));
    if (outcome === 'sent') this.setText(this.view.message, t('account.recoverySent', { email }));
  }

  /** One request at a time; a sign-in closes the dialog, a failure is explained. */
  private async run<T extends PasswordSignIn | GoogleSignIn | LoginRequestOutcome>(
    pendingKey: TranslationKey,
    request: (account: MapUnlockAccount) => Promise<T>,
  ): Promise<T | null> {
    const { account, view } = this;
    if (!account || this.busy) return null;
    this.setBusy(true);
    setTranslatedText(view.message, pendingKey);
    const outcome = await request(account);
    this.setBusy(false);
    if (outcome === 'signed-in') this.closeAfterAccountChange();
    else if (outcome !== 'sent') setTranslatedText(view.message, FAILURE_MESSAGES[outcome as Failure]);
    return outcome;
  }

  private async signOut(): Promise<void> {
    if (!this.account || this.busy) return;
    this.setBusy(true);
    await this.account.signOut();
    this.setBusy(false);
    this.closeAfterAccountChange();
  }

  private closeAfterAccountChange(): void {
    this.view.dialog.close();
    this.onAccountChanged();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.view.submitButton.disabled = busy;
    this.view.forgotButton.disabled = busy;
    this.view.signOutButton.disabled = busy;
  }

  /** Parameterized texts are set once; the dialog is reopened, not kept, across language changes. */
  private setText(element: HTMLElement, text: string): void {
    delete element.dataset.i18n;
    element.textContent = text;
  }
}
