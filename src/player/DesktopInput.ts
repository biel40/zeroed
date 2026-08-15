import type { InputState } from './InputState';

type ListenerTarget = Document | HTMLElement;

/** Keyboard, mouse and pointer-lock adapter. It is never created on touch profiles. */
export class DesktopInput {
  private readonly listeners: Array<[ListenerTarget, string, EventListener]> = [];

  constructor(
    private readonly lockElement: HTMLElement,
    private readonly state: InputState,
    onLockChange: (locked: boolean) => void,
  ) {
    this.add(document, 'keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (!keyboardEvent.repeat) this.state.setKey(keyboardEvent.code, true);
    });
    this.add(document, 'keyup', (event) => {
      this.state.setKey((event as KeyboardEvent).code, false);
    });
    this.add(document, 'mousemove', (event) => {
      if (!this.state.pointerLocked) return;
      const mouseEvent = event as MouseEvent;
      this.state.mouseDeltaX += mouseEvent.movementX;
      this.state.mouseDeltaY += mouseEvent.movementY;
    });
    this.add(document, 'mousedown', (event) => {
      if (!this.state.pointerLocked) return;
      const button = (event as MouseEvent).button;
      if (button === 0) this.state.leftButtonDown = true;
      if (button === 2) this.state.rightButtonDown = true;
    });
    this.add(document, 'mouseup', (event) => {
      const button = (event as MouseEvent).button;
      if (button === 0) this.state.leftButtonDown = false;
      if (button === 2) this.state.rightButtonDown = false;
    });
    this.add(document, 'pointerlockchange', () => {
      this.state.pointerLocked = document.pointerLockElement === this.lockElement;
      if (!this.state.pointerLocked) this.state.releaseAll();
      onLockChange(this.state.pointerLocked);
    });
    this.add(this.lockElement, 'contextmenu', (event) => event.preventDefault());
  }

  requestPointerLock(): void {
    try {
      const request = this.lockElement.requestPointerLock() as Promise<void> | undefined;
      request?.catch?.(() => undefined);
    } catch {
      // Pointer lock can be unavailable or rejected outside a user gesture.
    }
  }

  dispose(): void {
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
  }

  private add(target: ListenerTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}
