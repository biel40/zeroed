import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isZombieMapId, ZOMBIE_MAPS } from '../src/config/zombieMaps';
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

  constructor(private readonly children: FakeElement[] = []) {}

  addEventListener(): void {}

  focus(): void {
    this.focused = true;
  }

  querySelector(selector: string): FakeElement | null {
    return selector === 'span' ? this.children[0] ?? null : null;
  }

  querySelectorAll(): FakeElement[] {
    return this.children;
  }
}

describe('Zombies map selection flow', () => {
  it('exposes Burned Mansion as the only Zombies map', () => {
    expect(html).toMatch(/<button type="button" data-map="burned-mansion">/);
    expect(html.match(/data-map=/g)).toHaveLength(1);
    expect(html).not.toContain('data-mode=');
    expect(html).toContain('ZOMBIES');
    expect(html).toContain('BURNED MANSION');
    expect(ZOMBIE_MAPS['burned-mansion'].visible).toBe(true);
    expect(isZombieMapId('classic')).toBe(false);
  });

  it('keeps the map picker above the fixed game canvas', () => {
    expect(css).toMatch(
      /#map-select,\s*#game-over \{[^}]*position: fixed;[^}]*z-index: 20;/,
    );
  });

  it('handles the mansion button again after reopening the picker', () => {
    const mansion = new FakeElement();
    mansion.dataset.map = 'burned-mansion';
    const mapSelect = new FakeElement([mansion]);
    const startScreen = new FakeElement();
    const loadingBar = new FakeElement([new FakeElement()]);
    const generic = new FakeElement();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
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

    try {
      const selected: string[] = [];
      const ui = new HUD();
      ui.showMapSelect((mapId) => selected.push(mapId));
      expect(startScreen.classList.contains('hidden')).toBe(true);
      expect(mansion.classList.contains('hidden')).toBe(false);
      expect(mansion.focused).toBe(true);
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion']);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`));
      mansion.onclick?.();
      expect(selected).toEqual(['burned-mansion', 'again:burned-mansion']);
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it('forwards the selected id to Zombies game initialization', () => {
    expect(main).toContain('hud.showMapSelect((mapId) =>');
    expect(main).toContain('startGame(new ZombiesMode(mapId))');
    expect(main).not.toContain('showModeSelect');
    expect(main).not.toContain('ClassicMode');
  });
});
