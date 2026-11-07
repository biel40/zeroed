import { describe, expect, it } from 'vitest';
import { Gait, GAIT_REACH, solveLeg, type LegAngles } from '../src/zombies/guardians/CaptainUssrGait';

const DT = 1 / 60;
const THIGH = 0.5;
const SHIN = 0.48;

/** Where the ankle lands for `angles`, relative to the hip: forward and up. */
function ankle(angles: LegAngles): { z: number; y: number } {
  const knee = { z: -Math.sin(angles.hip) * THIGH, y: -Math.cos(angles.hip) * THIGH };
  const shin = angles.hip + angles.knee;
  return { z: knee.z - Math.sin(shin) * SHIN, y: knee.y - Math.cos(shin) * SHIN };
}

function walk(gait: Gait, speed: number, seconds: number, each?: () => void): void {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    gait.update(DT, speed);
    each?.();
  }
}

describe('Captain USSR legs', () => {
  it('plants the ankle on any reachable target, the knee bending forward', () => {
    const angles: LegAngles = { hip: 0, knee: 0 };
    for (const [z, y] of [[0, -0.9], [0.3, -0.7], [-0.35, -0.8], [0.1, -0.45], [0.5, -0.3]]) {
      solveLeg(z, y, THIGH, SHIN, angles);
      expect(angles.knee).toBeGreaterThanOrEqual(0);
      const reached = ankle(angles);
      expect(reached.z).toBeCloseTo(z, 5);
      expect(reached.y).toBeCloseTo(y, 5);
    }
  });

  it('stands straight under the hip and reaches straight for a target out of reach', () => {
    const angles: LegAngles = { hip: 1, knee: 1 };
    solveLeg(0, -(THIGH + SHIN), THIGH, SHIN, angles);
    expect(angles.hip).toBeCloseTo(0, 2);
    expect(angles.knee).toBeCloseTo(0, 2);
    solveLeg(2, -2, THIGH, SHIN, angles);
    expect(angles.knee).toBeCloseTo(0, 2);
    const reached = ankle(angles);
    expect(Math.atan2(reached.z, -reached.y)).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('Captain USSR gait', () => {
  it('stands still without a step', () => {
    const gait = new Gait();
    let footfalls = 0;
    walk(gait, 0, 2, () => { if (gait.footfall > 0) footfalls++; });
    expect(footfalls).toBe(0);
    expect(gait.weight).toBe(0);
    expect(gait.forward).toEqual([0, 0]);
    expect(gait.lift).toEqual([0, 0]);
  });

  it('keeps the planted foot on the ground: it slides back exactly as fast as the body walks', () => {
    const gait = new Gait();
    const speed = 2.3;
    walk(gait, speed, 5);
    let checked = 0;
    for (let frame = 0; frame < 120; frame++) {
      const before = [...gait.forward];
      const lifted = [...gait.lift];
      gait.update(DT, speed);
      for (let side = 0; side < 2; side++) {
        if (lifted[side] > 0 || gait.lift[side] > 0 || gait.footfall > 0) continue;
        expect((gait.forward[side] - before[side]) / DT).toBeCloseTo(-speed * gait.weight, 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('alternates its feet, stepping faster the faster it goes', () => {
    const count = (speed: number): number => {
      const gait = new Gait();
      walk(gait, speed, 1);
      let footfalls = 0;
      walk(gait, speed, 4, () => { if (gait.footfall > 0) footfalls++; });
      return footfalls;
    };
    const march = count(1.9);
    const charge = count(11);
    expect(march).toBeGreaterThanOrEqual(6);
    expect(charge).toBeGreaterThan(march * 1.5);
  });

  it('lands a charge harder than a march and never strides past its reach', () => {
    const heaviest = (speed: number): number => {
      const gait = new Gait();
      let heaviest = 0;
      walk(gait, speed, 4, () => {
        heaviest = Math.max(heaviest, gait.footfall);
        for (const forward of gait.forward) expect(Math.abs(forward)).toBeLessThanOrEqual(GAIT_REACH + 1e-9);
      });
      return heaviest;
    };
    expect(heaviest(11)).toBeGreaterThan(heaviest(1.9));
  });

  it('settles its feet back under it once it stops', () => {
    const gait = new Gait();
    walk(gait, 2.5, 2);
    walk(gait, 0, 1.5);
    expect(gait.weight).toBeLessThan(0.02);
    for (let side = 0; side < 2; side++) {
      expect(Math.abs(gait.forward[side])).toBeLessThan(0.02);
      expect(gait.lift[side]).toBeLessThan(0.01);
    }
    gait.reset();
    expect(gait.weight).toBe(0);
  });
});
