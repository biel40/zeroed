import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/PlayerSettings';
import { GamepadInput, radialStick } from '../src/player/GamepadInput';
import { controllerFamily, gamepadButtonLabel } from '../src/player/GamepadBindings';
import { Weapon } from '../src/weapons/Weapon';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';

function pad(index = 2, id = 'Xbox Wireless Controller', mapping = 'standard'): Gamepad {
  return { index, id, mapping, connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) } as unknown as Gamepad;
}
function button(device: Gamepad, index: number, value: number): void {
  Object.assign(device.buttons[index], { value, pressed: value >= 0.5 });
}
function poll(input: GamepadInput, gameplay = true): void {
  input.poll(DEFAULT_SETTINGS);
  input.applyGameplay(gameplay);
}

afterEach(() => vi.unstubAllGlobals());

describe('native gamepad detection', () => {
  it('polls already connected devices at nonzero indices, null slots and reconnections', () => {
    const device = pad();
    let devices: (Gamepad | null)[] = [null, null, device];
    vi.stubGlobal('navigator', { getGamepads: () => devices });
    const input = new GamepadInput();
    poll(input);
    expect(input.connected).toBe(true);
    expect(input.activeIndex).toBe(2);
    button(device, 7, 1);
    poll(input);
    expect(input.state.leftButtonDown).toBe(true);
    devices = [];
    poll(input);
    expect(input.connected).toBe(false);
    expect(input.state.leftButtonDown).toBe(false);
    expect(input.state.moveAxisX).toBe(0);
    devices = [pad(0)];
    poll(input);
    expect(input.activeIndex).toBe(0);
  });

  it('waits for browser exposure and tolerates unavailable or throwing APIs', () => {
    vi.stubGlobal('navigator', undefined);
    const input = new GamepadInput();
    expect(() => poll(input)).not.toThrow();
    expect(input.status).toBe('unavailable');
    vi.stubGlobal('navigator', { getGamepads: () => { throw new Error('SecurityError'); } });
    expect(() => poll(input)).not.toThrow();
    expect(input.connected).toBe(false);
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    poll(input);
    expect(input.status).toBe('waiting');
    vi.stubGlobal('navigator', { getGamepads: () => [pad()] });
    poll(input);
    expect(input.connected).toBe(true);
  });

  it('ignores nonstandard layouts even when their IDs name a known family', () => {
    const device = pad(0, 'DualSense', '');
    button(device, 7, 1);
    const input = new GamepadInput(() => [device]);
    poll(input);
    expect(input.status).toBe('unsupported');
    expect(input.state.leftButtonDown).toBe(false);
  });

  it('keeps one active controller and switches deliberately with Menu on another device', () => {
    const first = pad(1);
    const second = pad(5, 'DualSense');
    const input = new GamepadInput(() => [null, first, second]);
    poll(input);
    button(second, 7, 1);
    poll(input);
    expect(input.activeIndex).toBe(1);
    expect(input.state.leftButtonDown).toBe(false);
    button(second, 9, 1);
    poll(input);
    expect(input.activeIndex).toBe(5);
    expect(input.state.leftButtonDown).toBe(false);
    button(second, 7, 0);
    poll(input);
    button(second, 7, 1);
    poll(input);
    expect(input.state.leftButtonDown).toBe(true);
  });
});

describe('radial analog processing', () => {
  it('removes drift, rescales partial input, clamps diagonals and invalid values', () => {
    const out = { x: 0, y: 0 };
    radialStick(0, 0, 0.15, out);
    expect(out).toEqual({ x: 0, y: 0 });
    radialStick(0.1, 0.1, 0.15, out);
    expect(out).toEqual({ x: 0, y: 0 });
    radialStick(0.575, 0, 0.15, out);
    expect(out.x).toBeCloseTo(0.5);
    radialStick(1, 1, 0.15, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
    expect(out.x).toBeCloseTo(out.y);
    radialStick(Number.NaN, Infinity, 0.15, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('uses forward-positive movement and independent camera axes', () => {
    const device = pad();
    (device.axes as number[]).splice(0, 4, 0.575, -0.575, 1, -1);
    const input = new GamepadInput(() => [device]);
    poll(input);
    expect(input.state.moveAxisX).toBeGreaterThan(0);
    expect(input.state.moveAxisY).toBeGreaterThan(0);
    expect(input.lookX).toBeGreaterThan(0);
    expect(input.lookY).toBeLessThan(0);
  });
});

describe('gamepad button actions', () => {
  it.each([[2, 'KeyR'], [4, 'KeyE'], [3, 'GamepadSwap'], [0, 'Space'], [1, 'KeyC'],
    [10, 'KeyZ'], [11, 'TouchKnife'], [5, 'KeyX'], [8, 'KeyF']] as const)(
    'maps button %i to %s with one press and a held/released state', (index, code) => {
      const device = pad();
      const input = new GamepadInput(() => [device]);
      poll(input);
      button(device, index, 1);
      poll(input);
      expect(input.state.wasPressed(code)).toBe(true);
      expect(input.state.isDown(code)).toBe(true);
      poll(input);
      expect(input.state.wasPressed(code)).toBe(false);
      button(device, index, 0);
      poll(input);
      expect(input.state.isDown(code)).toBe(false);
      expect(input.wasReleased(index)).toBe(true);
    });

  it('applies trigger hysteresis to values rather than the browser digital threshold', () => {
    const device = pad();
    const input = new GamepadInput(() => [device]);
    for (const [value, down] of [[0.54, false], [0.55, true], [0.45, true], [0.4, false], [0.5, false]] as const) {
      button(device, 7, value);
      poll(input);
      expect(input.state.leftButtonDown).toBe(down);
    }
  });

  it('blocks held buttons and sticks across menus, focus loss and disabling until released', () => {
    const device = pad();
    const input = new GamepadInput(() => [device]);
    button(device, 0, 1);
    button(device, 7, 1);
    (device.axes as number[])[1] = -1;
    poll(input, false);
    poll(input, true);
    expect(input.state.leftButtonDown).toBe(false);
    expect(input.state.wasPressed('Space')).toBe(false);
    expect(input.state.moveAxisY).toBe(0);
    input.setFocused(false);
    poll(input);
    expect(input.connected).toBe(false);
    input.setFocused(true);
    poll(input);
    expect(input.state.leftButtonDown).toBe(false);
    button(device, 7, 0);
    (device.axes as number[])[1] = 0;
    poll(input);
    button(device, 7, 1);
    poll(input);
    expect(input.state.leftButtonDown).toBe(true);
    input.poll({ ...DEFAULT_SETTINGS, gamepadEnabled: false });
    expect(input.state.leftButtonDown).toBe(false);
    poll(input);
    expect(input.state.leftButtonDown).toBe(false);
  });

  it.each(['m1911', 'mp5', 'l96'] as const)('feeds %s through the existing Weapon cadence', (id) => {
    const device = pad();
    const input = new GamepadInput(() => [device]);
    const weapon = new Weapon(WEAPON_DEFINITIONS[id]);
    const reference = new Weapon(WEAPON_DEFINITIONS[id]);
    const initial = weapon.ammoInMagazine;
    button(device, 7, 1);
    for (let frame = 0; frame < 120; frame++) {
      poll(input);
      weapon.update(1 / 60, { trigger: input.state.leftButtonDown, ads: false, repeatSemiAuto: false });
      reference.update(1 / 60, { trigger: true, ads: false, repeatSemiAuto: false });
    }
    expect(weapon.ammoInMagazine).toBe(reference.ammoInMagazine);
    expect(initial - weapon.ammoInMagazine).toBeGreaterThanOrEqual(id === 'mp5' ? 2 : 1);
  });
});

describe('controller labels', () => {
  it('uses family heuristics and falls back to physical button numbers', () => {
    expect(controllerFamily('054c-0ce6-Wireless Controller')).toBe('playstation');
    expect(controllerFamily('Sony DualShock 4')).toBe('playstation');
    expect(controllerFamily('Xbox Series X')).toBe('xbox');
    expect(controllerFamily('Steam Virtual Gamepad')).toBe('generic');
    expect(gamepadButtonLabel('interact', 'playstation')).toBe('L1');
    expect(gamepadButtonLabel('interact', 'xbox')).toBe('LB');
    expect(gamepadButtonLabel('reload', 'playstation')).toBe('□');
    expect(gamepadButtonLabel('reload', 'xbox')).toBe('X');
    expect(gamepadButtonLabel('interact', 'generic')).toBe('B5');
  });
});
