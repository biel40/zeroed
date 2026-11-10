import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { DEFAULT_MAX_RECOIL_CLIMB, RecoilController } from '../src/weapons/RecoilController';

const DT = 1 / 240;

describe('RecoilController', () => {
  it('accumulates pitch with each kick, deterministically with a fixed rng', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.m4a1.recoil, () => 0.5);
    recoil.kick();
    recoil.kick();
    // rng = 0.5 cancels the variance term → exactly 2 kicks of pitch.
    expect(recoil.pitch).toBeCloseTo(WEAPON_DEFINITIONS.m4a1.recoil.verticalKick * 2, 6);
  });

  it('does not recover before the configured delay', () => {
    const config = WEAPON_DEFINITIONS.ak47.recoil;
    const recoil = new RecoilController(config, () => 0.5);
    recoil.kick();
    const afterKick = recoil.pitch;
    recoil.update(config.recoveryDelay * 0.5);
    expect(recoil.pitch).toBe(afterKick);
  });

  it('recovers back to zero over time', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.m4a1.recoil, () => 0.5);
    recoil.kick();
    recoil.kick();
    for (let i = 0; i < Math.round(3 / DT); i++) recoil.update(DT);
    expect(recoil.pitch).toBeLessThan(1e-4);
    expect(recoil.yaw).toBeLessThan(1e-4);
  });

  it('keeps horizontal kicks bounded by the configured maximum', () => {
    const config = WEAPON_DEFINITIONS.ak47.recoil;
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const recoil = new RecoilController(config, random);
    for (let i = 0; i < 200; i++) {
      const before = recoil.yaw;
      recoil.kick();
      const delta = recoil.yaw - before;
      expect(Math.abs(delta)).toBeLessThanOrEqual(config.horizontalKick + 1e-9);
      recoil.pitch = 0;
      recoil.yaw = 0;
    }
  });

  it('applies the kick scale used for ADS reduction', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.m4a1.recoil, () => 0.5);
    recoil.kick(0.5);
    expect(recoil.pitch).toBeCloseTo(WEAPON_DEFINITIONS.m4a1.recoil.verticalKick * 0.5, 6);
  });

  it('reset clears accumulated recoil', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.m60.recoil, () => 0.5);
    recoil.kick();
    recoil.kick();
    recoil.reset();
    expect(recoil.pitch).toBe(0);
    expect(recoil.yaw).toBe(0);
  });

  it('caps the climb of a long uncompensated burst', () => {
    const config = WEAPON_DEFINITIONS.m60.recoil;
    const recoil = new RecoilController(config, () => 0.5);
    for (let shot = 0; shot < 100; shot++) recoil.kick();
    expect(recoil.pitch).toBeCloseTo(DEFAULT_MAX_RECOIL_CLIMB, 6);
    expect(Math.abs(recoil.yaw)).toBeLessThanOrEqual(DEFAULT_MAX_RECOIL_CLIMB * 0.5 + 1e-9);
  });

  it('leaves a short burst below the cap untouched', () => {
    const config = WEAPON_DEFINITIONS.m4a1.recoil;
    const recoil = new RecoilController(config, () => 0.5);
    for (let shot = 0; shot < 10; shot++) recoil.kick();
    expect(recoil.pitch).toBeCloseTo(config.verticalKick * 10, 6);
  });

  it('absorbs aim that opposes the kick and returns it to the caller', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.ak47.recoil, () => 0.5);
    recoil.pitch = 0.1;
    recoil.yaw = -0.02;
    const out = { pitch: 0, yaw: 0 };
    recoil.absorbCompensation(-0.04, 0.05, out);
    expect(out.pitch).toBeCloseTo(0.04, 9);
    expect(out.yaw).toBeCloseTo(-0.02, 9);
    expect(recoil.pitch).toBeCloseTo(0.06, 9);
    expect(recoil.yaw).toBeCloseTo(0, 9);
  });

  it('keeps the visible view unchanged while absorbing compensation', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.ak47.recoil, () => 0.5);
    recoil.pitch = 0.05;
    let aim = 0.2;
    const delta = -0.08;
    const view = aim + delta + recoil.pitch;
    const out = { pitch: 0, yaw: 0 };
    aim += delta;
    recoil.absorbCompensation(delta, 0, out);
    aim += out.pitch;
    expect(aim + recoil.pitch).toBeCloseTo(view, 9);
    // Fully compensated: recovery has nothing left to pull the view below the aim.
    expect(recoil.pitch).toBe(0);
  });

  it('never absorbs aim that moves with the kick', () => {
    const recoil = new RecoilController(WEAPON_DEFINITIONS.ak47.recoil, () => 0.5);
    recoil.pitch = 0.05;
    recoil.yaw = 0.01;
    const out = { pitch: 1, yaw: 1 };
    recoil.absorbCompensation(0.03, 0.02, out);
    expect(out).toEqual({ pitch: 0, yaw: 0 });
    expect(recoil.pitch).toBe(0.05);
    expect(recoil.yaw).toBe(0.01);
  });
});
