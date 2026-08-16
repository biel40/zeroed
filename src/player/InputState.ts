/** Shared action state consumed by the player, weapons and game modes. */
export class InputState {
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  leftButtonDown = false;
  rightButtonDown = false;
  repeatSemiAuto = false;
  pointerLocked = false;
  moveAxisX = 0;
  moveAxisY = 0;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  setKey(code: string, pressed: boolean): void {
    if (pressed) {
      if (!this.keysDown.has(code)) this.keysPressed.add(code);
      this.keysDown.add(code);
      return;
    }
    this.keysDown.delete(code);
  }

  endFrame(): void {
    this.keysPressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  releaseAll(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.leftButtonDown = false;
    this.rightButtonDown = false;
    this.repeatSemiAuto = false;
    this.moveAxisX = 0;
    this.moveAxisY = 0;
  }
}
