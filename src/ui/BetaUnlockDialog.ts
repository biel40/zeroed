import { setTranslatedText, type TranslationKey } from '../i18n/i18n';

/**
 * Email prompt opened from a locked map card. The access rule stays outside:
 * `acceptEmail` decides (and may throw when the session cannot be saved), and
 * this view only shows the result and reports an accepted email once.
 */
export class BetaUnlockDialog {
  private acceptEmail: (email: string) => boolean = () => {
    throw new Error('Beta access unavailable');
  };
  private onUnlock: ((email: string) => void) | null = null;

  public constructor(
    private readonly dialog: HTMLDialogElement,
    form: HTMLFormElement,
    private readonly email: HTMLInputElement,
    private readonly message: HTMLElement,
    private readonly mapName: HTMLElement,
    cancelButton: HTMLElement,
  ) {
    form.onsubmit = (event) => {
      event.preventDefault();
      this.submit();
    };
    cancelButton.onclick = () => this.dialog.close();
    // Cancel, Escape and a successful unlock all leave through `close`.
    this.dialog.addEventListener('close', () => {
      this.onUnlock = null;
    });
  }

  public setAcceptEmail(acceptEmail: (email: string) => boolean): void {
    this.acceptEmail = acceptEmail;
  }

  public open(mapNameKey: TranslationKey, onUnlock: (email: string) => void): void {
    this.onUnlock = onUnlock;
    setTranslatedText(this.mapName, mapNameKey);
    this.email.value = '';
    this.clearMessage();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private submit(): void {
    const onUnlock = this.onUnlock;
    if (!onUnlock) return;
    const email = this.email.value;
    try {
      if (!this.acceptEmail(email)) {
        setTranslatedText(this.message, 'beta.denied');
        return;
      }
    } catch {
      setTranslatedText(this.message, 'beta.unavailable');
      return;
    }
    this.email.value = '';
    this.clearMessage();
    this.dialog.close();
    onUnlock(email);
  }

  private clearMessage(): void {
    delete this.message.dataset.i18n;
    this.message.textContent = '';
  }
}
