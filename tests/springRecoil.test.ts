import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { SpringRecoil } from '../src/weapons/SpringRecoil';

const DT = 1 / 240;

function simulate(spring: SpringRecoil, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) spring.update(DT);
}

describe('SpringRecoil', () => {
  it('moves backwards and upwards on kick', () => {
    const spring = new SpringRecoil(WEAPON_DEFINITIONS.m4a1.view.visualRecoil, () => 0.5);
    spring.kick();
    spring.update(DT);
    expect(spring.offset).toBeLessThan(0);
    expect(spring.pitch).toBeGreaterThan(0);
  });

  it('settles back to rest without jitter', () => {
    const spring = new SpringRecoil(WEAPON_DEFINITIONS.m4a1.view.visualRecoil, () => 0.5);
    spring.kick();
    simulate(spring, 1.5);
    expect(Math.abs(spring.offset)).toBeLessThan(1e-3);
    expect(Math.abs(spring.pitch)).toBeLessThan(1e-3);
    expect(Math.abs(spring.roll)).toBeLessThan(1e-3);
  });

  it('stays finite under sustained automatic fire', () => {
    const spring = new SpringRecoil(WEAPON_DEFINITIONS.m60.view.visualRecoil, () => 0.5);
    for (let shot = 0; shot < 30; shot++) {
      spring.kick();
      simulate(spring, 60 / 550); // one M60 firing interval
    }
    expect(Number.isFinite(spring.offset)).toBe(true);
    expect(Number.isFinite(spring.pitch)).toBe(true);
    expect(Number.isFinite(spring.roll)).toBe(true);
    // Even sustained, the spring must stay in a sane range (no explosion).
    expect(Math.abs(spring.offset)).toBeLessThan(0.5);
    expect(Math.abs(spring.pitch)).toBeLessThan(1);
  });

  it('heavier weapons produce a larger peak pitch excursion', () => {
    const peakPitchAfter = (
      config: (typeof WEAPON_DEFINITIONS)['m4a1']['view']['visualRecoil'],
    ): number => {
      const spring = new SpringRecoil(config, () => 0.5);
      spring.kick();
      let peak = 0;
      for (let i = 0; i < Math.round(1 / DT); i++) {
        spring.update(DT);
        peak = Math.max(peak, Math.abs(spring.pitch));
      }
      return peak;
    };
    const m4 = peakPitchAfter(WEAPON_DEFINITIONS.m4a1.view.visualRecoil);
    const m60 = peakPitchAfter(WEAPON_DEFINITIONS.m60.view.visualRecoil);
    const l96 = peakPitchAfter(WEAPON_DEFINITIONS.l96.view.visualRecoil);
    expect(m60).toBeGreaterThan(m4);
    expect(l96).toBeGreaterThan(m60);
    // Sanity: everything stays within readable viewmodel angles (< ~20°).
    expect(l96).toBeLessThan(0.35);
  });

  it('keeps roll bounded by the configured impulse', () => {
    const config = WEAPON_DEFINITIONS.ak47.view.visualRecoil;
    const spring = new SpringRecoil(config, () => 1); // max roll direction
    spring.kick();
    let peak = 0;
    for (let i = 0; i < Math.round(1 / DT); i++) {
      spring.update(DT);
      peak = Math.max(peak, Math.abs(spring.roll));
    }
    expect(peak).toBeLessThan((config.rollImpulse * 0.25) / Math.sqrt(config.stiffness) + 0.05);
  });

  it('reset clears all channels', () => {
    const spring = new SpringRecoil(WEAPON_DEFINITIONS.l96.view.visualRecoil, () => 0.5);
    spring.kick();
    spring.update(DT);
    spring.reset();
    expect(spring.offset).toBe(0);
    expect(spring.pitch).toBe(0);
    expect(spring.roll).toBe(0);
  });
});
