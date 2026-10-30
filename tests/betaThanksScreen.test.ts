import { describe, expect, it } from 'vitest';
import { BetaThanksScreen } from '../src/ui/BetaThanksScreen';

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

function createScreen(): { screen: BetaThanksScreen; dialog: FakeDialog; email: { textContent: string }; button: { onclick: (() => void) | null } } {
  const dialog = new FakeDialog();
  const email = { textContent: '' };
  const button: { onclick: (() => void) | null } = { onclick: null };
  const screen = new BetaThanksScreen(dialog as unknown as HTMLDialogElement, email as HTMLElement, button as unknown as HTMLElement);
  return { screen, dialog, email, button };
}

describe('closed beta thanks screen', () => {
  it('shows the normalized tester email and continues once when closed', () => {
    const { screen, dialog, email, button } = createScreen();
    let continued = 0;
    screen.show('  BIELET40@Gmail.com ', () => continued++);
    expect(dialog.open).toBe(true);
    expect(email.textContent).toBe('bielet40@gmail.com');
    expect(continued).toBe(0);

    button.onclick?.();
    expect(dialog.open).toBe(false);
    expect(continued).toBe(1);

    dialog.close();
    expect(continued).toBe(1);
  });
});
