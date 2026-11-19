import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resetSettings, sanitizeSettings, updateSettings } from '../src/core/PlayerSettings';
import { WALK_BOB } from '../src/config/walkBob';
import { PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import { STILL_GAIT, WalkGait } from '../src/player/WalkGait';
import { createHeadBobOffset, createWeaponBobPose, headBobOffset, weaponBobPose } from '../src/player/WalkBob';
import type { Weapon } from '../src/weapons/Weapon';

afterEach(() => resetSettings());

const WALK_SPEED = 4.6;

/** Walks at `speed` m/s for `seconds` in fixed frames of `dt`. */
function walk(gait: WalkGait, speed: number, seconds: number, dt: number, grounded = true): void {
  const frames = Math.round(seconds / dt);
  for (let frame = 0; frame < frames; frame++) gait.update(dt, speed * dt, grounded);
}

describe('WalkGait', () => {
  it('starts still', () => {
    const gait = new WalkGait(WALK_SPEED);
    expect(gait.phase).toBe(0);
    expect(gait.intensity).toBe(0);
    expect(STILL_GAIT.intensity).toBe(0);
  });

  it('advances the step phase by distance walked, not by time', () => {
    const slow = new WalkGait(WALK_SPEED);
    const fast = new WalkGait(WALK_SPEED);
    walk(slow, 2, 1.2, 1 / 60);
    walk(fast, 4, 0.6, 1 / 60);
    expect(slow.phase).toBeCloseTo(fast.phase, 9);
    // One footstep is half a cycle.
    const gait = new WalkGait(WALK_SPEED);
    gait.update(1, WALK_BOB.stepLength * 0.5, true);
    expect(gait.phase).toBeCloseTo(Math.PI * 0.5, 9);
  });

  it('scales intensity with speed and holds the phase when standing still', () => {
    const half = new WalkGait(WALK_SPEED);
    walk(half, WALK_SPEED * 0.5, 2, 1 / 60);
    expect(half.intensity).toBeCloseTo(0.5, 3);
    const phase = half.phase;
    walk(half, 0, 2, 1 / 60);
    expect(half.phase).toBe(phase);
    expect(half.intensity).toBe(0);
  });

  it('fades in over roughly 150-200 ms when starting to walk', () => {
    const gait = new WalkGait(WALK_SPEED);
    walk(gait, WALK_SPEED, 0.05, 1 / 120);
    expect(gait.intensity).toBeLessThan(0.7);
    walk(gait, WALK_SPEED, 0.15, 1 / 120);
    expect(gait.intensity).toBeGreaterThan(0.9);
  });

  it('fades out and freezes the cycle while airborne', () => {
    const gait = new WalkGait(WALK_SPEED);
    walk(gait, WALK_SPEED, 1, 1 / 60);
    const phase = gait.phase;
    walk(gait, WALK_SPEED, 1, 1 / 60, false);
    expect(gait.phase).toBe(phase);
    expect(gait.intensity).toBe(0);
  });

  it('behaves the same at 30, 60 and 144 FPS', () => {
    const results = [30, 60, 144].map(fps => {
      const gait = new WalkGait(WALK_SPEED);
      walk(gait, WALK_SPEED, 0.5, 1 / fps);
      walk(gait, WALK_SPEED * 0.4, 0.5, 1 / fps);
      return gait;
    });
    for (const gait of results) {
      expect(gait.phase).toBeCloseTo(results[0].phase, 6);
      expect(gait.intensity).toBeCloseTo(results[0].intensity, 6);
    }
  });

  it('caps intensity at full walking pace and resets to still', () => {
    const gait = new WalkGait(WALK_SPEED);
    walk(gait, WALK_SPEED * 3, 1, 1 / 60);
    expect(gait.intensity).toBeLessThanOrEqual(1);
    gait.reset();
    expect(gait.phase).toBe(0);
    expect(gait.intensity).toBe(0);
  });
});

describe('walk bob poses', () => {
  const stride = { phase: Math.PI * 0.5, intensity: 1 };

  it('stay neutral without a gait or amount', () => {
    const head = headBobOffset(STILL_GAIT, 1, createHeadBobOffset());
    expect(Math.abs(head.x) + Math.abs(head.y)).toBe(0);
    const pose = weaponBobPose(stride, 0, createWeaponBobPose());
    expect(Math.abs(pose.x) + Math.abs(pose.y) + Math.abs(pose.roll) + Math.abs(pose.pitch)).toBe(0);
  });

  it('keeps the head bob within its subtle centimetre range', () => {
    const head = createHeadBobOffset();
    for (let step = 0; step < 64; step++) {
      headBobOffset({ phase: step / 64 * Math.PI * 2, intensity: 1 }, 1, head);
      expect(Math.abs(head.x)).toBeLessThanOrEqual(WALK_BOB.head.lateral + 1e-12);
      expect(Math.abs(head.y)).toBeLessThanOrEqual(WALK_BOB.head.vertical + 1e-12);
    }
  });

  it('dips the head on each footfall', () => {
    const head = headBobOffset({ phase: 0, intensity: 1 }, 1, createHeadBobOffset());
    expect(head.y).toBeCloseTo(-WALK_BOB.head.vertical, 9);
    headBobOffset({ phase: Math.PI, intensity: 1 }, 1, head);
    expect(head.y).toBeCloseTo(-WALK_BOB.head.vertical, 9);
  });

  it('moves the weapon more than the head and scales linearly with the amount', () => {
    const full = weaponBobPose(stride, 1, createWeaponBobPose());
    const head = headBobOffset(stride, 1, createHeadBobOffset());
    expect(Math.abs(full.x)).toBeGreaterThan(0);
    expect(WALK_BOB.weapon.lateral).toBeGreaterThan(WALK_BOB.head.lateral * 0.5);
    const tenth = weaponBobPose(stride, 0.1, createWeaponBobPose());
    expect(tenth.x).toBeCloseTo(full.x * 0.1, 12);
    expect(tenth.roll).toBeCloseTo(full.roll * 0.1, 12);
    expect(Math.abs(head.x)).toBeGreaterThan(0);
  });

  it('cuts weapon bob by 85-90 % while aiming down sights', () => {
    expect(WALK_BOB.weapon.adsReduction).toBeGreaterThanOrEqual(0.85);
    expect(WALK_BOB.weapon.adsReduction).toBeLessThanOrEqual(0.9);
  });
});

describe('walk bob setting', () => {
  it('defaults to full and clamps to 0..1', () => {
    expect(DEFAULT_SETTINGS.walkBob).toBe(1);
    expect(sanitizeSettings({ walkBob: 3 }).walkBob).toBe(1);
    expect(sanitizeSettings({ walkBob: -1 }).walkBob).toBe(0);
  });
});

describe('PlayerController head bob', () => {
  const keys = new Set<string>();
  const input = {
    isDown: (key: string) => keys.has(key),
    wasPressed: (key: string) => key === 'Space' && keys.has('Space'),
    mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0,
  } as unknown as Input;
  const weapon = {
    definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
    adsAlpha: 0,
    recoil: { pitch: 0, yaw: 0, absorbCompensation: () => undefined },
  } as unknown as Weapon;
  const DT = 1 / 60;

  afterEach(() => keys.clear());

  function frame(player: PlayerController): void {
    player.update(DT, input, weapon);
    player.applyViewEffects(DT);
  }

  /** Largest view-only offset seen while walking, and whether the aim pose stayed clean every frame. */
  function walkPlayer(player: PlayerController, frames: number): { peak: number; aimClean: boolean } {
    keys.add('KeyW');
    let peak = 0;
    let aimClean = true;
    for (let index = 0; index < frames; index++) {
      player.update(DT, input, weapon);
      aimClean &&= player.camera.position.x === 0 && player.camera.rotation.z === 0;
      player.applyViewEffects(DT);
      peak = Math.max(peak, Math.abs(player.camera.position.x));
    }
    return { peak, aimClean };
  }

  it('moves only the view, after the frame aim, and never rotates the camera', () => {
    const player = new PlayerController(1);
    const { peak, aimClean } = walkPlayer(player, 60);
    expect(aimClean).toBe(true);
    expect(peak).toBeGreaterThan(0.001);
    expect(peak).toBeLessThanOrEqual(WALK_BOB.head.lateral + 1e-9);
    expect(player.walkGait.intensity).toBeGreaterThan(0.9);
  });

  it('settles back to the eye height when the player stops, with no drift', () => {
    const player = new PlayerController(1);
    walkPlayer(player, 60);
    keys.clear();
    for (let index = 0; index < 60; index++) frame(player);
    expect(player.walkGait.intensity).toBe(0);
    expect(player.camera.position.x).toBe(0);
    const still = new PlayerController(1);
    for (let index = 0; index < 120; index++) frame(still);
    expect(player.camera.position.y).toBeCloseTo(still.camera.position.y, 9);
  });

  it('fades out in the air', () => {
    const player = new PlayerController(1);
    walkPlayer(player, 60);
    keys.add('Space');
    frame(player);
    keys.delete('Space');
    for (let index = 0; index < 20; index++) frame(player);
    expect(player.airborne).toBe(true);
    expect(player.walkGait.intensity).toBeLessThan(0.1);
  });

  it('turns off with the walking motion setting at zero', () => {
    updateSettings({ walkBob: 0 });
    const player = new PlayerController(1);
    const { peak } = walkPlayer(player, 60);
    expect(peak).toBe(0);
  });
});
