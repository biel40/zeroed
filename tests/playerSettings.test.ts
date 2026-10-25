import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  effectsGain,
  getSettings,
  musicGain,
  onSettingsChange,
  resetSettings,
  sanitizeSettings,
  SETTING_RANGES,
  updateSettings,
} from '../src/core/PlayerSettings';
import type { Input } from '../src/player/Input';
import { PlayerController } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';

function lookInput(dx: number, dy: number): Input {
  return {
    isDown: () => false,
    wasPressed: () => false,
    mouseDeltaX: dx,
    mouseDeltaY: dy,
    moveAxisX: 0,
    moveAxisY: 0,
  } as unknown as Input;
}

function weapon(adsAlpha: number): Weapon {
  return {
    definition: { ads: { fov: 50, sensitivity: 0.5 }, moveSpeedMultiplier: 1 },
    adsAlpha,
    recoil: { pitch: 0, yaw: 0 },
  } as unknown as Weapon;
}

/** Yaw and pitch after one look step from a fresh controller. */
function look(dx: number, dy: number, adsAlpha = 0): { yaw: number; pitch: number } {
  const player = new PlayerController(1);
  player.update(1 / 60, lookInput(dx, dy), weapon(adsAlpha));
  return { yaw: player.rig.rotation.y, pitch: player.camera.parent!.rotation.x };
}

describe('player settings', () => {
  afterEach(() => {
    resetSettings();
    vi.unstubAllGlobals();
  });

  it('fills missing or invalid values with defaults and clamps ranges', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ masterVolume: 'loud', invertY: 1, fieldOfView: Number.NaN })).toEqual(DEFAULT_SETTINGS);
    const clamped = sanitizeSettings({ musicVolume: 4, lookSensitivity: -2, fieldOfView: 200, invertY: true });
    expect(clamped.musicVolume).toBe(SETTING_RANGES.musicVolume.max);
    expect(clamped.lookSensitivity).toBe(SETTING_RANGES.lookSensitivity.min);
    expect(clamped.fieldOfView).toBe(SETTING_RANGES.fieldOfView.max);
    expect(clamped.invertY).toBe(true);
  });

  it('applies partial updates, notifies listeners and resets to defaults', () => {
    let changes = 0;
    const stop = onSettingsChange(() => changes++);
    updateSettings({ masterVolume: 0.5, effectsVolume: 0.4, musicVolume: 0.2 });
    expect(getSettings().lookSensitivity).toBe(DEFAULT_SETTINGS.lookSensitivity);
    expect(effectsGain()).toBeCloseTo(0.2);
    expect(musicGain()).toBeCloseTo(0.1);
    resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    stop();
    updateSettings({ invertY: true });
    expect(changes).toBe(2);
  });

  it('keeps interaction hints enabled for old saves and rejects non-boolean values', () => {
    expect(sanitizeSettings({ masterVolume: 0.5 }).showInteractionPrompts).toBe(true);
    for (const value of [0, 1, 'false', null]) {
      expect(sanitizeSettings({ showInteractionPrompts: value }).showInteractionPrompts).toBe(true);
    }
    expect(sanitizeSettings({ showInteractionPrompts: false }).showInteractionPrompts).toBe(false);
  });

  it('saves hidden interaction hints, preserves them through other changes and restores defaults', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    updateSettings({ showInteractionPrompts: false });
    expect(getSettings().showInteractionPrompts).toBe(false);
    expect(setItem).toHaveBeenLastCalledWith('zeroed.settings', JSON.stringify(getSettings()));
    const saved = JSON.parse(setItem.mock.lastCall![1] as string) as unknown;
    expect(sanitizeSettings(saved).showInteractionPrompts).toBe(false);
    updateSettings({ musicVolume: 0.5, invertY: true });
    expect(getSettings().showInteractionPrompts).toBe(false);
    expect(getSettings().invertY).toBe(true);
    resetSettings();
    expect(getSettings().showInteractionPrompts).toBe(true);
  });

  it('scales hip and aiming look speed and can invert the vertical axis', () => {
    const base = look(10, 10);
    updateSettings({ lookSensitivity: 2 });
    const fast = look(10, 10);
    expect(fast.yaw).toBeCloseTo(base.yaw * 2);
    expect(fast.pitch).toBeCloseTo(base.pitch * 2);

    resetSettings();
    const aimed = look(10, 0, 1);
    updateSettings({ adsSensitivity: 2 });
    expect(look(10, 0, 1).yaw).toBeCloseTo(aimed.yaw * 2);
    // The extra aiming factor leaves hip-fire untouched.
    expect(look(10, 0).yaw).toBeCloseTo(base.yaw);

    updateSettings({ invertY: true });
    expect(look(10, 10).pitch).toBeCloseTo(-base.pitch);
  });

  it('uses the chosen hip-fire field of view and keeps the weapon zoom when aiming', () => {
    updateSettings({ fieldOfView: 90 });
    const player = new PlayerController(1);
    expect(player.camera.fov).toBe(90);
    for (let i = 0; i < 120; i++) player.update(1 / 60, lookInput(0, 0), weapon(1));
    expect(player.camera.fov).toBeCloseTo(50, 0);
  });
});
