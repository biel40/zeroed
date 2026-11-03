import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginRequestOutcome } from '../src/account/AccountApi';
import { setLanguage } from '../src/i18n/i18n';
import { MapUnlockDialog, type MapUnlockAccount, type MapUnlockElements } from '../src/ui/MapUnlockDialog';

class FakeElement {
  public textContent = '';
  public value = '';
  public disabled = false;
  public readonly dataset: Record<string, string> = {};
  public onclick: (() => void) | null = null;
  public onsubmit: ((event: { preventDefault: () => void }) => void) | null = null;
  private readonly classes = new Set<string>();
  public readonly classList = {
    toggle: (name: string, force: boolean): void => void (force ? this.classes.add(name) : this.classes.delete(name)),
    contains: (name: string): boolean => this.classes.has(name),
  };
}

class FakeDialog extends FakeElement {
  public open = false;

  public showModal(): void {
    this.open = true;
  }

  public close(): void {
    this.open = false;
  }
}

function createDialog(account: MapUnlockAccount): { unlock: MapUnlockDialog; view: Record<keyof MapUnlockElements, FakeElement>; dialog: FakeDialog } {
  const dialog = new FakeDialog();
  const view = {
    dialog, form: new FakeElement(), mapName: new FakeElement(), hint: new FakeElement(), emailField: new FakeElement(),
    email: new FakeElement(), message: new FakeElement(), cancelButton: new FakeElement(), submitButton: new FakeElement(),
    signOutButton: new FakeElement(),
  };
  const unlock = new MapUnlockDialog(view as unknown as MapUnlockElements);
  unlock.setAccount(account, () => undefined);
  return { unlock, view, dialog };
}

function signedOut(requestLogin: (email: string) => Promise<LoginRequestOutcome>): MapUnlockAccount {
  return { getEmail: () => null, requestLogin, signOut: async () => undefined };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function submit(view: Record<keyof MapUnlockElements, FakeElement>, email: string): Promise<void> {
  view.email.value = email;
  view.form.onsubmit?.({ preventDefault: () => undefined });
  await flush();
}

describe('map unlock dialog', () => {
  afterEach(() => setLanguage('en'));

  it('confirms the mailed link in the player language', async () => {
    setLanguage('es');
    const { unlock, view } = createDialog(signedOut(async () => 'sent'));
    unlock.open('map.station33');
    expect(view.mapName.textContent).toBe('STATION 33');
    await submit(view, 'Player@Example.com');
    expect(view.message.textContent).toBe('Te hemos enviado un enlace a player@example.com. Ábrelo en este dispositivo para entrar.');
  });

  it('explains rate limits and connection failures', async () => {
    let outcome: LoginRequestOutcome = 'rate-limited';
    const { unlock, view } = createDialog(signedOut(async () => outcome));
    unlock.open('map.station33');
    await submit(view, 'a@example.com');
    expect(view.message.dataset.i18n).toBe('account.rateLimited');
    outcome = 'unavailable';
    await submit(view, 'a@example.com');
    expect(view.message.dataset.i18n).toBe('account.unavailable');
  });

  it('sends one request at a time', async () => {
    let finish: (outcome: LoginRequestOutcome) => void = () => undefined;
    const requestLogin = vi.fn(() => new Promise<LoginRequestOutcome>((resolve) => { finish = resolve; }));
    const { unlock, view } = createDialog(signedOut(requestLogin));
    unlock.open('map.station33');
    void submit(view, 'a@example.com');
    void submit(view, 'a@example.com');
    expect(requestLogin).toHaveBeenCalledOnce();
    expect(view.submitButton.disabled).toBe(true);
    finish('sent');
    await flush();
    expect(view.submitButton.disabled).toBe(false);
    await submit(view, 'a@example.com');
    expect(requestLogin).toHaveBeenCalledTimes(2);
  });

  it('cancels and starts clean when reopened', async () => {
    const { unlock, view, dialog } = createDialog(signedOut(async () => 'invalid-email'));
    unlock.open('map.station33');
    await submit(view, 'bad');
    view.cancelButton.onclick?.();
    expect(dialog.open).toBe(false);
    unlock.open('map.station33');
    expect(view.email.value).toBe('');
    expect(view.message.textContent).toBe('');
  });
});
