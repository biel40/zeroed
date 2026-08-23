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

  it('keeps only the required mobile action set with one combined fire button', () => {
    expect(html).not.toContain('id="btn-jump"');
    expect(html).not.toContain('id="btn-ads"');
    expect(html).not.toContain('id="btn-mode"');
    for (const action of ['fire', 'reload', 'interact', 'swap-weapon', 'pause']) {
      expect(html).toContain(`data-action="${action}"`);
    }
    const touchControls = html.slice(html.indexOf('<div id="touch-controls"'), html.indexOf('</div>\n\n      <div id="hud-weapon"'));
    expect(touchControls.match(/data-action=/g)).toHaveLength(5);
  });

  it('keeps comfortable secondary targets and a dominant square fire button', () => {
    expect(css).toContain('--touch-secondary-size: clamp(52px, 6vw, 58px)');
    expect(css).toContain('--touch-fire-size: clamp(92px, 7vw, 116px)');
    expect(css).toMatch(/#touch-controls button \{[^}]*min-width: 48px;[^}]*height: 48px/);
    expect(css).toContain('#touch-controls #btn-fire {');
    expect(css).not.toContain('width: 70px; height: 70px');
  });

  it('positions the action cluster inside the right and bottom safe areas', () => {
    expect(css).toContain('env(safe-area-inset-right, 0px)');
    expect(css).toContain('env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('grid-template-columns: repeat(2, var(--touch-secondary-size))');
    expect(css).toContain('var(--touch-fire-size) + var(--touch-fire-gap)');
  });

  it('provides immediate pressed feedback without an input-delaying transition', () => {
    const activeRule = css.slice(
      css.indexOf('#touch-controls button:active {'),
      css.indexOf('}', css.indexOf('#touch-controls button:active {')),
    );
    expect(activeRule).toContain('transform: scale(0.94)');
    expect(activeRule).toContain('filter: brightness(1.15)');
    expect(activeRule).not.toContain('transition');
  });
});
