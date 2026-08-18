import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
  it('declares touch-profile overrides after the desktop panel rules', () => {
    const lastBaseRule = Math.max(
      ruleIndex('.hud-panel'),
      ruleIndex('#hud-weapon'),
      ruleIndex('#hud-zombies'),
    );
    expect(css.indexOf('html.touch-controls-enabled #hud-weapon')).toBeGreaterThan(lastBaseRule);
  });

  it('releases the top-anchored panels from their desktop bottom offset', () => {
    // Without `bottom: auto` a panel is pinned top AND bottom: full-height.
    const touchBlock = css.slice(css.indexOf('html.touch-controls-enabled #hud-weapon'));
    const weaponRule = touchBlock.slice(
      touchBlock.indexOf('#hud-weapon {'),
      touchBlock.indexOf('}', touchBlock.indexOf('#hud-weapon {')),
    );
    expect(weaponRule).toContain('bottom: auto');
  });

  it('keeps the touch button wrappers transparent to pointers', () => {
    // Solid wrappers would swallow camera drags in the gaps between buttons.
    const wrappers = css.slice(css.indexOf('.touch-primary,'), css.indexOf('.touch-primary {'));
    expect(wrappers).toContain('pointer-events: none');
    expect(css).toMatch(/#touch-controls button \{[^}]*pointer-events: auto/);
  });

  it('limits browser gesture suppression to the game surface and controls', () => {
    const bodyRule = css.slice(css.indexOf('html,\nbody {'), css.indexOf('}', css.indexOf('html,\nbody {')));
    expect(bodyRule).not.toContain('touch-action: none');
    expect(css).toMatch(/#app canvas \{[^}]*touch-action: none/);
    expect(css).toMatch(/#touch-controls button \{[^}]*touch-action: none/);
  });

  it('keeps only the compact mobile action set with one combined fire button', () => {
    expect(html).not.toContain('id="btn-jump"');
    expect(html).not.toContain('id="btn-ads"');
    for (const action of ['fire', 'reload', 'interact', 'swap-weapon', 'mode', 'pause']) {
      expect(html).toContain(`data-action="${action}"`);
    }
    const touchControls = html.slice(html.indexOf('<div id="touch-controls"'), html.indexOf('</div>\n\n      <div id="hud-weapon"'));
    expect(touchControls.match(/data-action=/g)).toHaveLength(6);
  });

  it('keeps the primary fire button square instead of inheriting the generic button height', () => {
    expect(css).toContain('#touch-controls #btn-fire {');
    expect(css).toContain('html.touch-controls-enabled #touch-controls #btn-fire {');
  });
});
