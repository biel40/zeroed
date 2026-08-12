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

  constructor(private readonly lockElement: HTMLElement) {
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
