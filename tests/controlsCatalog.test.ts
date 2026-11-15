import { describe, expect, it } from 'vitest';
import {
  CONTROL_ENTRIES,
  CONTROLS_CATEGORIES,
  controlDevices,
  describeControls,
  keyboardKeyLabel,
} from '../src/ui/ControlsCatalog';
import { GAMEPAD_BINDINGS, gamepadButtonLabel, type GamepadAction } from '../src/player/GamepadBindings';
import { setLanguage } from '../src/i18n/i18n';

const GAMEPAD_ACTION_NAMES = Object.keys(GAMEPAD_BINDINGS) as GamepadAction[];

describe('controls catalog', () => {
  it('lists every controller action exactly once', () => {
    const listed = CONTROL_ENTRIES.flatMap((entry) => entry.gamepad && entry.gamepad in GAMEPAD_BINDINGS ? [entry.gamepad] : []);
    expect([...listed].sort()).toEqual([...GAMEPAD_ACTION_NAMES].sort());
  });

  it('keeps keyboard hints in sync with the codes the controller mirrors', () => {
    for (const entry of CONTROL_ENTRIES) {
      if (!entry.gamepad || !(entry.gamepad in GAMEPAD_BINDINGS)) continue;
      const code = GAMEPAD_BINDINGS[entry.gamepad as GamepadAction].code;
      if (code === null || !/^(Key|Digit|Space)/.test(code)) continue;
      expect(entry.keyboard?.flat(), entry.label).toContain(code);
    }
  });

  it('fills every category for every device', () => {
    for (const device of ['keyboard', 'touch', 'gamepad'] as const) {
      const sections = describeControls(device, 'xbox');
      expect(sections.map((section) => section.category)).toEqual(CONTROLS_CATEGORIES);
      for (const section of sections) expect(section.rows.length, `${device}/${section.category}`).toBeGreaterThan(0);
    }
  });

  it('labels controller rows with the bound button of the connected family', () => {
    const combat = describeControls('gamepad', 'playstation').find((section) => section.category === 'combat');
    const reload = combat?.rows.find((row) => row.label === 'controls.reload');
    expect(reload?.keys).toEqual([[gamepadButtonLabel('reload', 'playstation')]]);
  });

  it('formats keyboard codes and translated mouse hints', () => {
    setLanguage('es');
    expect(keyboardKeyLabel('KeyW')).toBe('W');
    expect(keyboardKeyLabel('Digit3')).toBe('3');
    expect(keyboardKeyLabel('Numpad3')).toBe('NUM 3');
    expect(keyboardKeyLabel('Escape')).toBe('ESC');
    expect(keyboardKeyLabel('Space')).toBe('Espacio');
    expect(keyboardKeyLabel('MouseLeft')).toBe('Clic izq.');
  });

  it('keeps the co-op restrictions of the former start panel', () => {
    const keyboardRows = describeControls('keyboard', 'generic').flatMap((section) => section.rows);
    const hidden = keyboardRows.filter((row) => row.coopHidden).map((row) => row.label);
    expect(hidden.sort()).toEqual(['controls.fireMode', 'controls.knife']);
    const gamepadRows = describeControls('gamepad', 'generic').flatMap((section) => section.rows);
    expect(gamepadRows.some((row) => row.coopHidden)).toBe(false);
  });

  it('offers the devices the current platform can use', () => {
    expect(controlDevices(false)).toEqual(['keyboard', 'gamepad']);
    expect(controlDevices(true)).toEqual(['touch', 'gamepad']);
  });
});
