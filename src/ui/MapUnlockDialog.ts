import type { LoginAttempt } from '../account/WebAccount';
import { setTranslatedText, t, type TranslationKey } from '../i18n/i18n';

/** What the dialog needs from the player's account; `main.ts` supplies it. */
export interface MapUnlockAccount {
  getEmail(): string | null;
  requestLogin(email: string): Promise<LoginAttempt>;
  signOut(): Promise<void>;
}

export interface MapUnlockElements {
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  /** "Locked map" label, hidden when opened from the account button. */
  readonly kicker: HTMLElement;
  readonly mapName: HTMLElement;
  readonly hint: HTMLElement;
  readonly emailField: HTMLElement;
  readonly email: HTMLInputElement;
  readonly message: HTMLElement;
  readonly cancelButton: HTMLElement;
  readonly submitButton: HTMLButtonElement;
  readonly signOutButton: HTMLButtonElement;
}

const OUTCOME_MESSAGES: Readonly<Record<Exclude<LoginAttempt, 'sent' | 'signed-in'>, TranslationKey>> = {
  'invalid-email': 'account.invalidEmail',
  'rate-limited': 'account.rateLimited',
  unavailable: 'account.unavailable',
};

/**
 * Opened from a locked map card or the menu's account button. Signed out, it
 * mails a login link; maps unlock when the player opens that link (a local
 * tester is signed in at once and the dialog closes). Signed in,
 * it names the account (and, for a map, that it is not owned) and offers to
 * sign out. Access rules stay in the account.
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
    view.emailField.classList.toggle('hidden', email !== null);
    view.submitButton.classList.toggle('hidden', email !== null);
    view.signOutButton.classList.toggle('hidden', email === null);
    view.email.value = '';
    this.setText(view.message, '');
    if (!view.dialog.open) view.dialog.showModal();
  }

  private async submit(): Promise<void> {
    const { view, account } = this;
    if (!account || this.busy) return;
    const email = view.email.value.trim().toLowerCase();
    this.setBusy(true);
    setTranslatedText(view.message, 'account.sending');
    const outcome = await account.requestLogin(email);
    this.setBusy(false);
    if (outcome === 'signed-in') this.closeAfterAccountChange();
    else if (outcome === 'sent') this.setText(view.message, t('account.sent', { email }));
    else setTranslatedText(view.message, OUTCOME_MESSAGES[outcome]);
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
    this.view.signOutButton.disabled = busy;
  }

  /** Parameterized texts are set once; the dialog is reopened, not kept, across language changes. */
  private setText(element: HTMLElement, text: string): void {
    delete element.dataset.i18n;
    element.textContent = text;
  }
}
