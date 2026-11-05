import { describe, expect, it } from 'vitest';
import { anticipation, Flinch, ROAR_SECONDS, roarWeight } from '../src/zombies/guardians/CaptainUssrMotion';

const DT = 1 / 60;

function settle(flinch: Flinch, seconds: number): number[] {
  return Array.from({ length: Math.round(seconds / DT) }, () => {
    flinch.update(DT);
    return flinch.value;
  });
}

describe('Captain USSR motion', () => {
  it('coils slowly and then snaps: anticipation runs 0 to 1, ever faster towards the release', () => {
    expect(anticipation(0)).toBe(0);
    expect(anticipation(1)).toBe(1);
    expect(anticipation(-1)).toBe(0);
    expect(anticipation(2)).toBe(1);
    let previous = 0;
    for (let step = 1; step <= 10; step++) {
      const value = anticipation(step / 10);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
    expect(anticipation(0.5)).toBeLessThan(0.5);
  });

  it('jolts on a hit and settles back, a heavier hit further', () => {
    const light = new Flinch();
    const heavy = new Flinch();
    light.kick(0.3);
    heavy.kick(1);
    const lightPeak = Math.max(...settle(light, 0.2).map(Math.abs));
    const heavyPeak = Math.max(...settle(heavy, 0.2).map(Math.abs));
    expect(heavyPeak).toBeGreaterThan(lightPeak);
    expect(Math.abs(settle(heavy, 1).at(-1)!)).toBeLessThan(0.01);
  });

  it('never stacks a stream of hits past a full jolt', () => {
    const flinch = new Flinch();
    let peak = 0;
    for (let tick = 0; tick < 60; tick++) {
      flinch.kick(0.4);
      flinch.update(DT);
      peak = Math.max(peak, Math.abs(flinch.value));
    }
    expect(peak).toBeLessThanOrEqual(1);
    flinch.reset();
    expect(flinch.value).toBe(0);
  });

  it('roars in, holds and lets go within its time', () => {
    expect(roarWeight(0)).toBe(0);
    expect(roarWeight(ROAR_SECONDS)).toBe(0);
    expect(roarWeight(ROAR_SECONDS * 2)).toBe(0);
    expect(roarWeight(ROAR_SECONDS * 0.5)).toBeCloseTo(1, 6);
  });
});
