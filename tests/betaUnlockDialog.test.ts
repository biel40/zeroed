import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n/i18n';
import { BetaUnlockDialog } from '../src/ui/BetaUnlockDialog';

class FakeDialog {
  public open = false;
  private closeListener: (() => void) | null = null;

  public addEventListener(_type: 'close', listener: () => void): void {
    this.closeListener = listener;
  }

  public showModal(): void {
    this.open = true;
  }

  public close(): void {
    this.open = false;
    this.closeListener?.();
  }
}

interface FakeText {
  textContent: string;
  dataset: Record<string, string>;
}

const text = (): FakeText => ({ textContent: '', dataset: {} });

function createDialog(): {
  unlock: BetaUnlockDialog;
  dialog: FakeDialog;
  form: { onsubmit: ((event: { preventDefault: () => void }) => void) | null };
  email: { value: string; focus: () => void };
  message: FakeText;
  title: FakeText;
  cancel: { onclick: (() => void) | null };
  submit: () => void;
} {
  const dialog = new FakeDialog();
  const form: { onsubmit: ((event: { preventDefault: () => void }) => void) | null } = { onsubmit: null };
  const email = { value: '', focus: vi.fn() };
  const message = text();
  const title = text();
  const cancel: { onclick: (() => void) | null } = { onclick: null };
  const unlock = new BetaUnlockDialog(dialog as unknown as HTMLDialogElement, form as unknown as HTMLFormElement,
    email as unknown as HTMLInputElement, message as unknown as HTMLElement, title as unknown as HTMLElement,
    cancel as unknown as HTMLElement);
  const submit = (): void => form.onsubmit?.({ preventDefault: () => undefined });
  return { unlock, dialog, form, email, message, title, cancel, submit };
}

describe('closed beta unlock dialog', () => {
  afterEach(() => setLanguage('en'));

  it('names the locked map and reports the accepted email once', () => {
    setLanguage('es');
    const { unlock, dialog, email, message, title, submit } = createDialog();
    const acceptEmail = vi.fn((value: string) => value === 'bielet40@gmail.com');
    unlock.setAcceptEmail(acceptEmail);
    const unlocked: string[] = [];
    unlock.open('map.station33', (value) => unlocked.push(value));
    expect(dialog.open).toBe(true);
    expect(title.textContent).toBe('STATION 33');
    expect(title.dataset.i18n).toBe('map.station33');

    email.value = 'unlisted@example.com';
    submit();
    expect(acceptEmail).toHaveBeenCalledWith('unlisted@example.com');
    expect(message.dataset.i18n).toBe('beta.denied');
    expect(dialog.open).toBe(true);
    expect(unlocked).toEqual([]);

    email.value = 'bielet40@gmail.com';
    submit();
    expect(dialog.open).toBe(false);
    expect(unlocked).toEqual(['bielet40@gmail.com']);
    expect(message.textContent).toBe('');
    expect(message.dataset.i18n).toBeUndefined();

    submit();
    expect(unlocked).toEqual(['bielet40@gmail.com']);
  });

  it('keeps the map locked when the beta session cannot be saved', () => {
    const { unlock, dialog, email, message, submit } = createDialog();
    const unlocked: string[] = [];
    unlock.open('map.station33', (value) => unlocked.push(value));
    email.value = 'bielet40@gmail.com';
    // Without a configured check the dialog behaves like unavailable storage.
    submit();
    expect(message.dataset.i18n).toBe('beta.unavailable');

    unlock.setAcceptEmail(() => { throw new Error('Storage disabled'); });
    submit();
    expect(message.dataset.i18n).toBe('beta.unavailable');
    expect(dialog.open).toBe(true);
    expect(unlocked).toEqual([]);
  });

  it('cancels without unlocking and starts clean when reopened', () => {
    const { unlock, dialog, email, message, cancel, submit } = createDialog();
    unlock.setAcceptEmail(() => false);
    const unlocked: string[] = [];
    unlock.open('map.station33', (value) => unlocked.push(value));
    email.value = 'unlisted@example.com';
    submit();
    cancel.onclick?.();
    expect(dialog.open).toBe(false);

    unlock.open('map.station33', (value) => unlocked.push(`again:${value}`));
    expect(email.value).toBe('');
    expect(message.textContent).toBe('');
    unlock.setAcceptEmail(() => true);
    email.value = 'bielet40@gmail.com';
    submit();
    expect(unlocked).toEqual(['again:bielet40@gmail.com']);
  });
});
