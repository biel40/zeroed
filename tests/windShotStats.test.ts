import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { createWindShotStats, resolveWindShot } from '../src/zombies/WindShotStats';

const definition = WEAPON_DEFINITIONS.exhalis;
const wind = definition.wind!;
const charged = wind.charged;
/** The first EXHALIS burst, before the draw: the balance targets are relative to it. */
const FIRST = { burstRadius: 3, pushDistance: 3.4 };

describe('EXHALIS shot by charge', () => {
  it('a quick shot is the base config', () => {
    const stats = resolveWindShot(wind, 0, createWindShotStats());
    expect(stats).toMatchObject({
      charge: 0,
      damageScale: 1,
      projectileSpeed: wind.projectileSpeed,
      burstRadius: wind.burstRadius,
      burstDamage: wind.burstDamage,
      maxTargets: wind.maxTargets,
      pushDistance: wind.pushDistance,
      edgePush: wind.edgePush,
      pushSeconds: wind.pushSeconds,
      intensity: wind.look.intensity,
      gust: null,
    });
  });

  it('a full draw reaches every full-charge multiplier and the gust', () => {
    const stats = resolveWindShot(wind, 1, createWindShotStats());
    expect(stats.damageScale).toBeCloseTo(charged.damage);
    expect(stats.projectileSpeed).toBeCloseTo(wind.projectileSpeed * charged.projectileSpeed);
    expect(stats.burstRadius).toBeCloseTo(wind.burstRadius * charged.burstRadius);
    expect(stats.burstDamage).toBeCloseTo(wind.burstDamage * charged.burstDamage);
    expect(stats.pushDistance).toBeCloseTo(wind.pushDistance * charged.pushDistance);
    expect(stats.pushSeconds).toBeCloseTo(wind.pushSeconds * charged.pushSeconds);
    expect(stats.maxTargets).toBe(Math.round(wind.maxTargets * charged.maxTargets));
    expect(stats.intensity).toBeCloseTo(wind.look.intensity * charged.intensity);
    expect(stats.gust).toBe(charged.gust);
  });

  it('interpolates continuously between the two, and clamps the charge', () => {
    const half = resolveWindShot(wind, 0.5, createWindShotStats());
    expect(half.charge).toBe(0.5);
    expect(half.damageScale).toBeCloseTo((1 + charged.damage) / 2);
    expect(half.burstRadius).toBeCloseTo(wind.burstRadius * (1 + charged.burstRadius) / 2);
    expect(half.gust).toBeNull();
    expect(Number.isInteger(half.maxTargets)).toBe(true);
    expect(resolveWindShot(wind, 3, createWindShotStats())).toEqual(resolveWindShot(wind, 1, createWindShotStats()));
    expect(resolveWindShot(wind, -1, createWindShotStats())).toEqual(resolveWindShot(wind, 0, createWindShotStats()));
    let previous = resolveWindShot(wind, 0, createWindShotStats());
    for (let step = 1; step <= 10; step++) {
      const next = resolveWindShot(wind, step / 10, createWindShotStats());
      expect(next.damageScale).toBeGreaterThan(previous.damageScale);
      expect(next.burstRadius).toBeGreaterThan(previous.burstRadius);
      expect(next.pushDistance).toBeGreaterThan(previous.pushDistance);
      previous = next;
    }
  });

  it('meets the balance targets: a wider normal burst, and a full draw of about 2.2x damage, 1.8x radius and 2x shove', () => {
    expect(wind.burstRadius / FIRST.burstRadius).toBeCloseTo(1.35, 1);
    expect(wind.pushDistance / FIRST.pushDistance).toBeCloseTo(1.25, 1);
    const full = resolveWindShot(wind, 1, createWindShotStats());
    expect(full.damageScale).toBeCloseTo(2.2, 1);
    expect(full.burstRadius / FIRST.burstRadius).toBeCloseTo(1.8, 1);
    expect(full.pushDistance / FIRST.pushDistance).toBeCloseTo(2, 1);
    expect(full.projectileSpeed / wind.projectileSpeed).toBeCloseTo(1.5, 1);
  });
});
