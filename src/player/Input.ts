import type { DeviceProfile } from '../core/DeviceProfile';
import { DesktopInput } from './DesktopInput';
import { InputState } from './InputState';
import { MobileInput } from './MobileInput';

const DESKTOP_PROFILE: DeviceProfile = {
  isMobile: false,
  isTouch: false,
  isLowMemory: false,
  pixelRatioLimit: 2,
  shadowQuality: 2,
  useReducedEffects: false,
  useTouchControls: false,
  anisotropyLimit: 8,
  log: {},
};

/**
 * Shared input facade. DesktopInput and MobileInput only translate DOM events;
 * gameplay consumes this single action state regardless of the active device.
 */
export class Input {
  private readonly state = new InputState();
  private readonly desktop: DesktopInput;
  private readonly mobile: MobileInput | null;
  private readonly useTouchControls: boolean;

  onLockChange: ((locked: boolean) => void) | null = null;
  onWeaponSwap: (() => void) | null = null;
  onPauseRequest: (() => void) | null = null;

  constructor(lockElement: HTMLElement, profile: DeviceProfile = DESKTOP_PROFILE) {
    this.useTouchControls = profile.useTouchControls;
    // Keyboard remains available on hybrid devices. Mouse movement still
    // requires pointer lock, which requestPointerLock() suppresses on mobile.
    this.desktop = new DesktopInput(lockElement, this.state, (locked) => {
      this.onLockChange?.(locked);
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

  get mouseDeltaX(): number { return this.state.mouseDeltaX; }
  get mouseDeltaY(): number { return this.state.mouseDeltaY; }
  get leftButtonDown(): boolean { return this.state.leftButtonDown; }
  get rightButtonDown(): boolean { return this.state.rightButtonDown; }
  get pointerLocked(): boolean { return this.state.pointerLocked; }
  get moveAxisX(): number { return this.state.moveAxisX; }
  get moveAxisY(): number { return this.state.moveAxisY; }

  isDown(code: string): boolean {
    return this.state.isDown(code);
  }

  wasPressed(code: string): boolean {
    return this.state.wasPressed(code);
  }

  endFrame(): void {
    this.state.endFrame();
  }

  requestPointerLock(): void {
    if (!this.useTouchControls) this.desktop.requestPointerLock();
  }

  dispose(): void {
    this.desktop.dispose();
    this.mobile?.dispose();
  }
}
