import { describe, expect, it } from 'vitest';
import { DEATH_FALL_DURATION, deathFallPose } from '../src/player/DeathFall';

describe('deathFallPose', () => {
  it('starts standing and ends on the floor, rolled onto one side', () => {
    for (const value of Object.values(deathFallPose(0))) expect(value).toBeCloseTo(0);
    const landed = deathFallPose(DEATH_FALL_DURATION);
    expect(landed.drop).toBeGreaterThan(1.3);
    expect(landed.roll).toBeGreaterThan(1);
  });

  it('clamps raw time on both ends', () => {
    expect(deathFallPose(-1)).toEqual(deathFallPose(0));
    expect(deathFallPose(DEATH_FALL_DURATION * 3)).toEqual(deathFallPose(DEATH_FALL_DURATION));
  });

  it('buckles slowly first and accelerates into the floor', () => {
    const quarter = deathFallPose(DEATH_FALL_DURATION * 0.25).drop;
    const half = deathFallPose(DEATH_FALL_DURATION * 0.5).drop;
    const threeQuarters = deathFallPose(DEATH_FALL_DURATION * 0.75).drop;
    expect(half - quarter).toBeLessThan(threeQuarters - half);
  });
});
