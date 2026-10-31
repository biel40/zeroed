import { getSettings, onSettingsChange } from '../core/PlayerSettings';
import { onLanguageChange, t } from '../i18n/i18n';
import { GamepadMenuNavigation } from '../ui/GamepadMenuNavigation';
import { gamepadButtonLabel, gamepadMenuButtonLabel, GAMEPAD_BINDINGS, type GamepadAction } from './GamepadBindings';
import { GamepadInput } from './GamepadInput';
import { getControllerFamily, getInputDevice, onInputDeviceChange, setInputDevice } from './InputPresentation';

/** App-lifetime controller session, shared by the menu and the current Game loop. */
export class GamepadControls {
  public readonly input = new GamepadInput();
  public onPause: (() => void) | null = null;
  public onUnavailable: (() => void) | null = null;
  public onSuspend: (() => void) | null = null;
  private readonly navigation: GamepadMenuNavigation | null;
  private readonly cleanup: Array<() => void> = [];
  private lastStatus = '';
  private wasConnected = false;

  public constructor() {
    this.navigation = typeof document === 'undefined' ? null : new GamepadMenuNavigation();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden' || !document.hasFocus()) this.input.setFocused(false);
    this.listen(window, 'gamepadconnected', () => { this.lastStatus = ''; });
    this.listen(window, 'gamepaddisconnected', event => {
      const wasConnected = this.input.connected;
      this.input.disconnect((event as GamepadEvent).gamepad.index);
      if (wasConnected && !this.input.connected) {
        this.wasConnected = false;
        this.onUnavailable?.();
      }
    });
    // Captured on window, element blurs arrive here too (a hidden intro or dialog button):
    // only the window's own focus changes count.
    this.listen(window, 'blur', event => { if (event.target === window) this.suspend(); });
    this.listen(window, 'focus', event => {
      if (event.target === window) this.input.setFocused(document.visibilityState !== 'hidden');
    });
    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.suspend();
      else this.input.setFocused(document.hasFocus());
    });
    this.listen(document, 'keydown', event => {
      if (!(event as KeyboardEvent).repeat) setInputDevice('keyboard');
    });
    this.listen(document, 'mousemove', event => {
      const mouse = event as MouseEvent;
      if (Math.abs(mouse.movementX) + Math.abs(mouse.movementY) > 1) setInputDevice('keyboard');
    });
    this.listen(document, 'pointerdown', event => setInputDevice((event as PointerEvent).pointerType === 'mouse' ? 'keyboard' : 'touch'));
    this.listen(document, 'pointermove', event => {
      if ((event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen') setInputDevice('touch');
    });
    this.cleanup.push(onInputDeviceChange(() => this.refreshPrompts()), onLanguageChange(() => this.refreshPrompts()),
      onSettingsChange(() => this.refreshPrompts()));
    this.refreshPrompts();
  }

  public get blockingMenu(): boolean { return this.navigation?.blocking ?? false; }

  public update(dt: number, gameplay: boolean): void {
    this.input.poll(getSettings());
    if (this.wasConnected && !this.input.connected) this.onUnavailable?.();
    this.wasConnected = this.input.connected;
    if (this.input.meaningful) setInputDevice('gamepad', this.input.family);
    const blocking = this.blockingMenu;
    const gameplayOverlay = this.navigation?.gameplayOverlay ?? false;
    this.navigation?.update(dt, this.input, getInputDevice() === 'gamepad');
    if (this.input.wasPressed(GAMEPAD_BINDINGS.pause.button) && (!blocking || gameplayOverlay) && gameplay) this.onPause?.();
    // UI activation can open/close a modal or start/dispose a match synchronously.
    this.input.applyGameplay(gameplay && !blocking && !this.blockingMenu);
    if (this.lastStatus !== this.input.status) this.refreshPrompts();
  }

  public dispose(): void {
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup.length = 0;
    this.input.setFocused(false);
    this.onPause = this.onUnavailable = this.onSuspend = null;
  }

  private suspend(): void {
    this.input.setFocused(false);
    this.onSuspend?.();
  }

  private refreshPrompts(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.inputDevice = getInputDevice();
    for (const element of document.querySelectorAll<HTMLElement>('[data-gamepad-binding]')) {
      const action = element.dataset.gamepadBinding;
      if (action && Object.hasOwn(GAMEPAD_BINDINGS, action)) {
        element.textContent = gamepadButtonLabel(action as GamepadAction, getControllerFamily());
      }
    }
    this.lastStatus = this.input.status;
    const status = document.getElementById('gamepad-status');
    if (status) status.textContent = t(!getSettings().gamepadEnabled ? 'gamepad.disabled' : `gamepad.${this.input.status}`);
    const resume = document.getElementById('pause-resume');
    if (resume) resume.dataset.gamepadLabel = gamepadMenuButtonLabel('pause', getControllerFamily());
    const introHint = document.querySelector<HTMLElement>('#intro-skip small');
    if (introHint) introHint.textContent = getInputDevice() === 'gamepad'
      ? gamepadMenuButtonLabel('confirm', getControllerFamily()) : t('intro.skipHint');
    const menuHelp = document.getElementById('gamepad-menu-help');
    if (menuHelp) menuHelp.textContent = t('gamepad.menuHelp', {
      confirm: gamepadMenuButtonLabel('confirm', getControllerFamily()),
      cancel: gamepadMenuButtonLabel('back', getControllerFamily()),
    });
  }

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler, true);
    this.cleanup.push(() => target.removeEventListener(type, handler, true));
  }
}
