import { describe, expect, it } from 'vitest';
import { ACCENT_CHANNEL_LIMIT, AccentChannel, ZombieHitAccent } from '../src/zombies/ZombieHitAccent';
import { locateBone, type ZombieBodyLocation } from '../src/zombies/wounds/ZombieBodyRegion';
import { bulletImpactWeight, bulletWoundRadius } from '../src/zombies/wounds/WoundConfig';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';

function run(accent: ZombieHitAccent, seconds: number, dt: number): number {
  let peak = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    accent.update(dt);
    for (let channel = 0; channel < 8; channel++) peak = Math.max(peak, Math.abs(accent.value(channel as AccentChannel)));
  }
  return peak;
}

describe('zombie body regions', () => {
  const location = (): ZombieBodyLocation => ({ region: 'torso', side: 0 });

  it('classifies the shipped rig bones by region and side', () => {
    expect(locateBone('Head', location())).toEqual({ region: 'head', side: 0 });
    expect(locateBone('Neck', location())).toEqual({ region: 'head', side: 0 });
    expect(locateBone('Spine2', location())).toEqual({ region: 'torso', side: 0 });
    expect(locateBone('Hips', location())).toEqual({ region: 'torso', side: 0 });
    expect(locateBone('LeftForeArm', location())).toEqual({ region: 'arm', side: 1 });
    expect(locateBone('RightShoulder', location())).toEqual({ region: 'arm', side: -1 });
    expect(locateBone('RightHandIndex2', location())).toEqual({ region: 'arm', side: -1 });
    expect(locateBone('LeftUpLeg', location())).toEqual({ region: 'leg', side: 1 });
    expect(locateBone('RightFoot', location())).toEqual({ region: 'leg', side: -1 });
  });
});

describe('cosmetic impact scale', () => {
  it('grows with base damage and stays bounded', () => {
    const weights = (['vector', 'm1911', 'ak47', 'm14', 'l96', 'barrett'] as const)
      .map((id) => bulletImpactWeight(WEAPON_DEFINITIONS[id].damage));
    for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1]);
    expect(weights[0]).toBe(0);
    expect(weights[weights.length - 1]).toBe(1);
    expect(bulletImpactWeight(Number.NaN)).toBe(0);
  });

  it('keeps wounds readable but bounded: pistol compact, heavy rounds larger', () => {
    const pistol = bulletWoundRadius(WEAPON_DEFINITIONS.m1911.damage);
    const sniper = bulletWoundRadius(WEAPON_DEFINITIONS.l96.damage);
    expect(pistol).toBeGreaterThanOrEqual(0.035);
    expect(pistol).toBeLessThan(0.045);
    expect(sniper).toBeGreaterThan(pistol);
    expect(bulletWoundRadius(1e9)).toBeLessThanOrEqual(0.06);
  });
});

describe('ZombieHitAccent', () => {
  it('snaps the head back on a frontal head shot and settles to exactly zero', () => {
    const accent = new ZombieHitAccent();
    accent.hit('head', 0, 0, -1, 0.5);
    accent.update(0.1);
    // Readable: well over 10 degrees for a mid-weight round.
    expect(accent.value(AccentChannel.HeadPitch)).toBeLessThan(-0.2);
    expect(accent.value(AccentChannel.LeftShoulderPitch)).toBe(0);
    run(accent, 2, 1 / 60);
    expect(accent.active).toBe(false);
    expect(accent.value(AccentChannel.HeadPitch)).toBe(0);
  });

  it('moves only the struck shoulder on an arm hit', () => {
    const accent = new ZombieHitAccent();
    accent.hit('arm', -1, 0, -1, 0.3);
    accent.update(0.07);
    expect(Math.abs(accent.value(AccentChannel.RightShoulderPitch))).toBeGreaterThan(0.02);
    expect(accent.value(AccentChannel.LeftShoulderPitch)).toBe(0);
    expect(accent.value(AccentChannel.HeadPitch)).toBe(0);
  });

  it('sags the torso towards a hit leg without touching the shoulders', () => {
    const accent = new ZombieHitAccent();
    accent.hit('leg', 1, 0, -1, 0.3);
    accent.update(0.07);
    expect(accent.value(AccentChannel.TorsoPitch)).toBeGreaterThan(0);
    expect(accent.value(AccentChannel.TorsoRoll)).toBeLessThan(0);
    expect(accent.value(AccentChannel.LeftShoulderPitch)).toBe(0);
  });

  it('hits harder with heavier rounds', () => {
    const light = new ZombieHitAccent();
    const heavy = new ZombieHitAccent();
    light.hit('head', 0, 0, -1, 0);
    heavy.hit('head', 0, 0, -1, 1);
    expect(run(heavy, 0.3, 1 / 120)).toBeGreaterThan(run(light, 0.3, 1 / 120) * 2);
  });

  it('stays bounded and recovers under sustained automatic fire', () => {
    const accent = new ZombieHitAccent();
    let peak = 0;
    for (let shot = 0; shot < 100; shot++) {
      accent.hit('head', 0, 0, -1, 1);
      peak = Math.max(peak, run(accent, 0.05, 1 / 60));
    }
    expect(peak).toBeLessThanOrEqual(ACCENT_CHANNEL_LIMIT + 1e-6);
    run(accent, 3, 1 / 60);
    expect(accent.active).toBe(false);
  });

  it('follows the same curve at any frame rate', () => {
    const fast = new ZombieHitAccent();
    const slow = new ZombieHitAccent();
    fast.hit('arm', 1, 0.3, -0.9, 0.6);
    slow.hit('arm', 1, 0.3, -0.9, 0.6);
    for (let frame = 0; frame < 10; frame++) {
      for (let i = 0; i < 4; i++) fast.update(1 / 120);
      slow.update(1 / 30);
      expect(slow.value(AccentChannel.LeftShoulderPitch)).toBeCloseTo(fast.value(AccentChannel.LeftShoulderPitch), 6);
    }
  });
});
