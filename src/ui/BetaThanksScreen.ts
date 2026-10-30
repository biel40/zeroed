/**
 * Thank-you card shown once a closed-beta email is accepted. Its texts live in
 * the markup (`data-i18n`); this view only fills the tester's email and reports
 * when the player leaves, whether by the button or Escape.
 */
export class BetaThanksScreen {
  private onClose: (() => void) | null = null;

  public constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly email: HTMLElement,
    closeButton: HTMLElement,
  ) {
    closeButton.onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => {
      const onClose = this.onClose;
      this.onClose = null;
      onClose?.();
    });
  }

  public show(email: string, onClose: () => void): void {
    this.onClose = onClose;
    this.email.textContent = email.trim().toLowerCase();
    if (!this.dialog.open) this.dialog.showModal();
  }
}
