import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { mysteryBoxFootprint } from '../src/zombies/MysteryBoxFootprint';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;

/** Horizontal gap between a body centre and the box (0 when inside it). */
function gapToBox(box: THREE.Box3, x: number, z: number): number {
  const dx = Math.max(box.min.x - x, 0, x - box.max.x);
  const dz = Math.max(box.min.z - z, 0, z - box.max.z);
  return Math.hypot(dx, dz);
}

describe('Mystery Box as a solid obstacle', () => {
  it('stops a zombie chasing the player straight across the box', () => {
    const footprint = mysteryBoxFootprint({ position: { x: 0, y: 0, z: 0 }, yaw: 0, useRange: 2, lookDotMin: 0.5 });
    const manager = new ZombieManager(() => 0, {}, false, [[0, -6]]);
    manager.setNavigationBounds([{ floor: 0, minX: -10, maxX: 10, minZ: -10, maxZ: 10, baseY: 0 }]);
    manager.setBodyObstacles([footprint]);
    manager.registerColliders([]);
    expect(manager.spawnZombie(roundConfig(6), 0, 6)).toBe(true);
    const zombie = [...manager.actives][0];
    zombie.state = 'walk';

    let closest = Infinity;
    for (let frame = 0; frame < 8 / DT; frame++) {
      manager.update(DT, 0, 6);
      closest = Math.min(closest, gapToBox(footprint, zombie.position.x, zombie.position.z));
    }

    // The body rounds the box instead of crossing it, and still reaches the player's side.
    expect(closest).toBeGreaterThan(zombie.bodyRadius * 0.9);
    expect(zombie.position.z).toBeGreaterThan(footprint.max.z);
  });
});

describe.each(Object.values(ZOMBIE_MAPS))('Mystery Box blocks the player: $id', (map) => {
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  it('includes the box footprint in the arena wall colliders', () => {
    const arena = map.createArena(new THREE.Scene(), TEST_PROFILE);
    const footprint = mysteryBoxFootprint(arena.mysteryBoxPlacement);
    expect(arena.useWallCollision).toBe(true);
    expect(arena.wallColliders?.some((box) => box.containsBox(footprint))).toBe(true);
  });
});
