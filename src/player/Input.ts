import type { DeviceProfile } from '../core/DeviceProfile';
import { DesktopInput } from './DesktopInput';
import { InputState } from './InputState';
import { MobileInput } from './MobileInput';
import { GamepadControls } from './GamepadControls';
import { getInputDevice } from './InputPresentation';

const DESKTOP_PROFILE: DeviceProfile = {
  isMobile: false,
  isTouch: false,
  isLowMemory: false,
  quality: 'high',
  pixelRatioLimit: 2,
  shadowQuality: 2,
  useReducedEffects: false,
  useTouchControls: false,
  anisotropyLimit: 8,
};

/**
 * Shared input facade. Device adapters translate physical input; gameplay reads
 * merged actions while each adapter retains ownership of its held state.
 */
export class Input {
  private readonly state = new InputState();
  private readonly desktop: DesktopInput;
  private readonly mobile: MobileInput | null;
  private readonly useTouchControls: boolean;
  private readonly gamepad: GamepadControls;
  private readonly ownsGamepad: boolean;

  public onLockChange: ((locked: boolean) => void) | null = null;
  public onWeaponSwap: (() => void) | null = null;
  public onPauseRequest: (() => void) | null = null;
  public onKeyInput: ((key: string) => void) | null = null;
  public onControllerUnavailable: (() => void) | null = null;
  public onFocusLost: (() => void) | null = null;
  public onPointerLockRequest: (() => void) | null = null;

  public constructor(lockElement: HTMLElement, profile: DeviceProfile = DESKTOP_PROFILE, gamepad?: GamepadControls) {
    this.gamepad = gamepad ?? new GamepadControls();
    this.ownsGamepad = gamepad === undefined;
    this.gamepad.onPause = () => this.onPauseRequest?.();
    this.gamepad.onUnavailable = () => this.onControllerUnavailable?.();
    this.gamepad.onSuspend = () => this.onFocusLost?.();
    this.useTouchControls = profile.useTouchControls;
    // Keyboard remains available on hybrid devices. Mouse movement still
    // requires pointer lock, which requestPointerLock() suppresses on mobile.
    this.desktop = new DesktopInput(lockElement, this.state, (locked) => {
      this.onLockChange?.(locked);
    }, (key) => {
      this.onKeyInput?.(key);
    }, () => {
      this.onPointerLockRequest?.();
    });
    if (profile.useTouchControls) {
      this.mobile = new MobileInput(lockElement, this.state, {
        onWeaponSwap: () => this.onWeaponSwap?.(),
        onPauseRequest: () => this.onPauseRequest?.(),
      });
    } else {
      this.mobile = null;
    }
  }

  public get mouseDeltaX(): number { return this.state.mouseDeltaX; }
  public get mouseDeltaY(): number { return this.state.mouseDeltaY; }
  public get leftButtonDown(): boolean { return this.state.leftButtonDown || this.gamepad.input.state.leftButtonDown; }
  public get rightButtonDown(): boolean { return this.state.rightButtonDown || this.gamepad.input.state.rightButtonDown; }
  public get repeatSemiAuto(): boolean { return this.state.repeatSemiAuto; }
  public get pointerLocked(): boolean { return this.state.pointerLocked; }
  public get moveAxisX(): number { return this.state.moveAxisX + this.gamepad.input.state.moveAxisX; }
  public get moveAxisY(): number { return this.state.moveAxisY + this.gamepad.input.state.moveAxisY; }
  public get gamepadLookX(): number { return this.gamepad.input.lookX; }
  public get gamepadLookY(): number { return this.gamepad.input.lookY; }
  public get gamepadConnected(): boolean { return this.gamepad.input.connected; }
  public get usingGamepad(): boolean { return getInputDevice() === 'gamepad'; }
  public get blockingMenu(): boolean { return this.gamepad.blockingMenu; }

  public updateGamepad(dt: number, gameplay: boolean): void { this.gamepad.update(dt, gameplay); }
  public suppressGamepad(): void { this.gamepad.input.suppressGameplay(); }

  public isDown(code: string): boolean {
    return this.state.isDown(code) || this.gamepad.input.state.isDown(code);
  }

  public wasPressed(code: string): boolean {
    return this.state.wasPressed(code) || this.gamepad.input.state.wasPressed(code);
  }

  public endFrame(): void {
    this.state.endFrame();
    this.gamepad.input.state.endFrame();
  }

  public releaseAll(): void {
    this.state.releaseAll();
    this.state.endFrame();
    this.suppressGamepad();
  }

  public requestPointerLock(): void {
    if (!this.useTouchControls) this.desktop.requestPointerLock();
  }

  public dispose(): void {
    this.releaseAll();
    this.desktop.dispose();
    this.mobile?.dispose();
    this.gamepad.onPause = this.gamepad.onUnavailable = this.gamepad.onSuspend = null;
    if (this.ownsGamepad) this.gamepad.dispose();
  }
}
