import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { Zombie } from '../src/zombies/Zombie';

const DT = 1 / 60;
const OPEN_BOUNDS = [{ floor: 0, minX: -20, maxX: 20, minZ: -20, maxZ: 20, baseY: 0 }] as const;

interface NavPathInternals {
  floor: number;
  version: number;
  targetX: number;
  targetZ: number;
  points: ReadonlyArray<{ x: number; z: number }>;
  index: number;
}

interface ManagerInternals {
  navPaths: Map<Zombie, NavPathInternals>;
  roundState: Map<Zombie, unknown>;
  navigation: { version: number };
}

function internals(manager: ZombieManager): ManagerInternals {
  return manager as unknown as ManagerInternals;
}

function makeWall(x: number, z: number, width: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.3, depth));
  mesh.position.set(x, 1.15, z);
  mesh.userData.surface = 'concrete';
  mesh.updateMatrixWorld(true);
  return mesh;
}

function makeManager(colliders: THREE.Object3D[] = []): ZombieManager {
  const manager = new ZombieManager(() => 0, {}, false, [[0, -20]]);
  manager.registerColliders(colliders);
  manager.setNavigationBounds(OPEN_BOUNDS);
  return manager;
}

function spawnWalking(manager: ZombieManager, x: number, z: number): Zombie {
  const before = new Set(manager.actives);
  expect(manager.spawnZombie(roundConfig(1), 0, 10)).toBe(true);
  const zombie = [...manager.actives].find((candidate) => !before.has(candidate))!;
  zombie.state = 'walk';
  zombie.position.set(x, 0, z);
  return zombie;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

describe('zombie pursuit feel', () => {
  it('filters frame-to-frame heading jitter instead of snapping the body every frame', () => {
    const manager = makeManager();
    const zombie = spawnWalking(manager, 0, -6);

    let maxYawStep = 0;
    for (let frame = 0; frame < 120; frame++) {
      const previousYaw = zombie.group.rotation.y;
      // The target wobbles half a metre side to side every frame, like a
      // strafing player or separation noise. The body must not mirror it.
      manager.update(DT, frame % 2 === 0 ? 0.5 : -0.5, 4);
      if (frame >= 30) {
        maxYawStep = Math.max(maxYawStep, Math.abs(wrapAngle(zombie.group.rotation.y - previousYaw)));
      }
    }

    expect(maxYawStep).toBeLessThan(0.02);
    expect(zombie.position.z).toBeGreaterThan(-4);
  });

  it('fans a queue of zombies out into distinct approach lanes', () => {
    const manager = makeManager();
    const queue = [spawnWalking(manager, 0, -6), spawnWalking(manager, 0, -8), spawnWalking(manager, 0, -10)];
    const startZ = queue.map((zombie) => zombie.position.z);

    for (let frame = 0; frame < 240; frame++) manager.update(DT, 0, 10);

    const lanes = queue.map((zombie) => zombie.position.x);
    expect(Math.max(...lanes) - Math.min(...lanes)).toBeGreaterThan(0.4);
    queue.forEach((zombie, index) => {
      // Spread, but still a crowd converging on the player, not scattered.
      expect(Math.abs(zombie.position.x)).toBeLessThan(2);
      expect(zombie.position.z).toBeGreaterThan(startZ[index] + 2);
    });
  });

  it('advances to the next waypoint as soon as it is visible instead of touching every corner', () => {
    const manager = makeManager([makeWall(0, -1, 2, 0.4)]);
    const zombie = spawnWalking(manager, 0, -6);
    const store = internals(manager);
    // First frame registers the pursuit objective; the stuck tracker resets
    // routes whenever the objective key changes, so inject the path after it.
    manager.update(DT, 0, 4);
    store.navPaths.set(zombie, {
      floor: 0,
      version: store.navigation.version,
      targetX: 0,
      targetZ: 4,
      points: [{ x: 2.5, z: -3 }, { x: 2.5, z: 1 }, { x: 0, z: 4 }],
      index: 0,
    });

    manager.update(DT, 0, 4);

    // The second waypoint is already in clear view from the start position;
    // the first one is a detour the body no longer needs to walk to.
    expect(store.navPaths.get(zombie)?.index).toBe(1);
  });
});
