import { describe, expect, it } from 'vitest';
import {
  MIN_PLAYER_DISTANCE,
  SPAWN_POINTS,
  ZombieSpawner,
} from '../src/zombies/ZombieSpawner';

function distance(point: readonly [number, number], x: number, z: number): number {
  return Math.hypot(point[0] - x, point[1] - z);
}

describe('ZombieSpawner', () => {
  it('only returns known spawn points', () => {
    const spawner = new ZombieSpawner(() => 0.999);
    for (let i = 0; i < 20; i++) {
      const point = spawner.pick(0, 4);
      expect(SPAWN_POINTS).toContainEqual(point);
    }
  });

  it('never spawns close to the player anywhere inside the play area', () => {
    // Cycle deterministically through candidates with different rng values.
    for (const rngValue of [0, 0.25, 0.5, 0.75, 0.999]) {
      const spawner = new ZombieSpawner(() => rngValue);
      // Player walkable area: x in [-7, 7], z in [-0.5, 8].
      for (const px of [-7, 0, 7]) {
        for (const pz of [-0.5, 4, 8]) {
          const point = spawner.pick(px, pz);
          expect(distance(point, px, pz)).toBeGreaterThanOrEqual(MIN_PLAYER_DISTANCE);
        }
      }
    }
  });

  it('uses the rng to vary the selection', () => {
    const picks = new Set<string>();
    let i = 0;
    const values = [0.05, 0.4, 0.6, 0.9, 0.2, 0.7];
    const spawner = new ZombieSpawner(() => values[i++ % values.length]);
    for (let n = 0; n < 12; n++) {
      const point = spawner.pick(0, 4);
      picks.add(`${point[0]},${point[1]}`);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('every configured spawn point is outside the minimum distance from the play area', () => {
    // Design invariant: with the player confined to the firing platform,
    // all spawn points are valid at all times.
    for (const point of SPAWN_POINTS) {
      for (const px of [-7, 0, 7]) {
        for (const pz of [-0.5, 8]) {
          expect(distance(point, px, pz)).toBeGreaterThanOrEqual(MIN_PLAYER_DISTANCE);
        }
      }
    }
  });
});
