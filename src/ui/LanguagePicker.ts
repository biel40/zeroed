import { getLanguage, isLanguage, onLanguageChange, setLanguage } from '../i18n/i18n';

/**
 * Main-menu language dropdown. The toggle shows the active language's flag
 * and code; each option carries its own inline SVG flag and native name.
 */
export class LanguagePicker {
  private readonly buttons: readonly HTMLButtonElement[];

  /** `root` wraps both; `options` holds one `[data-language]` button per language. */
  public constructor(root: HTMLElement, private readonly toggle: HTMLElement, private readonly options: HTMLElement) {
    this.buttons = [...options.querySelectorAll<HTMLButtonElement>('[data-language]')];

    toggle.onclick = () => this.setOpen(options.hidden);
    for (const button of this.buttons) {
      button.onclick = () => {
        if (isLanguage(button.dataset.language)) setLanguage(button.dataset.language);
        this.setOpen(false);
        toggle.focus();
      };
    }
    document.addEventListener('pointerdown', (event) => {
      if (!options.hidden && !root.contains(event.target as Node)) this.setOpen(false);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || options.hidden) return;
      event.stopPropagation();
      this.setOpen(false);
      toggle.focus();
    });
    onLanguageChange(() => this.sync());
    this.sync();
  }

  private setOpen(open: boolean): void {
    this.options.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  private sync(): void {
    const current = getLanguage();
    for (const button of this.buttons) {
      const selected = button.dataset.language === current;
      button.setAttribute('aria-pressed', String(selected));
      const flag = button.querySelector('svg');
      if (selected && flag) {
        const code = document.createElement('span');
        code.textContent = current.toUpperCase();
        this.toggle.replaceChildren(flag.cloneNode(true), code);
      }
    }
  }
}
