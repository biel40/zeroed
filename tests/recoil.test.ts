import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { RecoilController } from '../src/weapons/RecoilController';

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
});
