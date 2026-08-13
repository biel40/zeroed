import type { DeviceProfile } from '../core/DeviceProfile';
import { analogStick } from '../utils/math';

type ListenerTarget = Document | HTMLElement | Window;

/** Left fraction of the canvas reserved for the movement joystick. */
const MOVE_ZONE_RATIO = 0.45;
/**
 * Touch look sensitivity relative to the mouse baseline: a comfortable
 * full-width swipe turns the player roughly 180°.
 */
const TOUCH_LOOK_MULTIPLIER = 1.7;
/** Maximum knob travel of the virtual joystick, in CSS pixels. */
const JOYSTICK_RADIUS_PX = 62;
/** Fraction of the radius ignored around the rest position (thumb jitter). */
const JOYSTICK_DEAD_ZONE = 0.14;

/**
 * Centralizes all DOM event listeners so they can be disposed in one place.
 * Mouse buttons are only tracked while the pointer is locked; per-frame edge
 * detection is exposed through wasPressed() and cleared with endFrame().
 *
 * Touch layer (enabled by profile.useTouchControls): the left 45% of the
 * canvas hosts a floating analog joystick (moveAxisX/Y), the rest is the
 * camera zone. Each zone is owned by exactly one pointerId at a time, so
 * multitouch (move + look simultaneously) never mixes coordinates, and
 * pointer capture keeps every drag bound to the canvas until the finger
 * lifts — no camera jumps on press, move, or release.
 */
export class Input {
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  leftButtonDown = false;
  rightButtonDown = false;
  pointerLocked = false;
  /** Analog movement axes (-1..1) written by the virtual joystick. */
  moveAxisX = 0;
  moveAxisY = 0;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Edge action of the touch weapon-swap button (mobile has no 1–5 keys). */
  onWeaponSwap: (() => void) | null = null;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly listeners: Array<[ListenerTarget, string, EventListener]> = [];
  private readonly profile: DeviceProfile;

  /** Camera ownership: exactly one touch pointer rotates the view. */
  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  /** Joystick ownership: exactly one touch pointer drives movement. */
  private movePointerId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;

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
      this.joystickBase = document.getElementById('joystick');
      this.joystickKnob = document.getElementById('joystick-knob');
      this.add(this.lockElement, 'pointerdown', this.handleTouchDown as EventListener);
      this.add(this.lockElement, 'pointermove', this.handleTouchMove as EventListener);
      this.add(this.lockElement, 'pointerup', this.handleTouchEnd as EventListener);
      this.add(this.lockElement, 'pointercancel', this.handleTouchEnd as EventListener);
      this.bindTouchActions();
      // Mobile browser gesture lockdown: no scroll, pinch/double-tap zoom, or
      // long-press context menu may interrupt gameplay. The CSS touch-action
      // covers modern browsers; these listeners cover iOS Safari quirks.
      this.add(document, 'touchmove', (event) => event.preventDefault(), { passive: false });
      this.add(document, 'gesturestart', (event) => event.preventDefault());
      this.add(document, 'gesturechange', (event) => event.preventDefault());
      this.add(document, 'contextmenu', (event) => event.preventDefault());
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
        // Capture keeps the press bound to the button: sliding the finger a
        // few pixels off never drops an held trigger.
        try {
          control.setPointerCapture((event as PointerEvent).pointerId);
        } catch {
          // Non-fatal on older WebKit; the button still works.
        }
        if (action === 'swap-weapon') {
          this.onWeaponSwap?.();
          return;
        }
        this.setVirtualAction(action, true);
      };
      const pointerUp = (event: Event) => {
        event.preventDefault();
        if (action !== 'swap-weapon') this.setVirtualAction(action, false);
      };
      this.add(control, 'pointerdown', pointerDown as EventListener);
      this.add(control, 'pointerup', pointerUp as EventListener);
      this.add(control, 'pointercancel', pointerUp as EventListener);
      // Deliberately no 'pointerleave' release: with pointer capture the
      // press only ends on up/cancel, so held fire never cuts out early.
    }
  }

  private setVirtualAction(action: string, pressed: boolean): void {
    switch (action) {
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
      case 'interact':
        this.setKey('KeyE', pressed);
        break;
      case 'next-weapon':
        this.setKey('Digit2', pressed);
        break;
      case 'prev-weapon':
        this.setKey('Digit1', pressed);
        break;
      case 'swap-weapon':
        // Edge action: fired through onWeaponSwap in bindTouchActions.
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

  /**
   * A touch claims its zone at pointerdown and keeps it until release. The
   * left zone anchors the floating joystick; anywhere else claims the camera
   * with the exact touchdown position as reference (no jump). Extra fingers
   * beyond one per zone are ignored entirely — they can never corrupt the
   * tracked positions (the old single-cursor bug).
   */
  private readonly handleTouchDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    if (event.pointerId === this.lookPointerId || event.pointerId === this.movePointerId) return;

    const rect = this.lockElement.getBoundingClientRect();
    const inMoveZone = event.clientX - rect.left < rect.width * MOVE_ZONE_RATIO;

    if (inMoveZone && this.movePointerId === null) {
      this.movePointerId = event.pointerId;
      this.moveOriginX = event.clientX;
      this.moveOriginY = event.clientY;
      this.moveAxisX = 0;
      this.moveAxisY = 0;
      this.showJoystick(event.clientX, event.clientY);
      this.capturePointer(event.pointerId);
      return;
    }

    if (!inMoveZone && this.lookPointerId === null) {
      this.lookPointerId = event.pointerId;
      this.lookLastX = event.clientX;
      this.lookLastY = event.clientY;
      this.capturePointer(event.pointerId);
    }
  };

  private readonly handleTouchMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;

    if (event.pointerId === this.lookPointerId) {
      // Coalesced samples keep fast high-refresh swipes smooth; fall back to
      // the dispatched event where the API is missing or returns nothing.
      const samples = event.getCoalescedEvents?.() ?? [];
      const points = samples.length > 0 ? samples : [event];
      for (const point of points) {
        this.mouseDeltaX += (point.clientX - this.lookLastX) * TOUCH_LOOK_MULTIPLIER;
        this.mouseDeltaY += (point.clientY - this.lookLastY) * TOUCH_LOOK_MULTIPLIER;
        this.lookLastX = point.clientX;
        this.lookLastY = point.clientY;
      }
      return;
    }

    if (event.pointerId === this.movePointerId) {
      const stick = analogStick(
        event.clientX - this.moveOriginX,
        event.clientY - this.moveOriginY,
        JOYSTICK_RADIUS_PX,
        JOYSTICK_DEAD_ZONE,
      );
      this.moveAxisX = stick.x;
      this.moveAxisY = -stick.y; // screen Y grows downward; forward = up
      if (this.joystickKnob) {
        this.joystickKnob.style.transform =
          `translate(-50%, -50%) translate(${stick.offsetX.toFixed(1)}px, ${stick.offsetY.toFixed(1)}px)`;
      }
    }
  };

  private readonly handleTouchEnd = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    // Only the owning pointer releases its zone; the next touchdown
    // re-anchors its reference position, so deltas never jump.
    if (event.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
    if (event.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveAxisX = 0;
      this.moveAxisY = 0;
      this.hideJoystick();
    }
  };

  private capturePointer(pointerId: number): void {
    try {
      this.lockElement.setPointerCapture(pointerId);
    } catch {
      // Older WebKit may throw for already-ended pointers; tracking continues.
    }
  }

  private showJoystick(clientX: number, clientY: number): void {
    if (!this.joystickBase || !this.joystickKnob) return;
    this.joystickBase.style.transform =
      `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
    this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    this.joystickBase.classList.add('active');
  }

  private hideJoystick(): void {
    this.joystickBase?.classList.remove('active');
  }

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
    this.lookPointerId = null;
    this.movePointerId = null;
    this.moveAxisX = 0;
    this.moveAxisY = 0;
    this.hideJoystick();
  }

  private add(
    target: ListenerTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.listeners.push([target, type, listener]);
  }
}
