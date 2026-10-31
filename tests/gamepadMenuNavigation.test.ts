import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadMenuNavigation } from '../src/ui/GamepadMenuNavigation';
import { GamepadInput } from '../src/player/GamepadInput';
import { DEFAULT_SETTINGS } from '../src/core/PlayerSettings';

class Element extends EventTarget {
  public hidden = false;
  public tabIndex = 0;
  public readonly classList = { contains: () => false };
  public readonly children: Element[] = [];
  public readonly click = vi.fn();
  public readonly scrollIntoView = vi.fn();
  public constructor(private readonly page: { activeElement: Element | null }) { super(); }
  public focus(): void { this.page.activeElement = this; }
  public closest(): Element | null { return this.hidden ? this : null; }
  public getClientRects(): number[] { return this.hidden ? [] : [1]; }
  public matches(_selector: string): boolean { return false; }
  public querySelectorAll(): Element[] { return this.children; }
  public querySelector(selector: string): Element | null { return selector.includes('#pause-resume') ? this.children[0] : null; }
}
class Range extends Element {
  public type = 'range';
  public value = '0.5';
  public min = '0';
  public max = '1';
  public step = '0.1';
}
class Dialog extends Element {
  public readonly close = vi.fn(() => { this.hidden = true; });
}

function setup(menuId = 'pause-menu'): {
  menu: Element; dialog: Dialog; first: Element; second: Element; range: Range;
  page: { activeElement: Element | null }; nav: GamepadMenuNavigation; frame: (buttons?: number[], frames?: number) => void;
  stick: (x: number, y: number) => void;
} {
  const page = { activeElement: null as Element | null };
  const menu = new Element(page);
  const first = new Element(page);
  const second = new Element(page);
  const range = new Range(page);
  menu.children.push(first, second, range);
  const dialog = new Dialog(page);
  dialog.hidden = true;
  dialog.children.push(new Element(page));
  const document = { ...page, get activeElement(): Element | null { return page.activeElement; },
    getElementById: (id: string) => id === menuId ? menu : null,
    querySelectorAll: () => [dialog] } as unknown as Document;
  vi.stubGlobal('HTMLInputElement', Range);
  vi.stubGlobal('HTMLSelectElement', class {});
  vi.stubGlobal('HTMLDialogElement', Dialog);
  const nav = new GamepadMenuNavigation(document);
  const pad = { connected: true, mapping: 'standard', index: 0, id: 'test', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) } as unknown as Gamepad;
  const input = new GamepadInput(() => [pad]);
  const frame = (buttons: number[] = [], frames = 1): void => {
    for (let i = 0; i < pad.buttons.length; i++) Object.assign(pad.buttons[i], { value: buttons.includes(i) ? 1 : 0, pressed: buttons.includes(i) });
    for (let i = 0; i < frames; i++) { input.poll(DEFAULT_SETTINGS); nav.update(1 / 60, input, true); }
  };
  frame();
  return { menu, dialog, first, second, range, page, nav, frame,
    stick: (x, y) => { (pad.axes as number[])[0] = x; (pad.axes as number[])[1] = y; } };
}

afterEach(() => vi.unstubAllGlobals());

describe('controller DOM menu navigation', () => {
  it('focuses visible controls in order and delays held directional repeats', () => {
    const { page, first, second, range, frame } = setup('map-select');
    expect(page.activeElement).toBe(first);
    frame([13]);
    expect(page.activeElement).toBe(second);
    frame([13], 10);
    expect(page.activeElement).toBe(second);
    frame([13], 13);
    expect(page.activeElement).toBe(range);
  });

  it('navigates the main menu with the left stick and rearms the repeat after centering', () => {
    const { page, first, second, frame, stick } = setup('map-select');
    expect(page.activeElement).toBe(first);
    stick(0, 0.9);
    frame();
    expect(page.activeElement).toBe(second);
    stick(0, 0);
    frame();
    stick(0, -0.9);
    frame();
    expect(page.activeElement).toBe(first);
  });

  it('confirms once, adjusts sliders and cancels through the existing resume control', () => {
    const { first, second, range, page, frame } = setup();
    frame([0], 20);
    expect(first.click).toHaveBeenCalledOnce();
    frame();
    range.focus();
    const changed = vi.fn();
    range.addEventListener('input', changed);
    frame([15]);
    expect(Number(range.value)).toBeCloseTo(0.6);
    expect(changed).toHaveBeenCalledOnce();
    frame();
    frame([1]);
    expect(first.click).toHaveBeenCalledTimes(2);
    expect(second.click).not.toHaveBeenCalled();
    expect(page.activeElement).toBe(range);
  });

  it('traps controller navigation in the top modal and honors its cancel handler', () => {
    const { menu, dialog, page, frame, nav } = setup();
    dialog.hidden = false;
    frame();
    expect(nav.blocking).toBe(true);
    expect(page.activeElement).toBe(dialog.children[0]);
    frame([0], 5);
    expect(dialog.children[0].click).toHaveBeenCalledOnce();
    expect(menu.children[0].click).not.toHaveBeenCalled();
    dialog.addEventListener('cancel', event => event.preventDefault());
    frame([1]);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('skips hidden controls and restores focus after closing a dialog', () => {
    const { second, first, dialog, page, frame } = setup();
    second.hidden = true;
    frame([13]);
    expect(page.activeElement).not.toBe(second);
    dialog.hidden = false;
    frame();
    frame([1]);
    expect(dialog.close).toHaveBeenCalledOnce();
    frame();
    expect(page.activeElement).toBe(first);
  });
});
