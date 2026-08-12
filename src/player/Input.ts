import type { DeviceProfile } from '../core/DeviceProfile';

type ListenerTarget = Document | HTMLElement | Window;

/**
 * Centralizes all DOM event listeners so they can be disposed in one place.
 * Mouse buttons are only tracked while the pointer is locked; per-frame edge
 * detection is exposed through wasPressed() and cleared with endFrame().
 */
export class Input {
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  leftButtonDown = false;
  rightButtonDown = false;
  pointerLocked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly listeners: Array<[ListenerTarget, string, EventListener]> = [];
  private readonly profile: DeviceProfile;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private touchDragging = false;

  constructor(
    private readonly lockElement: HTMLElement,
    profile: DeviceProfile = {
      isMobile: false,
      isTouch: false,
      isLowMemory: false,
      pixelRatioLimit: 2,
      shadowQuality: 2,
      useReducedEffects: false,
      useTouchControls: false,
      anisotropyLimit: 8,
      log: {},
    },
  ) {
    this.profile = profile;
    this.add(document, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      if (e.repeat) return;
      this.keysDown.add(e.code);
      this.keysPressed.add(e.code);
    });
    this.add(document, 'keyup', (event) => {
      this.keysDown.delete((event as KeyboardEvent).code);
    });
    this.add(document, 'mousemove', (event) => {
      if (!this.pointerLocked) return;
      const e = event as MouseEvent;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });
    this.add(document, 'mousedown', (event) => {
      if (!this.pointerLocked) return;
      const button = (event as MouseEvent).button;
      if (button === 0) this.leftButtonDown = true;
      if (button === 2) this.rightButtonDown = true;
    });
    this.add(document, 'mouseup', (event) => {
      const button = (event as MouseEvent).button;
      if (button === 0) this.leftButtonDown = false;
      if (button === 2) this.rightButtonDown = false;
    });
    if (this.profile.useTouchControls) {
      this.add(this.lockElement, 'pointerdown', this.handlePointerDown as EventListener);
      this.add(this.lockElement, 'pointermove', this.handlePointerMove as EventListener);
      this.add(this.lockElement, 'pointerup', this.handlePointerUp as EventListener);
      this.add(this.lockElement, 'pointercancel', this.handlePointerUp as EventListener);
      this.bindTouchActions();
    }
    this.add(this.lockElement, 'contextmenu', (event) => event.preventDefault());
    this.add(document, 'pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.lockElement;
      if (!this.pointerLocked) this.releaseAll();
      this.onLockChange?.(this.pointerLocked);
    });
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  endFrame(): void {
    this.keysPressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  requestPointerLock(): void {
    try {
      const request = this.lockElement.requestPointerLock() as Promise<void> | undefined;
      request?.catch?.(() => undefined);
    } catch {
      // Pointer lock unavailable or throttled; the start screen stays visible.
    }
  }

  private bindTouchActions(): void {
    const controls = document.querySelectorAll<HTMLElement>('[data-action]');
    for (const control of controls) {
      const action = control.dataset.action;
      if (!action) continue;
      const pointerDown = (event: Event) => {
        event.preventDefault();
        this.setVirtualAction(action, true);
      };
      const pointerUp = (event: Event) => {
        event.preventDefault();
        this.setVirtualAction(action, false);
      };
      this.add(control, 'pointerdown', pointerDown as EventListener);
      this.add(control, 'pointerup', pointerUp as EventListener);
      this.add(control, 'pointerleave', pointerUp as EventListener);
      this.add(control, 'pointercancel', pointerUp as EventListener);
    }
  }

  private setVirtualAction(action: string, pressed: boolean): void {
    switch (action) {
      case 'forward':
        this.setKey('KeyW', pressed);
        break;
      case 'backward':
        this.setKey('KeyS', pressed);
        break;
      case 'left':
        this.setKey('KeyA', pressed);
        break;
      case 'right':
        this.setKey('KeyD', pressed);
        break;
      case 'fire':
        this.leftButtonDown = pressed;
        if (pressed) this.keysPressed.add('TouchFire');
        this.setKey('TouchFire', pressed);
        break;
      case 'ads':
        this.rightButtonDown = pressed;
        if (pressed) this.keysPressed.add('TouchADS');
        this.setKey('TouchADS', pressed);
        break;
      case 'reload':
        this.setKey('KeyR', pressed);
        break;
      case 'mode':
        this.setKey('KeyX', pressed);
        break;
      case 'next-weapon':
        this.setKey('Digit2', pressed);
        break;
      case 'prev-weapon':
        this.setKey('Digit1', pressed);
        break;
      default:
        break;
    }
  }

  private setKey(code: string, pressed: boolean): void {
    if (pressed) {
      this.keysDown.add(code);
      this.keysPressed.add(code);
      return;
    }
    this.keysDown.delete(code);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.touchDragging = true;
    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.touchDragging || event.pointerType !== 'touch') return;
    const deltaX = event.clientX - this.lastTouchX;
    const deltaY = event.clientY - this.lastTouchY;
    this.mouseDeltaX += deltaX;
    this.mouseDeltaY += deltaY;
    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;
  };

  private readonly handlePointerUp = (): void => {
    this.touchDragging = false;
  };

  dispose(): void {
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
  }

  private releaseAll(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.leftButtonDown = false;
    this.rightButtonDown = false;
  }

  private add(target: ListenerTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}
