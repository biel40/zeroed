import { t } from '../i18n/i18n';
import './code-lock.css';

/** Keyboard and touch keypad. Owns only presentation; the pickup validates the code. */
export class CodeLockDialog {
  private readonly panel = document.createElement('dialog');
  private readonly display = document.createElement('output');
  private readonly status = document.createElement('p');
  private digits = '';

  constructor(private readonly unlock: (code: string) => boolean, private readonly onClose: () => void) {
    this.panel.className = 'code-lock';
    this.panel.setAttribute('aria-label', t('chest.title'));
    const title = document.createElement('h2');
    title.textContent = t('chest.title');
    this.display.setAttribute('aria-label', t('chest.code'));
    this.status.setAttribute('aria-live', 'polite');
    const keys = document.createElement('div');
    keys.className = 'code-lock-keys';
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '↵']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = key;
      button.setAttribute('aria-label', key === '←' ? t('chest.erase') : key === '↵' ? t('chest.open') : key);
      button.addEventListener('click', () => this.press(key));
      keys.append(button);
    }
    const close = document.createElement('button');
    close.textContent = t('chest.close');
    close.addEventListener('click', () => this.close());
    this.panel.append(title, this.display, this.status, keys, close);
    this.panel.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
    document.body.append(this.panel);
    document.addEventListener('keydown', this.onKeyDown, true);
    this.render();
    this.panel.showModal();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.key === 'Tab') return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.key === 'Escape') this.close();
    else this.press(event.key === 'Enter' ? '↵' : event.key === 'Backspace' ? '←' : event.key);
  };

  private press(key: string): void {
    if (key === '↵') {
      if (this.digits.length !== 4) return;
      if (this.unlock(this.digits)) { this.close(); return; }
      this.status.textContent = t('chest.incorrect');
      this.digits = '';
    } else if (key === '←') this.digits = this.digits.slice(0, -1);
    else if (/^[0-9]$/.test(key) && this.digits.length < 4) {
      this.digits += key;
      this.status.textContent = '';
    }
    this.render();
  }

  private render(): void { this.display.textContent = this.digits.padEnd(4, '–'); }

  private close(): void { this.dispose(); this.onClose(); }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.panel.remove();
  }
}
