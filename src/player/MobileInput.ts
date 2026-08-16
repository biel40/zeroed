import { analogStick, clamp, type AnalogStickResult } from '../utils/math';
import { resolveTouchZone } from './touchLayout';
import type { InputState } from './InputState';

type ListenerTarget = Document | HTMLElement;

export const MOBILE_INPUT_CONFIG = {
  /** Multiplier applied before the shared PlayerController sensitivity. */
  lookSensitivity: 1.7,
  joystickDeadZone: 0.14,
} as const;

interface MobileInputActions {
  readonly onWeaponSwap: () => void;
  readonly onPauseRequest: () => void;
}

/** Maps touch actions onto the shared desktop-compatible player state. */
export function applyMobileAction(state: InputState, action: string, pressed: boolean): void {
  switch (action) {
    case 'fire':
      // 1-Tap ADS Fire: held touch repeats semi-auto at the weapon's real cadence.
      state.leftButtonDown = pressed;
      state.rightButtonDown = pressed;
      state.repeatSemiAuto = pressed;
      break;
    case 'reload':
      state.setKey('KeyR', pressed);
      break;
    case 'mode':
      state.setKey('KeyX', pressed);
      break;
    case 'interact':
      state.setKey('KeyE', pressed);
      break;
    default:
      break;
  }
}

/** Pointer-event adapter for analog movement, touch look and action buttons. */
export class MobileInput {
  private readonly listeners: Array<[ListenerTarget, string, EventListener]> = [];
  private readonly buttonOwners = new Map<HTMLElement, number>();
  private readonly joystickBase = document.getElementById('joystick');
  private readonly joystickKnob = document.getElementById('joystick-knob');
  private readonly stickResult: AnalogStickResult = { x: 0, y: 0, offsetX: 0, offsetY: 0 };

  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private movePointerId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private joystickRadius = 62;

  constructor(
    private readonly surface: HTMLElement,
    private readonly state: InputState,
    private readonly actions: MobileInputActions,
  ) {
    this.add(surface, 'pointerdown', this.handleSurfaceDown as EventListener);
    this.add(surface, 'pointermove', this.handleSurfaceMove as EventListener);
    this.add(surface, 'pointerup', this.handleSurfaceEnd as EventListener);
    this.add(surface, 'pointercancel', this.handleSurfaceEnd as EventListener);
    this.add(surface, 'lostpointercapture', this.handleSurfaceEnd as EventListener);
    this.bindActionButtons();
  }

  dispose(): void {
    this.releaseAll();
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
  }

  private bindActionButtons(): void {
    const root = document.getElementById('touch-controls');
    if (!root) return;
    for (const control of root.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = control.dataset.action;
      if (!action) continue;

      const pointerDown = (event: Event): void => {
        const pointerEvent = event as PointerEvent;
        if (pointerEvent.pointerType === 'mouse' || this.buttonOwners.has(control)) return;
        event.preventDefault();
        event.stopPropagation();
        this.buttonOwners.set(control, pointerEvent.pointerId);
        this.capturePointer(control, pointerEvent.pointerId);
        if (action === 'swap-weapon') this.actions.onWeaponSwap();
        else if (action === 'pause') this.actions.onPauseRequest();
        else applyMobileAction(this.state, action, true);
      };
      const pointerEnd = (event: Event): void => {
        const pointerEvent = event as PointerEvent;
        if (this.buttonOwners.get(control) !== pointerEvent.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        this.buttonOwners.delete(control);
        if (action !== 'swap-weapon' && action !== 'pause') {
          applyMobileAction(this.state, action, false);
        }
      };

      this.add(control, 'pointerdown', pointerDown as EventListener);
      this.add(control, 'pointerup', pointerEnd as EventListener);
      this.add(control, 'pointercancel', pointerEnd as EventListener);
      this.add(control, 'lostpointercapture', pointerEnd as EventListener);
    }
  }

  private readonly handleSurfaceDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    const rect = this.surface.getBoundingClientRect();
    const zone = resolveTouchZone(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );

    if (zone === 'move' && this.movePointerId === null) {
      this.movePointerId = event.pointerId;
      this.moveOriginX = event.clientX;
      this.moveOriginY = event.clientY;
      this.state.moveAxisX = 0;
      this.state.moveAxisY = 0;
      this.showJoystick(event.clientX, event.clientY, rect);
      this.capturePointer(this.surface, event.pointerId);
    } else if (zone === 'look' && this.lookPointerId === null) {
      this.lookPointerId = event.pointerId;
      this.lookLastX = event.clientX;
      this.lookLastY = event.clientY;
      this.capturePointer(this.surface, event.pointerId);
    }
  };

  private readonly handleSurfaceMove = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    if (event.pointerId === this.lookPointerId) {
      event.preventDefault();
      const samples = event.getCoalescedEvents?.();
      if (samples && samples.length > 0) {
        for (const point of samples) this.applyLookPoint(point.clientX, point.clientY);
      } else {
        this.applyLookPoint(event.clientX, event.clientY);
      }
      return;
    }
    if (event.pointerId !== this.movePointerId) return;
    event.preventDefault();
    const stick = analogStick(
      event.clientX - this.moveOriginX,
      event.clientY - this.moveOriginY,
      this.joystickRadius,
      MOBILE_INPUT_CONFIG.joystickDeadZone,
      this.stickResult,
    );
    this.state.moveAxisX = stick.x;
    this.state.moveAxisY = -stick.y;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform =
        `translate(-50%, -50%) translate(${stick.offsetX.toFixed(1)}px, ${stick.offsetY.toFixed(1)}px)`;
    }
  };

  private readonly handleSurfaceEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointerId) this.lookPointerId = null;
    if (event.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.state.moveAxisX = 0;
      this.state.moveAxisY = 0;
      this.hideJoystick();
    }
  };

  private applyLookPoint(clientX: number, clientY: number): void {
    this.state.mouseDeltaX += (clientX - this.lookLastX) * MOBILE_INPUT_CONFIG.lookSensitivity;
    this.state.mouseDeltaY += (clientY - this.lookLastY) * MOBILE_INPUT_CONFIG.lookSensitivity;
    this.lookLastX = clientX;
    this.lookLastY = clientY;
  }

  private showJoystick(clientX: number, clientY: number, surfaceRect: DOMRect): void {
    if (!this.joystickBase || !this.joystickKnob) return;
    this.joystickRadius = this.joystickBase.offsetWidth / 2 || this.joystickRadius;
    const x = clamp(clientX, surfaceRect.left + this.joystickRadius, surfaceRect.right - this.joystickRadius);
    const y = clamp(clientY, surfaceRect.top + this.joystickRadius, surfaceRect.bottom - this.joystickRadius);
    this.joystickBase.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    this.joystickBase.classList.add('active');
  }

  private hideJoystick(): void {
    this.joystickBase?.classList.remove('active');
  }

  private capturePointer(element: HTMLElement, pointerId: number): void {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Older WebKit can reject capture after a pointer has already ended.
    }
  }

  private releaseAll(): void {
    this.lookPointerId = null;
    this.movePointerId = null;
    this.buttonOwners.clear();
    this.state.releaseAll();
    this.hideJoystick();
  }

  private add(target: ListenerTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}
