import type { GamepadInput } from '../player/GamepadInput';
import { GAMEPAD_MENU_BINDINGS as BUTTONS } from '../player/GamepadBindings';

const FOCUSABLE = 'button, input, select, textarea, summary, a[href], [tabindex="0"]';
const MENU_IDS = ['map-loading', 'ending-screen', 'game-over', 'pause-menu', 'intro-screen', 'start-screen', 'coop-lobby', 'map-select'];

/** Native DOM navigation scoped to the foremost overlay; no synthetic keyboard events. */
export class GamepadMenuNavigation {
  private root: HTMLElement | null = null;
  private direction = 0;
  private repeatIn = 0;
  private readonly candidates: HTMLElement[] = [];
  private readonly menus: readonly (HTMLElement | null)[];

  public constructor(private readonly page: Document = document) {
    this.menus = MENU_IDS.map(id => page.getElementById(id));
  }

  public get blocking(): boolean { return this.findRoot() !== null; }
  public get gameplayOverlay(): boolean { return this.findRoot()?.id === 'intro-screen'; }

  public update(dt: number, input: GamepadInput, active: boolean): void {
    const root = this.findRoot();
    const changed = root !== this.root;
    if (changed) { this.root = root; this.direction = 0; this.repeatIn = 0; }
    if (!root || !active || !input.connected) return;
    const direction = input.isDown(BUTTONS.up) ? -2 : input.isDown(BUTTONS.down) ? 2
      : input.isDown(BUTTONS.left) ? -1 : input.isDown(BUTTONS.right) ? 1
      : input.menuY < -0.55 ? -2 : input.menuY > 0.55 ? 2
      : input.menuX < -0.55 ? -1 : input.menuX > 0.55 ? 1 : 0;
    this.collect(root);
    if (this.candidates.length === 0) return;
    let focused = this.page.activeElement as HTMLElement | null;
    if (!focused || !this.candidates.includes(focused)) {
      focused = this.candidates[0];
      this.focus(focused);
    }
    this.repeatIn -= Math.max(0, Math.min(0.1, dt));
    if (direction && (direction !== this.direction || this.repeatIn <= 0)) {
      this.navigate(focused, direction);
      this.repeatIn = direction !== this.direction ? 0.35 : 0.1;
    }
    this.direction = direction;
    // A transition consumes the opening action; held buttons cannot activate a second overlay.
    if (changed) return;
    if (input.wasPressed(BUTTONS.back) || input.wasPressed(BUTTONS.pause)) { this.cancel(root); return; }
    if (input.wasPressed(BUTTONS.confirm)) this.confirm(this.page.activeElement as HTMLElement);
  }

  private findRoot(): HTMLElement | null {
    // Native modal dialogs and the existing developer console always take precedence.
    const dialogs = this.page.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]');
    for (let i = dialogs.length - 1; i >= 0; i--) if (this.visible(dialogs[i])) return dialogs[i];
    for (const menu of this.menus) if (menu && this.visible(menu) && !menu.classList.contains('leaving')) return menu;
    return null;
  }

  private visible(element: HTMLElement): boolean {
    return !element.closest('[hidden], .hidden, [inert]') && element.getClientRects().length > 0;
  }

  private collect(root: HTMLElement): void {
    this.candidates.length = 0;
    if (root.matches('[tabindex="0"]') && this.visible(root)) this.candidates.push(root);
    for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
      if (!element.matches(':disabled, [aria-disabled="true"], input[type="hidden"]')
        && element.tabIndex >= 0 && this.visible(element)) this.candidates.push(element);
    }
  }

  private navigate(focused: HTMLElement, direction: number): void {
    if (Math.abs(direction) === 1 && focused instanceof HTMLInputElement && focused.type === 'range') {
      const step = Number(focused.step) || 1;
      const value = Number(focused.value) + Math.sign(direction) * step;
      focused.value = String(Math.max(Number(focused.min), Math.min(Number(focused.max), value)));
      focused.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (Math.abs(direction) === 1 && focused instanceof HTMLSelectElement) {
      focused.selectedIndex = Math.max(0, Math.min(focused.options.length - 1, focused.selectedIndex + Math.sign(direction)));
      focused.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const index = this.candidates.indexOf(focused);
    this.focus(this.candidates[(index + Math.sign(direction) + this.candidates.length) % this.candidates.length]);
  }

  private confirm(element: HTMLElement): void {
    // Text entry remains native, including the system/onscreen keyboard where available.
    if (element instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(element.type)) {
      element.focus();
      return;
    }
    element.click();
  }

  private cancel(root: HTMLElement): void {
    if (root instanceof HTMLDialogElement) {
      const event = new Event('cancel', { cancelable: true });
      if (root.dispatchEvent(event)) root.close();
      return;
    }
    const languageOptions = root.querySelector<HTMLElement>('#language-options:not([hidden])');
    if (languageOptions) { root.querySelector<HTMLElement>('#language-toggle')?.click(); return; }
    root.querySelector<HTMLElement>('[data-gamepad-back], #pause-resume, #coop-back, #go-main-menu, #credits-main-menu')?.click();
  }

  private focus(element: HTMLElement): void {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
