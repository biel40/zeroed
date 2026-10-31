import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resetSettings, sanitizeSettings, updateSettings } from '../src/core/PlayerSettings';
import type { Input } from '../src/player/Input';
import { PlayerController } from '../src/player/PlayerController';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';

afterEach(() => resetSettings());

function look(fps: number, x: number, y: number, ads = false): PlayerController {
  const player = new PlayerController(1);
  const weapon = new Weapon(WEAPON_DEFINITIONS.m1911);
  weapon.adsAlpha = ads ? 1 : 0;
  const input = { isDown: () => false, wasPressed: () => false, mouseDeltaX: 0, mouseDeltaY: 0,
    moveAxisX: 0, moveAxisY: 0, gamepadLookX: x, gamepadLookY: y } as unknown as Input;
  for (let i = 0; i < fps; i++) player.update(1 / fps, input, weapon);
  return player;
}

describe('controller camera', () => {
  it('rotates in radians per second independently of frame rate and mouse sensitivity', () => {
    const slow = look(30, 0.25, 0.25);
    updateSettings({ lookSensitivity: 3, adsSensitivity: 2, invertY: true });
    const fast = look(144, 0.25, 0.25);
    expect(fast.rig.rotation.y).toBeCloseTo(slow.rig.rotation.y, 9);
    expect(fast.camera.parent!.rotation.x).toBeCloseTo(slow.camera.parent!.rotation.x, 9);
    expect(slow.rig.rotation.y).toBeCloseTo(-Math.PI / 4);
  });

  it('preserves pitch limits, independent inversion and ADS scaling', () => {
    expect(look(60, 0, 1).camera.parent!.rotation.x).toBeCloseTo(-(Math.PI / 2 - 0.02));
    updateSettings({ gamepadInvertY: true });
    expect(look(60, 0, 1).camera.parent!.rotation.x).toBeCloseTo(Math.PI / 2 - 0.02);
    const hip = look(60, 0.25, 0).rig.rotation.y;
    updateSettings({ gamepadAdsSensitivity: 0.5 });
    expect(look(60, 0.25, 0).rig.rotation.y).toBeCloseTo(hip);
    expect(look(60, 0.25, 0, true).rig.rotation.y).toBeCloseTo(hip * 0.5 * WEAPON_DEFINITIONS.m1911.ads.sensitivity);
  });

  it('migrates old preferences and clamps controller settings independently', () => {
    const old = sanitizeSettings({ lookSensitivity: 1.75, masterVolume: 0.2 });
    expect(old.gamepadMoveDeadZone).toBe(DEFAULT_SETTINGS.gamepadMoveDeadZone);
    expect(old.lookSensitivity).toBe(1.75);
    expect(old.masterVolume).toBe(0.2);
    const clamped = sanitizeSettings({ gamepadMoveDeadZone: 1, gamepadLookVertical: -1, gamepadEnabled: false });
    expect(clamped.gamepadMoveDeadZone).toBe(0.5);
    expect(clamped.gamepadLookVertical).toBe(30);
    expect(clamped.gamepadEnabled).toBe(false);
  });
});
