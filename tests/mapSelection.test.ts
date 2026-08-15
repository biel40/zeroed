import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD } from '../src/ui/HUD';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

class FakeElement {
  readonly classList = {
    add: () => undefined,
    remove: () => undefined,
    toggle: () => false,
  };
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: () => undefined };
  onclick: (() => void) | null = null;
  textContent = '';

  constructor(private readonly children: FakeElement[] = []) {}

  addEventListener(): void {}

  querySelector(selector: string): FakeElement | null {
    return selector === 'span' ? this.children[0] ?? null : null;
  }

  querySelectorAll(): FakeElement[] {
    return this.children;
  }
}

describe('Zombies map selection flow', () => {
  it('exposes one semantic button for each supported map id', () => {
    expect(html).toMatch(/<button type="button" data-map="classic">/);
    expect(html).toMatch(/<button type="button" data-map="burned-mansion">/);
  });

  it('keeps the map picker above the fixed game canvas', () => {
    expect(css).toMatch(
      /#mode-select,\s*#map-select,\s*#game-over \{[^}]*position: fixed;[^}]*z-index: 20;/,
    );
  });

  it('handles both map buttons once after reopening the picker', () => {
    const outdoor = new FakeElement();
    outdoor.dataset.map = 'classic';
    const mansion = new FakeElement();
    mansion.dataset.map = 'burned-mansion';
    const mapSelect = new FakeElement([outdoor, mansion]);
    const loadingBar = new FakeElement([new FakeElement()]);
    const generic = new FakeElement();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: (id: string) =>
          id === 'map-select' ? mapSelect : id === 'loading-bar' ? loadingBar : generic,
      },
    });

    try {
      const selected: string[] = [];
      const ui = new HUD();
      ui.showMapSelect((mapId) => selected.push(mapId));
      outdoor.onclick?.();

      ui.showMapSelect((mapId) => selected.push(mapId));
      mansion.onclick?.();
      expect(selected).toEqual(['classic', 'burned-mansion']);

      ui.showMapSelect((mapId) => selected.push(`again:${mapId}`));
      mansion.onclick?.();
      expect(selected).toEqual(['classic', 'burned-mansion', 'again:burned-mansion']);
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it('forwards the selected id to Zombies game initialization', () => {
    expect(main).toContain("startGame(new ZombiesMode(mapId as 'classic' | 'burned-mansion'))");
  });
});
