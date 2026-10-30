import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COOP_ZOMBIE_MAP_ID, isZombieMapId, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { HUD } from '../src/ui/HUD';

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
    expect(ZOMBIE_MAPS['burned-mansion']).toMatchObject({ visible: true, betaOnly: false, coop: true, premium: false });
    expect(ZOMBIE_MAPS['station-33']).toMatchObject({ visible: true, betaOnly: true, coop: false, premium: true });
    expect(COOP_ZOMBIE_MAP_ID).toBe('burned-mansion');
    expect(isZombieMapId('station-33')).toBe(true);
    expect(isZombieMapId('classic')).toBe(false);
  });

  it('keeps the map picker above the fixed game canvas', () => {
    expect(css).toMatch(
      /#map-select,\s*#game-over \{[^}]*position: fixed;[^}]*z-index: 20;/,
    );
  });

  it('labels the cards from the registry, locks beta maps and handles them again after reopening the picker', () => {
    const card = (mapId: string): FakeElement => {
      const element = new FakeElement();
      element.dataset.map = mapId;
      element.slots['[data-map-access]'] = new FakeElement();
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
      'beta-message': new FakeElement(),
      'beta-unlock-map': new FakeElement(),
      'beta-thanks': new FakeDialog(),
      'beta-thanks-email': new FakeElement(),
      'beta-thanks-close': new FakeElement(),
    };
    const unlockDialog = elements['beta-unlock'] as FakeDialog;
    const thanksDialog = elements['beta-thanks'] as FakeDialog;
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
      ui.showMapSelect((mapId) => selected.push(mapId), true);
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
      expect(mansion.slots['[data-map-players]'].textContent).toBe('1–2 PLAYERS');
      expect(mansion.slots['[data-map-action]'].textContent).toBe('PLAY');
      expect(station.dataset.access).toBe('premium');
      expect(station.dataset.locked).toBe('false');
      expect(station.slots['[data-map-access]'].textContent).toBe('PREMIUM');
      expect(station.slots['[data-map-players]'].dataset.i18n).toBe('map.players.solo');
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion']);
      expect(mapSelect.classList.contains('hidden')).toBe(true);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`), true);
      station.onclick?.();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);

      // Without an allowed beta session the card stays listed but locked behind the email prompt.
      mansion.focused = false;
      const acceptEmail = vi.fn((email: string) => email === 'bielet40@gmail.com');
      ui.setBetaAccessHandler(acceptEmail);
      ui.showMapSelect((mapId) => selected.push(`tester:${mapId}`), false);
      expect(station.classList.contains('hidden')).toBe(false);
      expect(station.dataset.locked).toBe('true');
      expect(station.slots['[data-map-action]'].dataset.i18n).toBe('menu.unlock');
      expect(mansion.dataset.locked).toBe('false');
      expect(mansion.focused).toBe(true);
      station.onclick?.();
      expect(unlockDialog.open).toBe(true);
      expect(elements['beta-unlock-map'].textContent).toBe('STATION 33');
      expect(mapSelect.classList.contains('hidden')).toBe(false);

      const submit = (email: string): void => {
        elements['beta-email'].value = email;
        elements['beta-access-form'].onsubmit?.({ preventDefault: () => undefined });
      };
      submit('unlisted@example.com');
      expect(elements['beta-message'].dataset.i18n).toBe('beta.denied');
      expect(unlockDialog.open).toBe(true);
      expect(thanksDialog.open).toBe(false);

      // The thanks card appears first; the map opens when the tester leaves it.
      submit('bielet40@gmail.com');
      expect(acceptEmail).toHaveBeenLastCalledWith('bielet40@gmail.com');
      expect(unlockDialog.open).toBe(false);
      expect(thanksDialog.open).toBe(true);
      expect(elements['beta-thanks-email'].textContent).toBe('bielet40@gmail.com');
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);
      elements['beta-thanks-close'].onclick?.();
      expect(thanksDialog.open).toBe(false);
      expect(selected).toEqual(['burned-mansion', 'again:station-33', 'tester:station-33']);
      expect(mapSelect.classList.contains('hidden')).toBe(true);
      expect(station.onclick).toBeNull();
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
    expect(main).toContain('canAccessZombieMap(requestedMap, this.betaAccess.hasBetaAccess())');
    expect(main).toContain('if (!canAccessZombieMap(mapId, this.betaAccess.hasBetaAccess()))');
    expect(main).not.toContain('showModeSelect');
    expect(main).not.toContain('ClassicMode');
  });
});
