import type { PlayerSettings } from '../core/PlayerSettings';
import { GAMEPAD_ACTIONS, GAMEPAD_BINDINGS, GAMEPAD_MENU_BINDINGS, controllerFamily, type ControllerFamily } from './GamepadBindings';
import { InputState } from './InputState';

interface Stick { x: number; y: number }
export type GamepadStatus = 'unavailable' | 'waiting' | 'unsupported' | 'connected';
type GamepadReader = () => readonly (Gamepad | null)[] | null;

function browserGamepads(): readonly (Gamepad | null)[] | null {
  return typeof globalThis.navigator?.getGamepads === 'function' ? navigator.getGamepads() : null;
}

/** Radial dead zone with continuous magnitude; writes into a reusable result. */
export function radialStick(x: number, y: number, deadZone: number, out: Stick): void {
  x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  const length = Math.hypot(x, y);
  const zone = Number.isFinite(deadZone) ? Math.max(0, Math.min(0.95, deadZone)) : 0.15;
  const scale = length > zone ? (Math.min(1, length) - zone) / ((1 - zone) * length) : 0;
  out.x = x * scale;
  out.y = y * scale;
}

function buttonMask(pad: Gamepad, previous: number): number {
  let mask = 0;
  // Guide (16) is deliberately ignored: the OS may reserve it.
  for (let i = 0; i < Math.min(16, pad.buttons.length); i++) {
    const button = pad.buttons[i];
    const value = Number.isFinite(button?.value) ? button.value : 0;
    const down = i === 6 || i === 7
      ? ((previous & (1 << i)) !== 0 ? value > 0.4 : value >= 0.55)
      : button?.pressed || value >= 0.55;
    if (down) mask |= 1 << i;
  }
  return mask;
}

function meaningfulStick(stick: Stick, previous: Stick): boolean {
  if (Math.hypot(stick.x, stick.y) <= 0.2) {
    previous.x = previous.y = 0;
    return false;
  }
  if (Math.hypot(stick.x - previous.x, stick.y - previous.y) <= 0.05) return false;
  previous.x = stick.x;
  previous.y = stick.y;
  return true;
}

/** Browser snapshots -> isolated local actions. No gameplay, DOM or network dependencies. */
export class GamepadInput {
  public readonly state = new InputState();
  private readonly move: Stick = { x: 0, y: 0 };
  private readonly look: Stick = { x: 0, y: 0 };
  private readonly lastMeaningfulMove: Stick = { x: 0, y: 0 };
  private readonly lastMeaningfulLook: Stick = { x: 0, y: 0 };
  private readonly previousDevices = new Map<number, number>();
  private index: number | null = null;
  private id = '';
  private buttons = 0;
  private pressed = 0;
  private released = 0;
  private blocked = 0;
  private blockMove = false;
  private blockLook = false;
  private focused = true;
  private rearm = false;
  private currentStatus: GamepadStatus = 'waiting';
  private currentFamily: ControllerFamily = 'generic';
  private activity = false;
  private ignored = 0;
  private ignoreMenuStick = false;

  public constructor(private readonly read: GamepadReader = browserGamepads) {}

  public get activeIndex(): number | null { return this.index; }
  public get connected(): boolean { return this.currentStatus === 'connected'; }
  public get status(): GamepadStatus { return this.currentStatus; }
  public get family(): ControllerFamily { return this.currentFamily; }
  public get lookX(): number { return this.blockLook ? 0 : this.look.x; }
  public get lookY(): number { return this.blockLook ? 0 : this.look.y; }
  public get menuX(): number { return this.ignoreMenuStick ? 0 : this.move.x; }
  public get menuY(): number { return this.ignoreMenuStick ? 0 : this.move.y; }
  public get meaningful(): boolean { return this.activity; }

  public isDown(button: number): boolean { return (this.buttons & ~this.ignored & (1 << button)) !== 0; }
  public wasPressed(button: number): boolean { return (this.pressed & (1 << button)) !== 0; }
  public wasReleased(button: number): boolean { return (this.released & (1 << button)) !== 0; }

  public poll(settings: PlayerSettings): void {
    this.state.endFrame();
    this.pressed = this.released = 0;
    this.activity = false;
    if (!this.focused || !settings.gamepadEnabled) {
      this.reset();
      this.rearm = true;
      return;
    }
    let devices: readonly (Gamepad | null)[] | null;
    try { devices = this.read(); } catch { devices = null; }
    if (!devices) {
      this.rearm ||= this.connected;
      this.reset('unavailable');
      return;
    }

    let active: Gamepad | null = null;
    let first: Gamepad | null = null;
    let requested: Gamepad | null = null;
    let unsupported = false;
    for (const device of devices) {
      if (!device?.connected) continue;
      if (device.mapping !== 'standard') { unsupported = true; continue; }
      first ??= device;
      const previous = this.previousDevices.get(device.index) ?? 0;
      const mask = buttonMask(device, previous);
      const menuButton = 1 << GAMEPAD_MENU_BINDINGS.pause;
      if ((mask & menuButton) !== 0 && (previous & menuButton) === 0) requested = device;
      this.previousDevices.set(device.index, mask);
      if (device.index === this.index && device.id === this.id) active = device;
    }
    // Remove disconnected devices; their indices may be reused by the browser.
    for (const index of this.previousDevices.keys()) {
      let present = false;
      for (const device of devices) if (device?.connected && device.index === index) { present = true; break; }
      if (!present) this.previousDevices.delete(index);
    }
    const selected = requested ?? active ?? first;
    const deliberateSwitch = requested !== null && this.index !== null && requested.index !== this.index;
    if (!selected) {
      if (this.index !== null) this.rearm = true;
      this.reset(unsupported ? 'unsupported' : 'waiting');
      return;
    }
    if (selected.index !== this.index || selected.id !== this.id) {
      const switching = this.index !== null;
      this.reset();
      this.index = selected.index;
      this.id = selected.id;
      this.currentFamily = controllerFamily(selected.id);
      this.rearm ||= switching;
    }
    this.currentStatus = 'connected';
    const previous = this.buttons;
    this.buttons = buttonMask(selected, previous);
    radialStick(selected.axes[0] ?? 0, selected.axes[1] ?? 0, settings.gamepadMoveDeadZone, this.move);
    radialStick(selected.axes[2] ?? 0, selected.axes[3] ?? 0, settings.gamepadLookDeadZone, this.look);
    this.blocked &= this.buttons;
    this.ignored &= this.buttons;
    if (this.move.x === 0 && this.move.y === 0) this.blockMove = this.ignoreMenuStick = false;
    if (this.look.x === 0 && this.look.y === 0) this.blockLook = false;
    this.pressed = this.buttons & ~previous & ~this.ignored;
    this.released = previous & ~this.buttons;
    const moveActivity = meaningfulStick(this.move, this.lastMeaningfulMove);
    const lookActivity = meaningfulStick(this.look, this.lastMeaningfulLook);
    this.activity = this.pressed !== 0 || moveActivity || lookActivity;
    if (this.rearm) {
      this.suppressGameplay();
      this.pressed = 0;
      this.activity = deliberateSwitch;
      this.ignored = this.buttons;
      this.ignoreMenuStick = this.move.x !== 0 || this.move.y !== 0;
      this.rearm = false;
    }
  }

  public applyGameplay(enabled: boolean): void {
    if (!enabled || !this.connected) { this.suppressGameplay(); return; }
    const effective = this.buttons & ~this.blocked;
    for (const binding of GAMEPAD_ACTIONS) {
      if (binding.code) this.state.setKey(binding.code, (effective & (1 << binding.button)) !== 0);
    }
    this.state.leftButtonDown = (effective & (1 << GAMEPAD_BINDINGS.fire.button)) !== 0;
    this.state.rightButtonDown = (effective & (1 << GAMEPAD_BINDINGS.aim.button)) !== 0;
    this.state.moveAxisX = this.blockMove ? 0 : this.move.x;
    this.state.moveAxisY = this.blockMove ? 0 : -this.move.y;
  }

  /** Menu transitions must not turn their confirm button into a jump or shot. */
  public suppressGameplay(): void {
    this.blocked |= this.buttons;
    this.blockMove ||= this.move.x !== 0 || this.move.y !== 0;
    this.blockLook ||= this.look.x !== 0 || this.look.y !== 0;
    this.state.releaseAll();
  }

  public setFocused(focused: boolean): void {
    this.focused = focused;
    this.reset();
    this.rearm = true;
  }

  public disconnect(index: number): void {
    this.previousDevices.delete(index);
    if (this.index !== index) return;
    this.reset();
    this.rearm = true;
  }

  private reset(status: GamepadStatus = 'waiting'): void {
    this.state.releaseAll();
    this.state.endFrame();
    this.released = this.buttons;
    this.buttons = this.pressed = this.blocked = 0;
    this.move.x = this.move.y = this.look.x = this.look.y = 0;
    this.blockMove = this.blockLook = false;
    this.index = null;
    this.id = '';
    this.currentStatus = status;
    this.lastMeaningfulMove.x = this.lastMeaningfulMove.y = 0;
    this.lastMeaningfulLook.x = this.lastMeaningfulLook.y = 0;
    this.activity = false;
    this.ignored = 0;
    this.ignoreMenuStick = false;
  }
}
