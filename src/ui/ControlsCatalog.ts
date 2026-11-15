import { t, type TranslationKey } from '../i18n/i18n';
import { gamepadButtonLabel, type ControllerFamily, type GamepadAction } from '../player/GamepadBindings';
import type { InputDevice } from '../player/InputPresentation';

export type ControlsCategory = 'movement' | 'combat' | 'interaction' | 'other';
export const CONTROLS_CATEGORIES: readonly ControlsCategory[] = ['movement', 'combat', 'interaction', 'other'];

/** KeyboardEvent codes the input reads, plus the mouse, which has none. */
type KeyboardHint = string;
type GamepadHint = GamepadAction | 'leftStick' | 'rightStick';

export interface ControlEntry {
  readonly category: ControlsCategory;
  readonly label: TranslationKey;
  /** Alternatives; each one is a group of keys shown together (WASD). */
  readonly keyboard?: readonly (readonly KeyboardHint[])[];
  readonly gamepad?: GamepadHint;
  /** Name of the on-screen button or gesture. */
  readonly touch?: TranslationKey;
  /** Devices whose row a co-op match hides. */
  readonly coopHidden?: readonly InputDevice[];
}

/**
 * Help text for every control, per device. Controller rows resolve through
 * GAMEPAD_BINDINGS, so the shown buttons always match the real mapping.
 */
export const CONTROL_ENTRIES: readonly ControlEntry[] = [
  { category: 'movement', label: 'controls.move', keyboard: [['KeyW', 'KeyA', 'KeyS', 'KeyD']], gamepad: 'leftStick', touch: 'controls.touchJoystick' },
  { category: 'movement', label: 'controls.aim', keyboard: [['MouseMove']], gamepad: 'rightStick', touch: 'controls.touchLook' },
  { category: 'movement', label: 'controls.jump', keyboard: [['Space']], gamepad: 'jump' },
  { category: 'movement', label: 'controls.crouch', keyboard: [['KeyC']], gamepad: 'crouch', touch: 'touch.crouch' },
  { category: 'movement', label: 'controls.prone', keyboard: [['KeyZ']], gamepad: 'prone' },
  { category: 'combat', label: 'controls.fire', keyboard: [['MouseLeft']], gamepad: 'fire', touch: 'touch.fire' },
  { category: 'combat', label: 'controls.ads', keyboard: [['MouseRight']], gamepad: 'aim', touch: 'touch.aim' },
  { category: 'combat', label: 'controls.reload', keyboard: [['KeyR']], gamepad: 'reload', touch: 'touch.reload' },
  { category: 'combat', label: 'controls.knife', keyboard: [['Digit3'], ['Numpad3']], gamepad: 'knife', touch: 'touch.knife', coopHidden: ['keyboard'] },
  { category: 'combat', label: 'controls.grenade', keyboard: [['KeyG']], gamepad: 'grenade', touch: 'touch.grenade' },
  { category: 'combat', label: 'controls.slots', keyboard: [['Digit1'], ['Digit2']] },
  { category: 'combat', label: 'touch.weaponLabel', gamepad: 'swap', touch: 'touch.weapon' },
  { category: 'combat', label: 'controls.fireMode', keyboard: [['KeyX']], gamepad: 'fireMode', coopHidden: ['keyboard'] },
  { category: 'interaction', label: 'controls.interact', keyboard: [['KeyE']], gamepad: 'interact', touch: 'controls.touchInteract' },
  { category: 'interaction', label: 'controls.inspect', keyboard: [['KeyF']], gamepad: 'inspect' },
  { category: 'other', label: 'controls.release', keyboard: [['Escape']] },
  { category: 'other', label: 'touch.pauseLabel', gamepad: 'pause', touch: 'controls.touchPause' },
];

export interface ControlsRow {
  readonly label: TranslationKey;
  /** Alternatives of key groups, already formatted for display. */
  readonly keys: readonly (readonly string[])[];
  readonly coopHidden: boolean;
}

export interface ControlsSection {
  readonly category: ControlsCategory;
  readonly rows: readonly ControlsRow[];
}

/** A touch screen has no keyboard to describe; any platform can pair a controller. */
export function controlDevices(touchControls: boolean): readonly InputDevice[] {
  return touchControls ? ['touch', 'gamepad'] : ['keyboard', 'gamepad'];
}

export function keyboardKeyLabel(code: KeyboardHint): string {
  switch (code) {
    case 'Space': return t('controls.space');
    case 'Escape': return 'ESC';
    case 'MouseMove': return t('controls.mouse');
    case 'MouseLeft': return t('controls.lmb');
    case 'MouseRight': return t('controls.rmb');
    default: break;
  }
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `NUM ${numpad[1]}`;
  return code.replace(/^(Key|Digit)/, '');
}

function gamepadHintLabel(hint: GamepadHint, family: ControllerFamily): string {
  if (hint === 'leftStick') return 'LS';
  if (hint === 'rightStick') return 'RS';
  return gamepadButtonLabel(hint, family);
}

function entryKeys(entry: ControlEntry, device: InputDevice, family: ControllerFamily): readonly (readonly string[])[] | null {
  if (device === 'keyboard') return entry.keyboard?.map((group) => group.map(keyboardKeyLabel)) ?? null;
  if (device === 'gamepad') return entry.gamepad ? [[gamepadHintLabel(entry.gamepad, family)]] : null;
  return entry.touch ? [[t(entry.touch)]] : null;
}

/** The rows a device can use, grouped in display order. */
export function describeControls(device: InputDevice, family: ControllerFamily): readonly ControlsSection[] {
  return CONTROLS_CATEGORIES.map((category) => ({
    category,
    rows: CONTROL_ENTRIES.flatMap((entry): ControlsRow[] => {
      if (entry.category !== category) return [];
      const keys = entryKeys(entry, device, family);
      return keys ? [{ label: entry.label, keys, coopHidden: entry.coopHidden?.includes(device) ?? false }] : [];
    }),
  }));
}
