export type ControllerFamily = 'xbox' | 'playstation' | 'generic';

/** W3C standard mapping only. Separate reload preserves held repair/revive. */
export const GAMEPAD_BINDINGS = {
  jump: { button: 0, code: 'Space' },
  crouch: { button: 1, code: 'KeyC' },
  interact: { button: 4, code: 'KeyE' },
  swap: { button: 3, code: 'GamepadSwap' },
  reload: { button: 2, code: 'KeyR' },
  fireMode: { button: 5, code: 'KeyX' },
  aim: { button: 6, code: null },
  fire: { button: 7, code: null },
  inspect: { button: 8, code: 'KeyF' },
  pause: { button: 9, code: null },
  prone: { button: 10, code: 'KeyZ' },
  knife: { button: 11, code: 'TouchKnife' },
} as const;

export type GamepadAction = keyof typeof GAMEPAD_BINDINGS;
export const GAMEPAD_ACTIONS: readonly (typeof GAMEPAD_BINDINGS)[GamepadAction][] = Object.values(GAMEPAD_BINDINGS);
export const GAMEPAD_MENU_BINDINGS = { confirm: 0, back: 1, pause: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'];
const PLAYSTATION = ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share/Create', 'Options', 'L3', 'R3'];

export function controllerFamily(id: string): ControllerFamily {
  if (/playstation|dualshock|dualsense|sony|054c/i.test(id)) return 'playstation';
  if (/xbox|xinput|045e/i.test(id)) return 'xbox';
  return 'generic';
}

export function gamepadButtonLabel(action: GamepadAction, family: ControllerFamily): string {
  return buttonLabel(GAMEPAD_BINDINGS[action].button, family);
}

export function gamepadMenuButtonLabel(action: keyof typeof GAMEPAD_MENU_BINDINGS, family: ControllerFamily): string {
  return buttonLabel(GAMEPAD_MENU_BINDINGS[action], family);
}

function buttonLabel(button: number, family: ControllerFamily): string {
  return (family === 'playstation' ? PLAYSTATION[button] : family === 'xbox' ? XBOX[button] : null)
    ?? `B${button + 1}`;
}
