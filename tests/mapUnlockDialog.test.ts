import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleSignInButton } from '../src/account/GoogleIdentityButton';
import type { PasswordSignIn } from '../src/account/WebAccount';
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

type View = Record<keyof MapUnlockElements, FakeElement>;

function createDialog(account: MapUnlockAccount, onAccountChanged: () => void = () => undefined): { unlock: MapUnlockDialog; view: View; dialog: FakeDialog } {
  const dialog = new FakeDialog();
  const view: View = {
    dialog, form: new FakeElement(), kicker: new FakeElement(), mapName: new FakeElement(), hint: new FakeElement(),
    signInFields: new FakeElement(), googleField: new FakeElement(), googleButton: new FakeElement(),
    email: new FakeElement(), password: new FakeElement(), forgotButton: new FakeElement(), message: new FakeElement(),
    cancelButton: new FakeElement(), submitButton: new FakeElement(), signOutButton: new FakeElement(),
  };
  const unlock = new MapUnlockDialog(view as unknown as MapUnlockElements);
  unlock.setAccount(account, onAccountChanged);
  return { unlock, view, dialog };
}

function signedOut(overrides: Partial<MapUnlockAccount> = {}): MapUnlockAccount {
  return {
    getEmail: () => null,
    signInWithPassword: async () => 'signed-in',
    signInWithGoogle: async () => 'signed-in',
    requestRecovery: async () => 'sent',
    signOut: async () => undefined,
    google: null,
    ...overrides,
  };
}

/** Stands in for Google's script: keeps the credential callback so a test can "click" the button. */
class FakeGoogleButton implements GoogleSignInButton {
  public onCredential: ((credential: string) => void) | null = null;

  public constructor(private readonly loads = true) {}

  public async render(_host: HTMLElement, onCredential: (credential: string) => void): Promise<boolean> {
    this.onCredential = onCredential;
    return this.loads;
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function submit(view: View, email: string, password = 'password1'): Promise<void> {
  view.email.value = email;
  view.password.value = password;
  view.form.onsubmit?.({ preventDefault: () => undefined });
  await flush();
}

describe('map unlock dialog', () => {
  afterEach(() => setLanguage('en'));

  it('signs in with email and password, closes and refreshes the menu', async () => {
    const signInWithPassword = vi.fn(async (): Promise<PasswordSignIn> => 'signed-in');
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ signInWithPassword }), onAccountChanged);
    unlock.open('map.station33');
    expect(view.mapName.textContent).toBe('STATION 33');
    await submit(view, ' Player@Example.com ', 'My Password');
    expect(signInWithPassword).toHaveBeenCalledWith('player@example.com', 'My Password');
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('explains every failure and keeps the dialog open', async () => {
    let outcome: PasswordSignIn = 'wrong-password';
    const { unlock, view, dialog } = createDialog(signedOut({ signInWithPassword: async () => outcome }));
    unlock.open('map.station33');
    const expected: [PasswordSignIn, string][] = [
      ['wrong-password', 'account.wrongPassword'],
      ['weak-password', 'account.weakPassword'],
      ['invalid-email', 'account.invalidEmail'],
      ['rate-limited', 'account.rateLimited'],
      ['unavailable', 'account.unavailable'],
    ];
    for (const [next, key] of expected) {
      outcome = next;
      await submit(view, 'a@example.com');
      expect(view.message.dataset.i18n).toBe(key);
    }
    expect(dialog.open).toBe(true);
  });

  it('sends one request at a time', async () => {
    let finish: (outcome: PasswordSignIn) => void = () => undefined;
    const signInWithPassword = vi.fn(() => new Promise<PasswordSignIn>((resolve) => { finish = resolve; }));
    const { unlock, view } = createDialog(signedOut({ signInWithPassword }));
    unlock.open('map.station33');
    void submit(view, 'a@example.com');
    void submit(view, 'a@example.com');
    view.forgotButton.onclick?.();
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(view.submitButton.disabled).toBe(true);
    expect(view.forgotButton.disabled).toBe(true);
    finish('wrong-password');
    await flush();
    expect(view.submitButton.disabled).toBe(false);
    await submit(view, 'a@example.com');
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('mails a recovery link for a forgotten password in the player language', async () => {
    setLanguage('es');
    const requestRecovery = vi.fn(async () => 'sent' as const);
    const { unlock, view, dialog } = createDialog(signedOut({ requestRecovery }));
    unlock.open('map.station33');
    view.email.value = 'Player@Example.com';
    view.forgotButton.onclick?.();
    await flush();
    expect(requestRecovery).toHaveBeenCalledWith('player@example.com');
    expect(view.message.textContent).toBe('Te hemos enviado un enlace a player@example.com. Ábrelo para entrar; después podrás elegir una contraseña nueva.');
    expect(dialog.open).toBe(true);
  });

  it('offers Google when available and signs in with its credential', async () => {
    const google = new FakeGoogleButton();
    const signInWithGoogle = vi.fn(async () => 'signed-in' as const);
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ google, signInWithGoogle }), onAccountChanged);
    unlock.open(null);
    await flush();
    expect(view.googleField.classList.contains('hidden')).toBe(false);
    google.onCredential?.('google-credential');
    await flush();
    expect(signInWithGoogle).toHaveBeenCalledWith('google-credential');
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('hides Google when it is not offered or its script cannot load, and explains a rejected credential', async () => {
    const { unlock, view } = createDialog(signedOut());
    unlock.open(null);
    expect(view.googleField.classList.contains('hidden')).toBe(true);

    const offline = createDialog(signedOut({ google: new FakeGoogleButton(false) }));
    offline.unlock.open(null);
    await flush();
    expect(offline.view.googleField.classList.contains('hidden')).toBe(true);

    const google = new FakeGoogleButton();
    const rejected = createDialog(signedOut({ google, signInWithGoogle: async () => 'rejected' }));
    rejected.unlock.open(null);
    await flush();
    google.onCredential?.('forged');
    await flush();
    expect(rejected.view.message.dataset.i18n).toBe('account.googleRejected');
    expect(rejected.dialog.open).toBe(true);
  });

  it('cancels and starts clean when reopened', async () => {
    const { unlock, view, dialog } = createDialog(signedOut({ signInWithPassword: async () => 'wrong-password' }));
    unlock.open('map.station33');
    await submit(view, 'a@example.com', 'bad password');
    view.cancelButton.onclick?.();
    expect(dialog.open).toBe(false);
    unlock.open('map.station33');
    expect(view.email.value).toBe('');
    expect(view.password.value).toBe('');
    expect(view.message.textContent).toBe('');
  });

  it('opens from the account button without a map: sign-in form when signed out', () => {
    const { unlock, view, dialog } = createDialog(signedOut());
    unlock.open(null);
    expect(dialog.open).toBe(true);
    expect(view.mapName.dataset.i18n).toBe('account.title');
    expect(view.kicker.classList.contains('hidden')).toBe(true);
    expect(view.hint.dataset.i18n).toBe('account.signInHint');
    expect(view.signInFields.classList.contains('hidden')).toBe(false);
    expect(view.signOutButton.classList.contains('hidden')).toBe(true);

    unlock.open('map.station33');
    expect(view.kicker.classList.contains('hidden')).toBe(false);
  });

  it('shows the signed-in address and signs out from the account button', async () => {
    let email: string | null = 'player@example.com';
    const onAccountChanged = vi.fn();
    const google = new FakeGoogleButton();
    const { unlock, view, dialog } = createDialog(signedOut({ getEmail: () => email, google, signOut: async () => { email = null; } }), onAccountChanged);
    unlock.open(null);
    await flush();
    expect(view.hint.textContent).toBe('Signed in as player@example.com.');
    expect(view.signInFields.classList.contains('hidden')).toBe(true);
    expect(view.googleField.classList.contains('hidden')).toBe(true);
    expect(google.onCredential).toBeNull();
    expect(view.submitButton.classList.contains('hidden')).toBe(true);
    expect(view.signOutButton.classList.contains('hidden')).toBe(false);

    view.signOutButton.onclick?.();
    await flush();
    expect(email).toBeNull();
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });
});
