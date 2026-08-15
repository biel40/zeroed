import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { Zombie } from '../src/zombies/Zombie';

const DT = 1 / 60;

/** Solid wall collider like the range walls (concrete surface, 2.3 m tall). */
function makeWall(x: number, z: number, width: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.3, depth));
  mesh.position.set(x, 1.15, z);
  mesh.userData.surface = 'concrete';
  mesh.updateMatrixWorld(true);
  return mesh;
}

function onlyZombie(manager: ZombieManager): Zombie {
  return [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
}

/**
 * Stuck recovery: a zombie pushing straight into a wall (player directly
 * behind it) must not freeze in place. The steering layer slides it along
 * the blocked axis and, after a short no-progress window, commits to a
 * lateral escape until the wall is rounded. No teleporting: the position
 * moves continuously, never penetrates the obstacle box.
 */
describe('ZombieManager stuck recovery', () => {
  it('detects negligible real displacement and alternates its escape route', () => {
    const colliders: THREE.Object3D[] = [
      makeWall(0, -8.5, 1.4, 0.2),
      makeWall(0, -7.5, 1.4, 0.2),
      makeWall(-0.5, -8, 0.2, 1.4),
      makeWall(0.5, -8, 0.2, 1.4),
    ];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, -14);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -8);

    let maxStep = 0;
    for (let frame = 0; frame < Math.round(4 / DT); frame++) {
      const before = zombie.position.clone();
      manager.update(DT, 0, -14);
      maxStep = Math.max(maxStep, zombie.position.distanceTo(before));
    }

    expect(manager.stuckRecoveryCount).toBeGreaterThan(0);
    expect(maxStep).toBeLessThan(0.1);
  });

  it('rounds a wall dead-ahead of the player line instead of pushing forever', () => {
    // Wall x ∈ [-2, 2] at z = -10 (0.4 deep). Player at (0, -14), directly
    // behind the wall from a zombie at (0, -6): the straight line to the
    // player is perpendicular to the wall face — the worst case.
    const colliders: THREE.Object3D[] = [makeWall(0, -10, 4, 0.4)];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, -14);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -6);

    const frames = Math.round(14 / DT);
    let maxAbsX = 0;
    for (let i = 0; i < frames; i++) {
      manager.update(DT, 0, -14);
      maxAbsX = Math.max(maxAbsX, Math.abs(zombie.position.x));
      // Never inside the wall box (with the body radius folded in).
      const inX = zombie.position.x > -2.21 && zombie.position.x < 2.21;
      const inZ = zombie.position.z > -10.41 && zombie.position.z < -9.59;
      expect(inX && inZ).toBe(false);
    }

    // Rounded the wall: ended up on the player's side, close enough to attack.
    expect(zombie.position.z).toBeLessThan(-10.5);
    // And it got there by walking around the edge, not through: at some point
    // the body had to leave the wall's x-span (edge at |x| = 2 + radius).
    expect(maxAbsX).toBeGreaterThan(2.2);
  });

  it('keeps progressing when both axes are blocked in a corner', () => {
    // Corner: two walls meeting at the origin quadrant. Zombie wedged into
    // the inside corner, player diagonally behind it — naive axis sliding
    // blocks BOTH axes and the zombie vibrates in place forever.
    const colliders: THREE.Object3D[] = [
      makeWall(2, -10, 4, 0.4), // east-west wall, x ∈ [0, 4]
      makeWall(0, -8, 0.4, 4), // north-south wall, z ∈ [-10, -6]
    ];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), -4, -14);
    const zombie = onlyZombie(manager);
    zombie.position.set(1, 0, -9); // in the pocket between both walls

    const before = zombie.position.clone();
    const frames = Math.round(10 / DT);
    let totalTravel = 0;
    for (let i = 0; i < frames; i++) {
      const prevX = zombie.position.x;
      const prevZ = zombie.position.z;
      manager.update(DT, -4, -14);
      totalTravel += Math.hypot(zombie.position.x - prevX, zombie.position.z - prevZ);
    }

    // It must not sit frozen: with the player reachable around the corner,
    // the escape logic produces sustained movement, not jitter in place.
    expect(totalTravel).toBeGreaterThan(6);
    // And it ends measurably closer to the player than it started.
    const beforeDist = Math.hypot(before.x - -4, before.z - -14);
    const afterDist = Math.hypot(zombie.position.x - -4, zombie.position.z - -14);
    expect(afterDist).toBeLessThan(beforeDist);
  });
});
