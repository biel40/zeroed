import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleSignInButton } from '../src/account/GoogleIdentityButton';
import type { PasswordChange, PasswordSignIn, Registration } from '../src/account/WebAccount';
import { setLanguage } from '../src/i18n/i18n';
import { MapUnlockDialog, type MapUnlockAccount, type MapUnlockElements } from '../src/ui/MapUnlockDialog';

class FakeElement {
  public textContent = '';
  public value = '';
  public disabled = false;
  public required = false;
  public autocomplete = '';
  public readonly dataset: Record<string, string> = {};
  public onclick: (() => void) | null = null;
  public onsubmit: ((event: { preventDefault: () => void }) => void) | null = null;
  private readonly classes = new Set<string>();
  public readonly classList = {
    toggle: (name: string, force: boolean): void => void (force ? this.classes.add(name) : this.classes.delete(name)),
    contains: (name: string): boolean => this.classes.has(name),
  };

  public isHidden(): boolean {
    return this.classes.has('hidden');
  }
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
  const element = (): FakeElement => new FakeElement();
  const view: View = {
    dialog, form: element(), kicker: element(), mapName: element(), hint: element(), signInFields: element(),
    googleField: element(), googleButton: element(), emailField: element(), email: element(), password: element(),
    passwordHint: element(), confirmField: element(), confirmPassword: element(), forgotButton: element(),
    modeButton: element(), message: element(), cancelButton: element(), submitButton: element(), signOutButton: element(),
  };
  const unlock = new MapUnlockDialog(view as unknown as MapUnlockElements);
  unlock.setAccount(account, onAccountChanged);
  return { unlock, view, dialog };
}

function signedOut(overrides: Partial<MapUnlockAccount> = {}): MapUnlockAccount {
  return {
    getEmail: () => null,
    register: async () => 'signed-in',
    signInWithPassword: async () => 'signed-in',
    signInWithGoogle: async () => 'signed-in',
    changePassword: async () => 'changed',
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

async function submit(view: View, fields: { email?: string; password?: string; confirm?: string }): Promise<void> {
  if (fields.email !== undefined) view.email.value = fields.email;
  view.password.value = fields.password ?? 'password1';
  view.confirmPassword.value = fields.confirm ?? view.password.value;
  view.form.onsubmit?.({ preventDefault: () => undefined });
  await flush();
}

describe('map unlock dialog', () => {
  afterEach(() => setLanguage('en'));

  it('opens on signing in, without a confirmation field', () => {
    const { unlock, view, dialog } = createDialog(signedOut());
    unlock.open('map.station33');
    expect(dialog.open).toBe(true);
    expect(view.mapName.textContent).toBe('STATION 33');
    expect(view.hint.dataset.i18n).toBe('account.unlockHint');
    expect(view.submitButton.dataset.i18n).toBe('account.signInSubmit');
    expect(view.confirmField.isHidden()).toBe(true);
    expect(view.passwordHint.isHidden()).toBe(true);
    expect(view.password.autocomplete).toBe('current-password');
    expect(view.forgotButton.isHidden()).toBe(false);
    expect(view.modeButton.dataset.i18n).toBe('account.noAccountYet');
  });

  it('signs in with email and password, closes and refreshes the menu', async () => {
    const signInWithPassword = vi.fn(async (): Promise<PasswordSignIn> => 'signed-in');
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ signInWithPassword }), onAccountChanged);
    unlock.open('map.station33');
    await submit(view, { email: ' Player@Example.com ', password: 'My Password' });
    expect(signInWithPassword).toHaveBeenCalledWith('player@example.com', 'My Password');
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('creates an account only from its own form, with a confirmed password', async () => {
    const register = vi.fn(async (): Promise<Registration> => 'signed-in');
    const signInWithPassword = vi.fn(async (): Promise<PasswordSignIn> => 'signed-in');
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ register, signInWithPassword }), onAccountChanged);
    unlock.open(null);
    view.modeButton.onclick?.();
    expect(view.mapName.dataset.i18n).toBe('account.registerTitle');
    expect(view.hint.dataset.i18n).toBe('account.registerHint');
    expect(view.submitButton.dataset.i18n).toBe('account.registerSubmit');
    expect(view.confirmField.isHidden()).toBe(false);
    expect(view.confirmPassword.required).toBe(true);
    expect(view.passwordHint.isHidden()).toBe(false);
    expect(view.password.autocomplete).toBe('new-password');
    expect(view.forgotButton.isHidden()).toBe(true);
    expect(view.modeButton.dataset.i18n).toBe('account.haveAccount');

    await submit(view, { email: 'new@example.com', password: 'first one', confirm: 'first 0ne' });
    expect(view.message.dataset.i18n).toBe('account.passwordMismatch');
    expect(register).not.toHaveBeenCalled();

    await submit(view, { email: 'New@Example.com', password: 'first one', confirm: 'first one' });
    expect(register).toHaveBeenCalledWith('new@example.com', 'first one');
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('points to account creation when the address has no account, keeping it', async () => {
    const { unlock, view } = createDialog(signedOut({ signInWithPassword: async () => 'no-account' }));
    unlock.open('map.station33');
    await submit(view, { email: 'nobody@example.com' });
    expect(view.submitButton.dataset.i18n).toBe('account.registerSubmit');
    expect(view.message.dataset.i18n).toBe('account.noAccount');
    expect(view.email.value).toBe('nobody@example.com');
    expect(view.password.value).toBe('');
  });

  it('points to signing in when the address already has an account', async () => {
    const { unlock, view } = createDialog(signedOut({ register: async () => 'exists' }));
    unlock.open(null);
    view.modeButton.onclick?.();
    await submit(view, { email: 'taken@example.com' });
    expect(view.submitButton.dataset.i18n).toBe('account.signInSubmit');
    expect(view.message.dataset.i18n).toBe('account.exists');
    expect(view.email.value).toBe('taken@example.com');
  });

  it('explains every other failure and keeps the dialog open', async () => {
    let outcome: PasswordSignIn = 'wrong-password';
    const { unlock, view, dialog } = createDialog(signedOut({ signInWithPassword: async () => outcome }));
    unlock.open('map.station33');
    const expected: [PasswordSignIn, string][] = [
      ['wrong-password', 'account.wrongPassword'],
      ['invalid-email', 'account.invalidEmail'],
      ['rate-limited', 'account.rateLimited'],
      ['unavailable', 'account.unavailable'],
    ];
    for (const [next, key] of expected) {
      outcome = next;
      await submit(view, { email: 'a@example.com' });
      expect(view.message.dataset.i18n).toBe(key);
    }
    expect(dialog.open).toBe(true);
  });

  it('sends one request at a time', async () => {
    let finish: (outcome: PasswordSignIn) => void = () => undefined;
    const signInWithPassword = vi.fn(() => new Promise<PasswordSignIn>((resolve) => { finish = resolve; }));
    const { unlock, view } = createDialog(signedOut({ signInWithPassword }));
    unlock.open('map.station33');
    void submit(view, { email: 'a@example.com' });
    void submit(view, { email: 'a@example.com' });
    view.forgotButton.onclick?.();
    expect(signInWithPassword).toHaveBeenCalledOnce();
    expect(view.submitButton.disabled).toBe(true);
    expect(view.forgotButton.disabled).toBe(true);
    expect(view.modeButton.disabled).toBe(true);
    finish('wrong-password');
    await flush();
    expect(view.submitButton.disabled).toBe(false);
    await submit(view, { email: 'a@example.com' });
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
    expect(view.message.textContent).toBe('Te hemos enviado un enlace a player@example.com. Ábrelo en este dispositivo para entrar y elegir una contraseña nueva.');
    expect(dialog.open).toBe(true);
  });

  it('asks a signed-in player for a confirmed new password', async () => {
    let outcome: PasswordChange = 'weak-password';
    const changePassword = vi.fn(async () => outcome);
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ getEmail: () => 'player@example.com', changePassword }), onAccountChanged);
    unlock.openNewPassword();
    expect(dialog.open).toBe(true);
    expect(view.mapName.dataset.i18n).toBe('account.newPasswordTitle');
    expect(view.hint.textContent).toBe('Choose a new password for player@example.com.');
    expect(view.emailField.isHidden()).toBe(true);
    expect(view.email.required).toBe(false);
    expect(view.confirmField.isHidden()).toBe(false);
    expect(view.modeButton.isHidden()).toBe(true);
    expect(view.forgotButton.isHidden()).toBe(true);
    expect(view.submitButton.dataset.i18n).toBe('account.savePassword');

    await submit(view, { password: 'new password', confirm: 'other password' });
    expect(changePassword).not.toHaveBeenCalled();
    await submit(view, { password: 'short' });
    expect(view.message.dataset.i18n).toBe('account.weakPassword');
    outcome = 'changed';
    await submit(view, { password: 'new password' });
    expect(changePassword).toHaveBeenLastCalledWith('new password');
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).not.toHaveBeenCalled();
  });

  it('closes and refreshes the menu when the session expired while changing the password', async () => {
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ getEmail: () => 'player@example.com', changePassword: async () => 'signed-out' }), onAccountChanged);
    unlock.openNewPassword();
    await submit(view, { password: 'new password' });
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('explains a used or expired recovery link on the sign-in form', () => {
    const { unlock, view, dialog } = createDialog(signedOut());
    unlock.openRecoveryFailed('invalid-link');
    expect(dialog.open).toBe(true);
    expect(view.forgotButton.isHidden()).toBe(false);
    expect(view.message.dataset.i18n).toBe('account.linkInvalid');

    unlock.openRecoveryFailed('unavailable');
    expect(view.message.dataset.i18n).toBe('account.unavailable');
  });

  it('only asks for a new password while signed in', () => {
    const { unlock, dialog } = createDialog(signedOut());
    unlock.openNewPassword();
    expect(dialog.open).toBe(false);
  });

  it('offers Google on both forms and signs in with its credential', async () => {
    const google = new FakeGoogleButton();
    const signInWithGoogle = vi.fn(async () => 'signed-in' as const);
    const onAccountChanged = vi.fn();
    const { unlock, view, dialog } = createDialog(signedOut({ google, signInWithGoogle }), onAccountChanged);
    unlock.open(null);
    await flush();
    expect(view.googleField.isHidden()).toBe(false);
    view.modeButton.onclick?.();
    await flush();
    expect(view.googleField.isHidden()).toBe(false);
    google.onCredential?.('google-credential');
    await flush();
    expect(signInWithGoogle).toHaveBeenCalledWith('google-credential');
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });

  it('hides Google when it is not offered or its script cannot load, and explains a rejected credential', async () => {
    const { unlock, view } = createDialog(signedOut());
    unlock.open(null);
    expect(view.googleField.isHidden()).toBe(true);

    const offline = createDialog(signedOut({ google: new FakeGoogleButton(false) }));
    offline.unlock.open(null);
    await flush();
    expect(offline.view.googleField.isHidden()).toBe(true);

    const google = new FakeGoogleButton();
    const rejected = createDialog(signedOut({ google, signInWithGoogle: async () => 'rejected' }));
    rejected.unlock.open(null);
    await flush();
    google.onCredential?.('forged');
    await flush();
    expect(rejected.view.message.dataset.i18n).toBe('account.googleRejected');
    expect(rejected.dialog.open).toBe(true);
  });

  it('cancels and starts clean on the sign-in form when reopened', async () => {
    const { unlock, view, dialog } = createDialog(signedOut({ register: async () => 'weak-password' }));
    unlock.open('map.station33');
    view.modeButton.onclick?.();
    await submit(view, { email: 'a@example.com', password: 'bad' });
    view.cancelButton.onclick?.();
    expect(dialog.open).toBe(false);
    unlock.open('map.station33');
    expect(view.submitButton.dataset.i18n).toBe('account.signInSubmit');
    expect(view.email.value).toBe('');
    expect(view.password.value).toBe('');
    expect(view.confirmPassword.value).toBe('');
    expect(view.message.textContent).toBe('');
  });

  it('opens from the account button without a map', () => {
    const { unlock, view } = createDialog(signedOut());
    unlock.open(null);
    expect(view.mapName.dataset.i18n).toBe('account.title');
    expect(view.kicker.isHidden()).toBe(true);
    expect(view.hint.dataset.i18n).toBe('account.signInHint');
    expect(view.signInFields.isHidden()).toBe(false);
    expect(view.signOutButton.isHidden()).toBe(true);

    unlock.open('map.station33');
    expect(view.kicker.isHidden()).toBe(false);
  });

  it('shows the signed-in address and signs out from the account button', async () => {
    let email: string | null = 'player@example.com';
    const onAccountChanged = vi.fn();
    const google = new FakeGoogleButton();
    const { unlock, view, dialog } = createDialog(signedOut({ getEmail: () => email, google, signOut: async () => { email = null; } }), onAccountChanged);
    unlock.open(null);
    await flush();
    expect(view.hint.textContent).toBe('Signed in as player@example.com.');
    expect(view.signInFields.isHidden()).toBe(true);
    expect(view.googleField.isHidden()).toBe(true);
    expect(google.onCredential).toBeNull();
    expect(view.submitButton.isHidden()).toBe(true);
    expect(view.signOutButton.isHidden()).toBe(false);

    view.signOutButton.onclick?.();
    await flush();
    expect(email).toBeNull();
    expect(dialog.open).toBe(false);
    expect(onAccountChanged).toHaveBeenCalledOnce();
  });
});
