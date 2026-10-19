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
  });

  it('lists Burned Mansion for everyone and Station 33 as a single-player premium map', () => {
    expect(ZOMBIE_MAPS['burned-mansion']).toMatchObject({ visible: true, coop: true, premium: false });
    expect(ZOMBIE_MAPS['station-33']).toMatchObject({ visible: true, coop: false, premium: true });
    expect(COOP_ZOMBIE_MAP_ID).toBe('burned-mansion');
    expect(isZombieMapId('station-33')).toBe(true);
    expect(isZombieMapId('classic')).toBe(false);
  });

  it('keeps the map picker above the fixed game canvas', () => {
    expect(css).toMatch(
      /#map-select,\s*#game-over \{[^}]*position: fixed;[^}]*z-index: 20;/,
    );
  });

  it('labels the cards from the registry and handles them again after reopening the picker', () => {
    const card = (mapId: string): FakeElement => {
      const element = new FakeElement();
      element.dataset.map = mapId;
      element.slots['[data-map-access]'] = new FakeElement();
      element.slots['[data-map-players]'] = new FakeElement();
      return element;
    };
    const mansion = card('burned-mansion');
    const station = card('station-33');
    const mapSelect = new FakeElement([mansion, station]);
    const startScreen = new FakeElement();
    const loadingBar = new FakeElement([new FakeElement()]);
    const generic = new FakeElement();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        getElementById: (id: string) =>
          id === 'map-select'
            ? mapSelect
            : id === 'start-screen'
              ? startScreen
              : id === 'loading-bar'
                ? loadingBar
                : generic,
      },
    });

    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);

    try {
      const selected: string[] = [];
      const ui = new HUD();
      ui.showMapSelect((mapId) => selected.push(mapId));
      // The loading screen cross-fades out over the menu before hiding.
      expect(startScreen.classList.contains('leaving')).toBe(true);
      vi.runAllTimers();
      expect(startScreen.classList.contains('hidden')).toBe(true);
      expect(startScreen.classList.contains('leaving')).toBe(false);
      expect(mansion.classList.contains('hidden')).toBe(false);
      expect(station.classList.contains('hidden')).toBe(false);
      expect(mansion.focused).toBe(true);
      expect(mansion.dataset.access).toBe('free');
      expect(mansion.slots['[data-map-access]'].dataset.i18n).toBe('map.access.free');
      expect(mansion.slots['[data-map-players]'].textContent).toBe('1–2 PLAYERS');
      expect(station.dataset.access).toBe('premium');
      expect(station.slots['[data-map-access]'].textContent).toBe('PREMIUM');
      expect(station.slots['[data-map-players]'].dataset.i18n).toBe('map.players.solo');
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion']);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`));
      station.onclick?.();
      expect(selected).toEqual(['burned-mansion', 'again:station-33']);
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
    // ?map= keeps working as a testing shortcut, hidden maps included.
    expect(main).toContain('startGame(new ZombiesMode(requestedMap), requestedMap)');
    expect(main).not.toContain('showModeSelect');
    expect(main).not.toContain('ClassicMode');
  });
});
