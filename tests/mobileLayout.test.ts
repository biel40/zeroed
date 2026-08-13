import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

/** Index of the first line that opens a rule for the given selector. */
function ruleIndex(selector: string): number {
  const index = css.indexOf(`\n${selector} {`);
  expect(index, `missing base rule for "${selector}"`).toBeGreaterThan(-1);
  return index;
}

describe('mobile stylesheet cascade', () => {
  /**
   * The mobile overrides target the same ids as the desktop rules, so they
   * carry identical specificity and only source order decides the winner.
   * When they sat earlier in the file, `bottom: 24px` from the desktop rule
   * survived next to the mobile `top`, and the HUD panels stretched from the
   * top of the screen to the bottom. Order is the fix — and this guards it.
   */
  it('declares every coarse-pointer block after the desktop panel rules', () => {
    const lastBaseRule = Math.max(
      ruleIndex('.hud-panel'),
      ruleIndex('#hud-weapon'),
      ruleIndex('#hud-stats'),
      ruleIndex('#hud-zombies'),
    );
    const mediaBlocks = [...css.matchAll(/@media \(pointer: coarse\)/g)].map(
      (match) => match.index ?? -1,
    );

    expect(mediaBlocks.length).toBeGreaterThanOrEqual(3);
    for (const start of mediaBlocks) expect(start).toBeGreaterThan(lastBaseRule);
  });

  it('releases the top-anchored panels from their desktop bottom offset', () => {
    // Without `bottom: auto` a panel is pinned top AND bottom: full-height.
    const coarseBlock = css.slice(css.indexOf('@media (pointer: coarse) {'));
    const weaponRule = coarseBlock.slice(
      coarseBlock.indexOf('#hud-weapon {'),
      coarseBlock.indexOf('}', coarseBlock.indexOf('#hud-weapon {')),
    );
    expect(weaponRule).toContain('bottom: auto');
  });

  it('keeps the touch button wrappers transparent to pointers', () => {
    // Solid wrappers would swallow camera drags in the gaps between buttons.
    const wrappers = css.slice(css.indexOf('.touch-primary,'), css.indexOf('.touch-primary {'));
    expect(wrappers).toContain('pointer-events: none');
    expect(css).toMatch(/#touch-controls button \{[^}]*pointer-events: auto/);
  });
});
