import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COOP_ZOMBIE_MAP_ID, getZombieMapProduct, isZombieMapId, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import type { EntitlementProvider } from '../src/entitlements/EntitlementProvider';
import { ca } from '../src/i18n/ca';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { HUD } from '../src/ui/HUD';

const allProducts: EntitlementProvider = { owns: (): boolean => true };
const noProducts: EntitlementProvider = { owns: (): boolean => false };

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const mapRelease = readFileSync(new URL('../src/config/mapRelease.ts', import.meta.url), 'utf8');

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
  public disabled = false;
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

  it('ships one WebP cover per menu card', () => {
    const covers = [...html.matchAll(/<image class="map-card-image" href="\.\/(assets\/maps\/[^"]+)"/g)];
    expect(covers).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    for (const [, path] of covers) {
      expect(path).toMatch(/\.webp$/);
      const cover = readFileSync(new URL(`../public/${path}`, import.meta.url));
      expect(cover.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('lists Burned Mansion for everyone and both premium maps as single-player maps', () => {
    expect(ZOMBIE_MAPS['burned-mansion']).toMatchObject({ visible: true, coop: true });
    expect(ZOMBIE_MAPS['station-33']).toMatchObject({ visible: true, product: 'map.station-33', coop: false });
    expect(ZOMBIE_MAPS['die-kathedrale']).toMatchObject({ visible: true, workInProgress: true, product: 'map.die-kathedrale', coop: false });
    expect(ZOMBIE_MAPS['burned-mansion']).not.toHaveProperty('workInProgress');
    expect(ZOMBIE_MAPS['station-33']).not.toHaveProperty('workInProgress');
    expect(getZombieMapProduct('die-kathedrale')).toBe('map.die-kathedrale');
    expect(COOP_ZOMBIE_MAP_ID).toBe('burned-mansion');
    expect(isZombieMapId('station-33')).toBe(true);
    expect(isZombieMapId('classic')).toBe(false);
  });

  it('labels the WIP padlock WIP in every language and only lets dev servers opt in', () => {
    expect(html.match(/data-map-lock-label/g)).toHaveLength(Object.keys(ZOMBIE_MAPS).length);
    for (const strings of [en, es, ca]) expect(strings['map.wip']).toBe('WIP');
    expect(css).toMatch(/.map-card:disabled {[^}]*cursor: not-allowed;/);
    // Production builds cannot opt in globally through this flag.
    expect(mapRelease).toMatch(/WIP_MAPS_ENABLED: boolean = import.meta.env.DEV && import.meta.env.VITE_WIP_MAPS === 'true'/);
  });

  it('releases WIP maps on a dev server only with VITE_WIP_MAPS=true', async () => {
    try {
      for (const [value, expected] of [[undefined, false], ['false', false], ['true', true]] as const) {
        vi.resetModules();
        if (value === undefined) vi.unstubAllEnvs();
        else vi.stubEnv('VITE_WIP_MAPS', value);
        const { WIP_MAPS_ENABLED } = await import('../src/config/mapRelease');
        expect(WIP_MAPS_ENABLED).toBe(expected);
      }
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
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
      element.slots['[data-map-lock-label]'] = new FakeElement();
      return element;
    };
    const mansion = card('burned-mansion');
    const station = card('station-33');
    const cathedral = card('die-kathedrale');
    const mapSelect = new FakeElement([mansion, station, cathedral]);
    const startScreen = new FakeElement();
    const elements: Record<string, FakeElement> = {
      'map-select': mapSelect,
      'start-screen': startScreen,
      'loading-bar': new FakeElement([new FakeElement()]),
      'beta-unlock': new FakeDialog(),
      'beta-access-form': new FakeElement(),
      'beta-email': new FakeElement(),
      'beta-password': new FakeElement(),
      'beta-email-field': new FakeElement(),
      'beta-password-hint': new FakeElement(),
      'beta-confirm-field': new FakeElement(),
      'beta-confirm-password': new FakeElement(),
      'beta-mode': new FakeElement(),
      'beta-forgot': new FakeElement(),
      'beta-signin-fields': new FakeElement(),
      'beta-google-field': new FakeElement(),
      'beta-google-button': new FakeElement(),
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
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts, false);
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
      expect(station.slots['[data-map-lock-label]'].dataset.i18n).toBe('map.locked');
      expect(station.disabled).toBe(false);
      // Without the local WIP opt-in, Die Kathedrale stays listed under a WIP padlock and cannot be activated,
      // even when the account owns it.
      expect(cathedral.classList.contains('hidden')).toBe(false);
      expect(cathedral.dataset.locked).toBe('true');
      expect(cathedral.dataset.wip).toBe('true');
      expect(cathedral.disabled).toBe(true);
      expect(cathedral.onclick).toBeNull();
      expect(cathedral.slots['[data-map-lock-label]'].textContent).toBe('WIP');
      expect(cathedral.slots['[data-map-action]'].textContent).toBe('WIP');
      expect(station.dataset.wip).toBe('false');
      expect(mansion.dataset.wip).toBe('false');

      const preview: EntitlementProvider = { ...noProducts, canPreview: (product) => product === 'map.die-kathedrale' };
      ui.showMapSelect((mapId) => selected.push(mapId), preview, false);
      expect(cathedral.dataset.locked).toBe('false');
      expect(cathedral.dataset.wip).toBe('false');
      expect(cathedral.disabled).toBe(false);
      expect(cathedral.slots['[data-map-action]'].textContent).toBe('PLAY');
      expect(station.dataset.locked).toBe('true');
      cathedral.onclick?.();
      expect(selected).toEqual(['die-kathedrale']);
      selected.length = 0;

      ui.showMapSelect((mapId) => selected.push(mapId), noProducts, false);
      expect(cathedral.dataset.wip).toBe('true');
      expect(cathedral.disabled).toBe(true);
      expect(cathedral.onclick).toBeNull();

      // The local opt-in releases it as a regular premium map.
      ui.showMapSelect((mapId) => selected.push(`wip:${mapId}`), allProducts, true);
      expect(cathedral.dataset.wip).toBe('false');
      expect(cathedral.disabled).toBe(false);
      expect(cathedral.dataset.access).toBe('premium');
      expect(cathedral.dataset.locked).toBe('false');
      expect(cathedral.slots['[data-map-lock-label]'].dataset.i18n).toBe('map.locked');
      expect(cathedral.slots['[data-map-access]'].textContent).toBe('PREMIUM');
      expect(cathedral.slots['[data-map-account]'].textContent).toBe('ACCOUNT REQUIRED');
      expect(cathedral.slots['[data-map-players]'].dataset.i18n).toBe('map.players.solo');
      cathedral.onclick?.();
      expect(selected).toEqual(['wip:die-kathedrale']);
      selected.length = 0;

      ui.showMapSelect((mapId) => selected.push(mapId), allProducts, false);
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion']);
      expect(mapSelect.classList.contains('hidden')).toBe(true);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`), allProducts, false);
      station.onclick?.();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // Signed out, released premium maps prompt for sign-in and WIP maps stay disabled.
      mansion.focused = false;
      let accountEmail: string | null = null;
      let betaTester = false;
      const signInWithPassword = vi.fn(async (email: string, _password: string) => (email.includes('@') ? 'wrong-password' as const : 'invalid-email' as const));
      const onAccountChanged = vi.fn();
      ui.setMapUnlockAccount({
        getEmail: () => accountEmail,
        isBetaTester: () => betaTester,
        register: async () => 'exists',
        signInWithPassword,
        signInWithGoogle: async () => 'rejected',
        changePassword: async () => 'changed',
        requestRecovery: async () => 'sent',
        signOut: async () => { accountEmail = null; },
        google: null,
      }, onAccountChanged);
      for (const wipMapsEnabled of [false, true]) {
        ui.showMapSelect((mapId) => selected.push(`locked:${mapId}`), noProducts, wipMapsEnabled);
        expect(cathedral.classList.contains('hidden')).toBe(false);
        expect(cathedral.dataset.locked).toBe('true');
        expect(cathedral.dataset.wip).toBe('true');
        expect(cathedral.disabled).toBe(true);
        expect(cathedral.onclick).toBeNull();
        expect(cathedral.slots['[data-map-lock-label]'].textContent).toBe('WIP');
        expect(cathedral.slots['[data-map-action]'].textContent).toBe('WIP');
      }
      expect(station.classList.contains('hidden')).toBe(false);
      expect(station.dataset.locked).toBe('true');
      expect(station.slots['[data-map-action]'].dataset.i18n).toBe('menu.unlock');
      expect(mansion.dataset.locked).toBe('false');
      expect(mansion.focused).toBe(true);
      station.onclick?.();
      expect(unlockDialog.open).toBe(true);
      expect(elements['beta-unlock-map'].textContent).toBe('STATION 33');
      expect(elements['beta-unlock-hint'].dataset.i18n).toBe('account.unlockHint');
      expect(elements['beta-signin-fields'].classList.contains('hidden')).toBe(false);
      expect(elements['beta-google-field'].classList.contains('hidden')).toBe(true);
      expect(elements['beta-signout'].classList.contains('hidden')).toBe(true);
      expect(mapSelect.classList.contains('hidden')).toBe(false);
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      const flush = async (): Promise<void> => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      };
      const submit = async (email: string): Promise<void> => {
        elements['beta-email'].value = email;
        elements['beta-password'].value = 'password1';
        elements['beta-access-form'].onsubmit?.({ preventDefault: () => undefined });
        await flush();
      };
      await submit('not-an-email');
      expect(elements['beta-message'].dataset.i18n).toBe('account.invalidEmail');

      // A failed sign-in keeps the map locked and the dialog open.
      await submit('  Bielet40@Gmail.com ');
      expect(signInWithPassword).toHaveBeenLastCalledWith('bielet40@gmail.com', 'password1');
      expect(elements['beta-message'].dataset.i18n).toBe('account.wrongPassword');
      expect(unlockDialog.open).toBe(true);
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // Signed in without the map, the dialog names the account and offers to sign out.
      unlockDialog.close();
      accountEmail = 'player@example.com';
      station.onclick?.();
      expect(elements['beta-unlock-hint'].textContent).toContain('player@example.com');
      expect(elements['beta-signin-fields'].classList.contains('hidden')).toBe(true);
      expect(elements['beta-unlock-submit'].classList.contains('hidden')).toBe(true);
      expect(elements['beta-signout'].classList.contains('hidden')).toBe(false);
      elements['beta-signout'].onclick?.();
      await flush();
      expect(accountEmail).toBeNull();
      expect(unlockDialog.open).toBe(false);
      expect(onAccountChanged).toHaveBeenCalledOnce();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // The account button in the menu corner reflects the session and opens the account dialog.
      ui.showMapSelect((mapId) => selected.push(mapId), noProducts, false);
      expect(elements['account-label'].dataset.i18n).toBe('account.signIn');
      expect(elements['account-button'].dataset.signedIn).toBe('false');
      accountEmail = 'player@example.com';
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts, false);
      expect(elements['account-label'].textContent).toBe('player@example.com');
      expect(elements['account-button'].dataset.signedIn).toBe('true');
      expect(elements['account-label'].dataset.i18n).toBeUndefined();
      // Signed in, the avatar shows the email's initial; only beta testers get the badge.
      expect(elements['account-avatar'].textContent).toBe('P');
      expect(elements['account-badge'].classList.contains('hidden')).toBe(true);
      betaTester = true;
      accountEmail = `${'player'.repeat(10)}@example.com`;
      ui.showMapSelect((mapId) => selected.push(mapId), allProducts, false);
      expect(elements['account-label'].textContent).toBe(accountEmail);
      expect(elements['account-badge'].classList.contains('hidden')).toBe(false);
      expect(elements['account-badge'].dataset.i18n).toBe('betaThanks.tester');
      elements['account-button'].onclick?.();
      expect(unlockDialog.open).toBe(true);
      expect(elements['beta-unlock-map'].dataset.i18n).toBe('account.title');
      expect(elements['beta-unlock-hint'].textContent).toContain(accountEmail);
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
    expect(main).toContain('canAccessZombieMap(requestedMap, this.entitlements, WIP_MAPS_ENABLED)');
    expect(main).toContain('if (!canAccessZombieMap(mapId, this.entitlements, WIP_MAPS_ENABLED))');
    expect(main).toContain('this.entitlements, WIP_MAPS_ENABLED)');
    expect(main).not.toContain('showModeSelect');
    expect(main).not.toContain('ClassicMode');
  });
});
