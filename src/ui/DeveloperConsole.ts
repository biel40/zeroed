import { t } from '../i18n/i18n';
import { createDeveloperConsoleControls } from './DeveloperConsoleControls';
import './developer-console.css';

interface ConsoleOptions {
  canOpen(): boolean;
  execute(line: string): string;
  onOpen(): void;
  onClose(): void;
}

/** Run-scoped overlay. Captures typing before desktop gameplay listeners see it. */
export class DeveloperConsole {
  private readonly panel = document.createElement('section');
  private readonly output = document.createElement('pre');
  private readonly input = document.createElement('input');
  private readonly form = document.createElement('form');
  private readonly history: string[] = [];
  private historyIndex = 0;
  private draft = '';
  private open = false;

  constructor(private readonly options: ConsoleOptions) {
    this.panel.className = 'developer-console';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', t('dev.title'));
    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = t('dev.title');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = t('dev.close');
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    this.output.setAttribute('role', 'log');
    this.output.setAttribute('aria-live', 'polite');
    this.output.textContent = `${t('dev.ready')}\n`;
    this.input.placeholder = t('dev.placeholder');
    this.input.setAttribute('aria-label', t('dev.placeholder'));
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '↵';
    submit.setAttribute('aria-label', t('dev.execute'));
    this.form.append(this.input, submit);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const line = this.input.value.trim();
      if (!line) return;
      this.run(line);
      this.input.value = '';
      this.input.focus();
    });
    const intro = document.createElement('p');
    intro.className = 'dev-intro';
    intro.textContent = t('dev.intro');
    const advanced = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = t('dev.advanced');
    const help = document.createElement('p');
    help.className = 'dev-command-help';
    help.textContent = t('dev.help');
    advanced.append(summary, help, this.form);
    this.panel.append(header, intro, createDeveloperConsoleControls((line, label) => this.run(line, label)),
      this.output, advanced);
    document.body.append(this.panel);
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  private run(line: string, label = line): void {
    this.history.push(line);
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = this.history.length;
    this.draft = '';
    const result = line.toLowerCase() === 'clear' ? '' : this.options.execute(line);
    this.output.textContent = line.toLowerCase() === 'clear' ? ''
      : `${this.output.textContent}${label} → ${result}\n`.slice(-20000);
    this.output.scrollTop = this.output.scrollHeight;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (event.code !== 'F2' || event.repeat || !this.options.canOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open = true;
      this.options.onOpen();
      this.panel.hidden = false;
      this.panel.querySelector<HTMLSelectElement>('select')?.focus();
      return;
    }
    event.stopImmediatePropagation();
    if (event.code === 'Escape' || event.code === 'F2') {
      event.preventDefault();
      if (!event.repeat) this.close();
    } else if (event.code === 'Enter' && event.target === this.input && !event.isComposing) {
      event.preventDefault();
      if (!event.repeat) this.form.requestSubmit();
    } else if (event.code === 'Tab') {
      event.preventDefault();
      const controls = [...this.panel.querySelectorAll<HTMLElement>('button, input, select, summary')]
        .filter((element) => element.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    } else if (event.target === this.input && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
      event.preventDefault();
      if (this.historyIndex === this.history.length) this.draft = this.input.value;
      this.historyIndex = Math.max(0, Math.min(this.history.length,
        this.historyIndex + (event.code === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.historyIndex] ?? this.draft;
    }
  };

  private close(): void {
    this.open = false;
    this.panel.hidden = true;
    this.input.blur();
    this.options.onClose();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.panel.remove();
  }
}
