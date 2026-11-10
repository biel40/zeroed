import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resetSettings, sanitizeSettings, updateSettings } from '../src/core/PlayerSettings';
import { CameraShake } from '../src/rendering/CameraShake';
import { PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import { SUSTAINED_FIRE_GAP, SUSTAINED_KICK_MAX_BOOST, SustainedFireKick } from '../src/weapons/SustainedFireKick';
import {
  DAMAGE_DIRECTION_DURATION,
  DAMAGE_DIRECTION_SLOTS,
  DamageDirectionTracker,
  damageDirectionAngle,
  damageDirectionOpacity,
} from '../src/ui/DamageDirections';

afterEach(() => resetSettings());

const idleInput = {
  isDown: () => false, wasPressed: () => false, mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0,
} as unknown as Input;
const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0, absorbCompensation: () => undefined },
} as unknown as Weapon;

describe('comfort settings', () => {
  it('default to full camera shake and weapon kick, and clamp to 0..1', () => {
    expect(DEFAULT_SETTINGS.cameraShake).toBe(1);
    expect(DEFAULT_SETTINGS.weaponKick).toBe(1);
    const clamped = sanitizeSettings({ cameraShake: -2, weaponKick: 7 });
    expect(clamped.cameraShake).toBe(0);
    expect(clamped.weaponKick).toBe(1);
    expect(sanitizeSettings({ cameraShake: 'loud' }).cameraShake).toBe(1);
  });
});

describe('visual camera shake', () => {
  function rattle(scale: number): number {
    updateSettings({ cameraShake: scale });
    const shake = new CameraShake();
    const camera = new THREE.Object3D();
    shake.add(1);
    let peak = 0;
    for (let frame = 0; frame < 30; frame++) {
      camera.rotation.set(0, 0, 0);
      shake.update(1 / 60, camera);
      peak = Math.max(peak, Math.abs(camera.rotation.x), Math.abs(camera.rotation.y));
    }
    return peak;
  }

  it('scales with the setting and disappears at zero', () => {
    const full = rattle(1);
    expect(full).toBeGreaterThan(0);
    expect(rattle(0.5)).toBeCloseTo(full * 0.5, 6);
    expect(rattle(0)).toBe(0);
  });

  it('keeps visual impulses out of the aim and applies them only to the view', () => {
    const player = new PlayerController(1);
    player.update(1 / 60, idleInput, weaponStub);
    player.playViewImpulse(0.02);
    player.update(1 / 60, idleInput, weaponStub);
    // Where the frame's shots take their aim: untouched by the visual nudge.
    expect(player.camera.rotation.x).toBe(0);
    player.applyViewEffects(1 / 60);
    expect(player.camera.rotation.x).toBeGreaterThan(0.01);

    updateSettings({ cameraShake: 0 });
    player.update(1 / 60, idleInput, weaponStub);
    player.applyViewEffects(1 / 60);
    expect(player.camera.rotation.x).toBe(0);
  });

  it('keeps the heavy-weapon aim jolt independent of the setting', () => {
    updateSettings({ cameraShake: 0 });
    const player = new PlayerController(1);
    player.playShotImpulse(0.05);
    player.update(1 / 60, idleInput, weaponStub);
    expect(player.camera.rotation.x).toBeGreaterThan(0.03);
  });
});

describe('SustainedFireKick', () => {
  const interval = 60 / 800;

  function burst(kick: SustainedFireKick, shots: number, automatic = true): number[] {
    const scales: number[] = [];
    for (let shot = 0; shot < shots; shot++) {
      scales.push(kick.onShot(automatic));
      kick.update(interval);
    }
    return scales;
  }

  it('grows during a sustained automatic burst up to a cap', () => {
    const scales = burst(new SustainedFireKick(), 60);
    expect(scales[0]).toBe(1);
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    expect(scales[59]).toBeCloseTo(1 + SUSTAINED_KICK_MAX_BOOST, 6);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1 + SUSTAINED_KICK_MAX_BOOST + 1e-9);
  });

  it('never escalates semi-automatic fire', () => {
    expect(burst(new SustainedFireKick(), 20, false).every((scale) => scale === 1)).toBe(true);
  });

  it('settles smoothly once firing stops', () => {
    const kick = new SustainedFireKick();
    burst(kick, 30);
    const levels: number[] = [];
    for (let frame = 0; frame < 90; frame++) {
      kick.update(1 / 60);
      levels.push(kick.intensity);
    }
    // Held through the gap, then a monotonic fade with no jump larger than one frame of decay.
    // burst() already advanced one firing interval past the last round.
    expect(levels[Math.floor((SUSTAINED_FIRE_GAP - interval) * 60) - 1]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
      expect(levels[i - 1] - levels[i]).toBeLessThan(0.1);
    }
    expect(levels[levels.length - 1]).toBeLessThan(0.05);
  });

  it('resets on weapon change', () => {
    const kick = new SustainedFireKick();
    burst(kick, 30);
    kick.reset();
    expect(kick.onShot(true)).toBe(1);
  });
});

describe('damage directions', () => {
  it('points at the attacker relative to the view', () => {
    // yaw 0 looks down -Z; +X is to the right.
    expect(damageDirectionAngle(0, 0, 0, 0, -5)).toBeCloseTo(0, 6);
    expect(damageDirectionAngle(0, 0, 0, 5, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.abs(damageDirectionAngle(0, 0, 0, 0, 5))).toBeCloseTo(Math.PI, 6);
    expect(damageDirectionAngle(0, 0, 0, -5, 0)).toBeCloseTo(-Math.PI / 2, 6);
    // Turning left by 90° puts a source that was ahead on the right.
    expect(damageDirectionAngle(0, 0, Math.PI / 2, 0, -5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('holds, then fades out to zero', () => {
    expect(damageDirectionOpacity(0)).toBe(1);
    expect(damageDirectionOpacity(0.3)).toBe(1);
    expect(damageDirectionOpacity(DAMAGE_DIRECTION_DURATION)).toBe(0);
  });

  it('refreshes one marker for a repeat attacker and caps the rest', () => {
    const tracker = new DamageDirectionTracker();
    tracker.add(1, 1);
    tracker.update(0.5);
    tracker.add(1.2, 1);
    expect(tracker.entries.filter((entry) => entry.age !== Infinity)).toHaveLength(1);
    expect(tracker.entries.find((entry) => entry.age !== Infinity)?.age).toBe(0);
    for (let attacker = 0; attacker < DAMAGE_DIRECTION_SLOTS + 3; attacker++) tracker.add(attacker * 5, 0);
    expect(tracker.entries).toHaveLength(DAMAGE_DIRECTION_SLOTS);
    tracker.update(DAMAGE_DIRECTION_DURATION);
    expect(tracker.active).toBe(false);
  });
});
