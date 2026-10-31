import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadControls } from '../src/player/GamepadControls';

/** Minimal page: window and document as plain event targets, the page focused and visible. */
function installPage(): { window: EventTarget; document: EventTarget } {
  const page = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    hasFocus: () => true,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { dataset: {} },
  });
  const view = new EventTarget();
  vi.stubGlobal('window', view);
  vi.stubGlobal('document', page);
  return { window: view, document: page };
}

describe('Gamepad focus tracking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('suspends only when the window itself loses focus, not when an element blurs', () => {
    const page = installPage();
    const controls = new GamepadControls();
    const suspended = vi.fn();
    controls.onSuspend = suspended;
    // An element's blur reaches the window's capture listener with that element as target.
    const button = new EventTarget();
    page.window.dispatchEvent(Object.defineProperty(new Event('blur'), 'target', { value: button }));
    expect(suspended).not.toHaveBeenCalled();
    page.window.dispatchEvent(new Event('blur'));
    expect(suspended).toHaveBeenCalledOnce();
    controls.dispose();
  });
});
