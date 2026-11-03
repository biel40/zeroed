import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COOP_ZOMBIE_MAP_ID, isZombieMapId, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import type { EntitlementProvider } from '../src/entitlements/EntitlementProvider';
import { HUD } from '../src/ui/HUD';

const allProducts: EntitlementProvider = { owns: (): boolean => true };
const noProducts: EntitlementProvider = { owns: (): boolean => false };

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

class FakeElement {
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, force?: boolean) => {
      const add = force ?? !this.classes.has(name);
      if (add) this.classes.add(name);
      else this.classes.delete(name);
      return add;
    },
    contains: (name: string) => this.classes.has(name),
  };
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: () => undefined };
  onclick: (() => void) | null = null;
  public onsubmit: ((event: { preventDefault: () => void }) => void) | null = null;
  public value = '';
  textContent = '';
  focused = false;

  /** Elements returned by querySelector for selectors other than 'span'. */
  readonly slots: Record<string, FakeElement> = {};

  constructor(private readonly children: FakeElement[] = []) {}

  addEventListener(): void {}

  focus(): void {
    this.focused = true;
  }

  querySelector(selector: string): FakeElement | null {
    return selector === 'span' ? this.children[0] ?? null : this.slots[selector] ?? null;
  }

  querySelectorAll(): FakeElement[] {
    return this.children;
  }
}

/** Native dialogs fire `close` asynchronously; the views only rely on it firing after `close()`. */
class FakeDialog extends FakeElement {
  public open = false;
  private readonly closeListeners: (() => void)[] = [];

  public override addEventListener(_type?: string, listener?: () => void): void {
    if (listener) this.closeListeners.push(listener);
  }

  public showModal(): void {
    this.open = true;
  }

  public close(): void {
    this.open = false;
    for (const listener of this.closeListeners) listener();
  }
}

describe('Zombies map selection flow', () => {
  it('declares one translated menu button per registered map', () => {
    for (const map of Object.values(ZOMBIE_MAPS)) {
      expect(html).toContain(`data-map="${map.id}"`);
      expect(html).toContain(`data-i18n="${map.nameKey}"`);
    }
    expect(html.match(/data-map=/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    expect(html).not.toContain('data-mode=');
    expect(html).not.toContain('map-select-kicker');
    expect(html).not.toContain('menu.chooseMap');
    expect(html).toContain('data-i18n="menu.zombies"');
    // Each card carries its own tagline and the chips HUD fills from the registry.
    expect(html.match(/data-i18n="map.[a-zA-Z0-9]+.tagline"/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    expect(html.match(/data-map-players/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    expect(html.match(/data-map-access/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    expect(html.match(/data-map-action/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    // Every card shares the padlock HUD reveals while its map is locked.
    expect(html.match(/class="map-card-lock"/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    expect(css).toMatch(/\.map-card\[data-locked='true'\] \.map-card-lock \{\s*display: flex;/);
  });

  it('lists Burned Mansion for everyone and Station 33 as a locked single-player premium map', () => {
    expect(ZOMBIE_MAPS['burned-mansion']).toMatchObject({ visible: true, coop: true });
    expect(ZOMBIE_MAPS['station-33']).toMatchObject({ visible: true, product: 'map.station-33', coop: false });
    expect(COOP_ZOMBIE_MAP_ID).toBe('burned-mansion');
    expect(isZombieMapId('station-33')).toBe(true);
    expect(isZombieMapId('classic')).toBe(false);
  });

  it('keeps the map picker above the fixed game canvas', () => {
    expect(css).toMatch(
      /#map-select,\s*#game-over \{[^}]*position: fixed;[^}]*z-index: 20;/,
    );
  });

  it('labels the cards from the registry, locks premium maps behind the account dialog and handles them again after reopening the picker', async () => {
    const card = (mapId: string): FakeElement => {
      const element = new FakeElement();
      element.dataset.map = mapId;
      element.slots['[data-map-access]'] = new FakeElement();
      element.slots['[data-map-account]'] = new FakeElement();
      element.slots['[data-map-players]'] = new FakeElement();
      element.slots['[data-map-action]'] = new FakeElement();
      return element;
    };
    const mansion = card('burned-mansion');
    const station = card('station-33');
    const mapSelect = new FakeElement([mansion, station]);
    const startScreen = new FakeElement();
    const elements: Record<string, FakeElement> = {
      'map-select': mapSelect,
      'start-screen': startScreen,
      'loading-bar': new FakeElement([new FakeElement()]),
      'beta-unlock': new FakeDialog(),
      'beta-access-form': new FakeElement(),
      'beta-email': new FakeElement(),
      'beta-email-field': new FakeElement(),
      'beta-message': new FakeElement(),
      'beta-unlock-map': new FakeElement(),
      'beta-unlock-hint': new FakeElement(),
      'beta-unlock-submit': new FakeElement(),
      'beta-signout': new FakeElement(),
      'beta-unlock-kicker': new FakeElement(),
      'account-button': new FakeElement(),
      'account-label': new FakeElement(),
      'account-avatar': new FakeElement(),
      'account-badge': new FakeElement(),
      'beta-thanks': new FakeDialog(),
      'beta-thanks-email': new FakeElement(),
      'beta-thanks-close': new FakeElement(),
    };
    const unlockDialog = elements['beta-unlock'] as FakeDialog;
    const generic = new FakeElement();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        getElementById: (id: string) => elements[id] ?? generic,
      },
    });

    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);

    try {
      const selected: string[] = [];
      const ui = new HUD();
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts);
      // The loading screen cross-fades out over the menu before hiding.
      expect(startScreen.classList.contains('leaving')).toBe(true);
      vi.runAllTimers();
      expect(startScreen.classList.contains('hidden')).toBe(true);
      expect(startScreen.classList.contains('leaving')).toBe(false);
      expect(mansion.classList.contains('hidden')).toBe(false);
      expect(station.classList.contains('hidden')).toBe(false);
      expect(mansion.focused).toBe(true);
      expect(mansion.dataset.access).toBe('free');
      expect(mansion.dataset.locked).toBe('false');
      expect(mansion.slots['[data-map-access]'].dataset.i18n).toBe('map.access.free');
      expect(mansion.slots['[data-map-account]'].textContent).toBe('NO ACCOUNT');
      expect(mansion.slots['[data-map-players]'].textContent).toBe('1–2 PLAYERS');
      expect(mansion.slots['[data-map-action]'].textContent).toBe('PLAY');
      expect(station.dataset.access).toBe('premium');
      expect(station.dataset.locked).toBe('false');
      expect(station.slots['[data-map-access]'].textContent).toBe('PREMIUM');
      expect(station.slots['[data-map-account]'].textContent).toBe('ACCOUNT REQUIRED');
      expect(station.slots['[data-map-players]'].dataset.i18n).toBe('map.players.solo');
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion']);
      expect(mapSelect.classList.contains('hidden')).toBe(true);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`), allProducts);
      station.onclick?.();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // Signed out, the card stays listed but locked behind the login-link prompt.
      mansion.focused = false;
      let accountEmail: string | null = null;
      let betaTester = false;
      const requestLogin = vi.fn(async (email: string) => (email.includes('@') ? 'sent' as const : 'invalid-email' as const));
      const onSignedOut = vi.fn();
      ui.setMapUnlockAccount({
        getEmail: () => accountEmail,
        isBetaTester: () => betaTester,
        requestLogin,
        signOut: async () => { accountEmail = null; },
      }, onSignedOut);
      ui.showMapSelect((mapId) => selected.push(`locked:${mapId}`), noProducts);
      expect(station.classList.contains('hidden')).toBe(false);
      expect(station.dataset.locked).toBe('true');
      expect(station.slots['[data-map-action]'].dataset.i18n).toBe('menu.unlock');
      expect(mansion.dataset.locked).toBe('false');
      expect(mansion.focused).toBe(true);
      station.onclick?.();
      expect(unlockDialog.open).toBe(true);
      expect(elements['beta-unlock-map'].textContent).toBe('STATION 33');
      expect(elements['beta-unlock-hint'].dataset.i18n).toBe('account.unlockHint');
      expect(elements['beta-email-field'].classList.contains('hidden')).toBe(false);
      expect(elements['beta-signout'].classList.contains('hidden')).toBe(true);
      expect(mapSelect.classList.contains('hidden')).toBe(false);

      const flush = async (): Promise<void> => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      };
      const submit = async (email: string): Promise<void> => {
        elements['beta-email'].value = email;
        elements['beta-access-form'].onsubmit?.({ preventDefault: () => undefined });
        await flush();
      };
      await submit('not-an-email');
      expect(elements['beta-message'].dataset.i18n).toBe('account.invalidEmail');

      // The link is mailed; the map unlocks only when the player opens it.
      await submit('  Bielet40@Gmail.com ');
      expect(requestLogin).toHaveBeenLastCalledWith('bielet40@gmail.com');
      expect(elements['beta-message'].textContent).toContain('bielet40@gmail.com');
      expect(unlockDialog.open).toBe(true);
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // Signed in without the map, the dialog names the account and offers to sign out.
      unlockDialog.close();
      accountEmail = 'player@example.com';
      station.onclick?.();
      expect(elements['beta-unlock-hint'].textContent).toContain('player@example.com');
      expect(elements['beta-email-field'].classList.contains('hidden')).toBe(true);
      expect(elements['beta-unlock-submit'].classList.contains('hidden')).toBe(true);
      expect(elements['beta-signout'].classList.contains('hidden')).toBe(false);
      elements['beta-signout'].onclick?.();
      await flush();
      expect(accountEmail).toBeNull();
      expect(unlockDialog.open).toBe(false);
      expect(onSignedOut).toHaveBeenCalledOnce();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // The account button in the menu corner reflects the session and opens the account dialog.
      ui.showMapSelect((mapId) => selected.push(mapId), noProducts);
      expect(elements['account-label'].dataset.i18n).toBe('account.signIn');
      expect(elements['account-button'].dataset.signedIn).toBe('false');
      accountEmail = 'player@example.com';
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts);
      expect(elements['account-label'].textContent).toBe('player@example.com');
      expect(elements['account-button'].dataset.signedIn).toBe('true');
      expect(elements['account-label'].dataset.i18n).toBeUndefined();
      // Signed in, the avatar shows the email's initial; only beta testers get the badge.
      expect(elements['account-avatar'].textContent).toBe('P');
      expect(elements['account-badge'].classList.contains('hidden')).toBe(true);
      betaTester = true;
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts);
      expect(elements['account-badge'].classList.contains('hidden')).toBe(false);
      expect(elements['account-badge'].dataset.i18n).toBe('betaThanks.tester');
      elements['account-button'].onclick?.();
      expect(unlockDialog.open).toBe(true);
      expect(elements['beta-unlock-map'].dataset.i18n).toBe('account.title');
      expect(elements['beta-signout'].classList.contains('hidden')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it('forwards the selected id to Zombies game initialization', () => {
    expect(main).toContain('hud.showMapSelect((mapId) =>');
    expect(main).toContain('startGame(new ZombiesMode(mapId), mapId)');
    // Direct links use the same beta access rule as the menu, and startGame rechecks it.
    expect(main).toContain('startGame(new ZombiesMode(requestedMap), requestedMap)');
    expect(main).toContain('canAccessZombieMap(requestedMap, this.entitlements)');
    expect(main).toContain('if (!canAccessZombieMap(mapId, this.entitlements))');
    expect(main).not.toContain('showModeSelect');
    expect(main).not.toContain('ClassicMode');
  });
});
