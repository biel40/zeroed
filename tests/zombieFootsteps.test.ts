import { describe, expect, it } from 'vitest';
import {
  pickAudibleZombies,
  stepIntervalForSpeed,
} from '../src/zombies/ZombieFootsteps';

/**
 * Footstep source assignment: pure math over zombie snapshots, no Three.js
 * scene. The rules pinned here come straight from the design contract:
 *  - only the N nearest zombies within the audible radius get a source,
 *  - nearest first, so priority survives a partial pool,
 *  - 3D distance: a zombie one floor away must not read as close.
 * Cadence derives from measured ground speed with hard clamps.
 */
function at(id: number, x: number, y: number, z: number) {
  return { id, x, y, z };
}

describe('pickAudibleZombies', () => {
  it('returns the nearest zombies first', () => {
    const picked = pickAudibleZombies(
      [at(1, 10, 0, 0), at(2, 1, 0, 0), at(3, 5, 0, 0)],
      0,
      1.6,
      0,
      8,
      22,
    );
    expect(picked.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it('caps the selection at maxCount', () => {
    const horde = [];
    for (let i = 0; i < 20; i++) horde.push(at(i, i * 0.5, 0, 0));
    const picked = pickAudibleZombies(horde, 0, 0, 0, 8, 22);
    expect(picked).toHaveLength(8);
    expect(picked[0].id).toBe(0);
  });

  it('drops candidates beyond the audible radius', () => {
    const picked = pickAudibleZombies(
      [at(1, 5, 0, 0), at(2, 100, 0, 0)],
      0,
      0,
      0,
      8,
      22,
    );
    expect(picked.map((c) => c.id)).toEqual([1]);
  });

  it('uses 3D distance: a zombie one floor up is not "close"', () => {
    // Same XZ, one at ear height, one 10 m below (bunker): the lower one
    // must lose even though its horizontal distance is zero.
    const picked = pickAudibleZombies(
      [at(1, 0, -10, 0), at(2, 3, 0, 0)],
      0,
      0,
      0,
      1,
      22,
    );
    expect(picked.map((c) => c.id)).toEqual([2]);
  });

  it('handles an empty horde and a zero pool', () => {
    expect(pickAudibleZombies([], 0, 0, 0, 8, 22)).toEqual([]);
    expect(pickAudibleZombies([at(1, 1, 0, 0)], 0, 0, 0, 0, 22)).toEqual([]);
  });
});

describe('stepIntervalForSpeed', () => {
  it('derives the cadence from ground speed (stride / speed)', () => {
    // Walker at round-1 speed: ~1.9 m/s with a 0.7 m stride ≈ 0.37 s/step.
    expect(stepIntervalForSpeed(1.9)).toBeCloseTo(0.368, 2);
  });

  it('clamps very fast zombies so steps never become a machine gun', () => {
    expect(stepIntervalForSpeed(10)).toBe(0.24);
  });

  it('clamps very slow or stopped zombies at the ceiling', () => {
    expect(stepIntervalForSpeed(0.5)).toBe(1.1);
    expect(stepIntervalForSpeed(0)).toBe(1.1);
  });
});
