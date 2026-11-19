import type { LoginRequestOutcome } from '../account/AccountApi';
import type { GoogleSignInButton } from '../account/GoogleIdentityButton';
import type { GoogleSignIn, LoginCompletion, PasswordChange, PasswordSignIn, Registration } from '../account/WebAccount';
import { setTranslatedText, t, type TranslationKey } from '../i18n/i18n';

/** What the dialog needs from the player's account; `main.ts` supplies it. */
export interface MapUnlockAccount {
  getEmail(): string | null;
  register(email: string, password: string): Promise<Registration>;
  signInWithPassword(email: string, password: string): Promise<PasswordSignIn>;
  signInWithGoogle(credential: string): Promise<GoogleSignIn>;
  changePassword(password: string): Promise<PasswordChange>;
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
  /** Everything for signing in or choosing a password, hidden while just showing the account. */
  readonly signInFields: HTMLElement;
  /** Google's button and the divider below it. */
  readonly googleField: HTMLElement;
  readonly googleButton: HTMLElement;
  readonly emailField: HTMLElement;
  readonly email: HTMLInputElement;
  readonly password: HTMLInputElement;
  /** Length rule, shown when choosing a password. */
  readonly passwordHint: HTMLElement;
  readonly confirmField: HTMLElement;
  readonly confirmPassword: HTMLInputElement;
  readonly forgotButton: HTMLButtonElement;
  /** Switches between signing in and creating an account. */
  readonly modeButton: HTMLButtonElement;
  readonly message: HTMLElement;
  readonly cancelButton: HTMLElement;
  readonly submitButton: HTMLButtonElement;
  readonly signOutButton: HTMLButtonElement;
}

type Mode = 'account' | 'sign-in' | 'register' | 'new-password';
type Outcome = Registration | PasswordSignIn | GoogleSignIn | PasswordChange | LoginRequestOutcome;
/** An expired session while changing the password signs out and closes, like signing out. */
type Failure = Exclude<Outcome, 'signed-in' | 'changed' | 'sent' | 'signed-out'>;

const FAILURE_MESSAGES: Readonly<Record<Failure, TranslationKey>> = {
  'invalid-email': 'account.invalidEmail',
  'weak-password': 'account.weakPassword',
  'wrong-password': 'account.wrongPassword',
  'no-account': 'account.noAccount',
  exists: 'account.exists',
  'rate-limited': 'account.rateLimited',
  rejected: 'account.googleRejected',
  unavailable: 'account.unavailable',
};

const SUBMIT_LABELS: Readonly<Record<Exclude<Mode, 'account'>, TranslationKey>> = {
  'sign-in': 'account.signInSubmit',
  register: 'account.registerSubmit',
  'new-password': 'account.savePassword',
};

/**
 * Opened from a locked map card or the menu's account button. Signed out, it
 * signs in with Google or with email and password, or creates an account with
 * a confirmed password, and closes; a forgotten password gets a mailed
 * recovery link, after which `openNewPassword` asks for a new one, or
 * `openRecoveryFailed` explains why the link did not work. Signed in,
 * it names the account (and, for a map, that it is not owned) and offers to
 * sign out. Access rules stay in the account.
 */
export class MapUnlockDialog {
  private account: MapUnlockAccount | null = null;
  private onAccountChanged: () => void = () => undefined;
  private busy = false;
  private mode: Mode = 'sign-in';
  private mapNameKey: TranslationKey | null = null;

  public constructor(private readonly view: MapUnlockElements) {
    view.form.onsubmit = (event) => {
      event.preventDefault();
      void this.submit();
    };
    view.cancelButton.onclick = () => view.dialog.close();
    view.forgotButton.onclick = () => void this.requestRecovery();
    view.modeButton.onclick = () => this.switchMode(this.mode === 'register' ? 'sign-in' : 'register');
    view.signOutButton.onclick = () => void this.signOut();
  }

  public setAccount(account: MapUnlockAccount, onAccountChanged: () => void): void {
    this.account = account;
    this.onAccountChanged = onAccountChanged;
  }

  /** `mapNameKey` is the locked map, or null when opened from the account button. */
  public open(mapNameKey: TranslationKey | null): void {
    this.mapNameKey = mapNameKey;
    this.show(this.account?.getEmail() ? 'account' : 'sign-in');
  }

  /** Asks the signed-in player for a new password, e.g. after opening a recovery link. */
  public openNewPassword(): void {
    if (!this.account?.getEmail()) return;
    this.mapNameKey = null;
    this.show('new-password');
  }

  /** Explains why a recovery link did not sign the player in, so they can ask for another. */
  public openRecoveryFailed(reason: Exclude<LoginCompletion, 'signed-in'>): void {
    this.open(null);
    setTranslatedText(this.view.message, reason === 'invalid-link' ? 'account.linkInvalid' : 'account.unavailable');
  }

  private show(mode: Mode): void {
    const { view } = this;
    view.email.value = '';
    this.render(mode);
    if (!view.dialog.open) view.dialog.showModal();
  }

  /** Keeps the typed address, e.g. when signing in finds no account. */
  private switchMode(mode: 'sign-in' | 'register'): void {
    if (!this.busy) this.render(mode);
  }

  private render(mode: Mode): void {
    const { view, mapNameKey } = this;
    const email = this.account?.getEmail() ?? null;
    const choosingPassword = mode === 'register' || mode === 'new-password';
    this.mode = mode;

    setTranslatedText(view.mapName, mapNameKey ?? MapUnlockDialog.titleOf(mode));
    view.kicker.classList.toggle('hidden', mapNameKey === null);
    if (mode === 'account' && email) this.setText(view.hint, t(mapNameKey ? 'account.notOwned' : 'account.signedInAs', { email }));
    else if (mode === 'new-password' && email) this.setText(view.hint, t('account.newPasswordHint', { email }));
    else if (mode === 'register') setTranslatedText(view.hint, 'account.registerHint');
    else setTranslatedText(view.hint, mapNameKey ? 'account.unlockHint' : 'account.signInHint');

    view.signInFields.classList.toggle('hidden', mode === 'account');
    view.emailField.classList.toggle('hidden', mode === 'new-password');
    view.email.required = mode === 'sign-in' || mode === 'register';
    view.password.required = mode !== 'account';
    view.password.autocomplete = choosingPassword ? 'new-password' : 'current-password';
    view.passwordHint.classList.toggle('hidden', !choosingPassword);
    view.confirmField.classList.toggle('hidden', !choosingPassword);
    view.confirmPassword.required = choosingPassword;
    view.forgotButton.classList.toggle('hidden', mode !== 'sign-in');
    view.modeButton.classList.toggle('hidden', mode !== 'sign-in' && mode !== 'register');
    setTranslatedText(view.modeButton, mode === 'register' ? 'account.haveAccount' : 'account.noAccountYet');
    view.submitButton.classList.toggle('hidden', mode === 'account');
    if (mode !== 'account') setTranslatedText(view.submitButton, SUBMIT_LABELS[mode]);
    view.signOutButton.classList.toggle('hidden', mode !== 'account');

    view.password.value = '';
    view.confirmPassword.value = '';
    this.setText(view.message, '');
    this.showGoogle(mode === 'sign-in' || mode === 'register' ? this.account?.google ?? null : null);
  }

  private showGoogle(google: GoogleSignInButton | null): void {
    const { googleField, googleButton } = this.view;
    googleField.classList.toggle('hidden', google === null);
    if (!google) return;
    void google.render(googleButton, (credential) => void this.signInWithGoogle(credential))
      .then((shown) => googleField.classList.toggle('hidden', !shown || this.account?.getEmail() != null));
  }

  private async submit(): Promise<void> {
    const { view, mode } = this;
    const email = view.email.value.trim().toLowerCase();
    const password = view.password.value;
    if ((mode === 'register' || mode === 'new-password') && password !== view.confirmPassword.value) {
      setTranslatedText(view.message, 'account.passwordMismatch');
      return;
    }
    const outcome = await this.run('account.signingIn', (account) => {
      if (mode === 'register') return account.register(email, password);
      if (mode === 'new-password') return account.changePassword(password);
      return account.signInWithPassword(email, password);
    });
    // Point the player to the other form, keeping the address they typed.
    if (outcome === 'no-account') this.switchToOther('register', outcome);
    else if (outcome === 'exists') this.switchToOther('sign-in', outcome);
  }

  private switchToOther(mode: 'sign-in' | 'register', reason: 'no-account' | 'exists'): void {
    this.switchMode(mode);
    setTranslatedText(this.view.message, FAILURE_MESSAGES[reason]);
  }

  private async signInWithGoogle(credential: string): Promise<void> {
    await this.run('account.signingIn', (account) => account.signInWithGoogle(credential));
  }

  private async requestRecovery(): Promise<void> {
    const email = this.view.email.value.trim().toLowerCase();
    const outcome = await this.run('account.sending', (account) => account.requestRecovery(email));
    if (outcome === 'sent') this.setText(this.view.message, t('account.recoverySent', { email }));
  }

  /** One request at a time; success closes the dialog, a failure is explained. */
  private async run<T extends Outcome>(pendingKey: TranslationKey, request: (account: MapUnlockAccount) => Promise<T>): Promise<T | null> {
    const { account, view } = this;
    if (!account || this.busy) return null;
    this.setBusy(true);
    setTranslatedText(view.message, pendingKey);
    const outcome = await request(account);
    this.setBusy(false);
    if (outcome === 'signed-in' || outcome === 'signed-out') this.closeAfterAccountChange();
    else if (outcome === 'changed') view.dialog.close();
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
    const { view } = this;
    this.busy = busy;
    for (const button of [view.submitButton, view.forgotButton, view.modeButton, view.signOutButton]) button.disabled = busy;
  }

  /** Parameterized texts are set once; the dialog is reopened, not kept, across language changes. */
  private setText(element: HTMLElement, text: string): void {
    delete element.dataset.i18n;
    element.textContent = text;
  }

  private static titleOf(mode: Mode): TranslationKey {
    if (mode === 'register') return 'account.registerTitle';
    if (mode === 'new-password') return 'account.newPasswordTitle';
    return 'account.title';
  }
}
