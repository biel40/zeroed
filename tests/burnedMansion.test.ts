import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceProfile } from '../src/core/DeviceProfile';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import {
  MANSION_BOX_PLACEMENT,
  MANSION_PLAYER_SPAWN,
} from '../src/zombies/maps/BurnedMansionConfig';
import { BurnedMansionArena } from '../src/zombies/maps/BurnedMansionArena';

const profile: DeviceProfile = {
  isMobile: false,
  isTouch: false,
  isLowMemory: false,
  pixelRatioLimit: 2,
  shadowQuality: 2,
  useReducedEffects: false,
  useTouchControls: false,
  anisotropyLimit: 8,
  log: {},
};

const previousDocument = globalThis.document;

beforeAll(() => {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: () => undefined,
    strokeRect: () => undefined,
    fillText: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    },
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: previousDocument,
  });
});

function makeArena(): BurnedMansionArena {
  return new BurnedMansionArena(new THREE.Scene(), profile);
}

function canWalk(
  start: readonly [number, number],
  target: readonly [number, number],
  obstacles: ReadonlyArray<THREE.Box3>,
): boolean {
  const step = 0.25;
  const radius = 0.35;
  const key = (x: number, z: number): string => `${Math.round(x / step)},${Math.round(z / step)}`;
  const blocked = (x: number, z: number): boolean =>
    obstacles.some(
      (box) =>
        box.max.y > 0.05 &&
        box.min.y < 1.95 &&
        x > box.min.x - radius &&
        x < box.max.x + radius &&
        z > box.min.z - radius &&
        z < box.max.z + radius,
    );

  const queue: Array<readonly [number, number]> = [start];
  const visited = new Set<string>([key(start[0], start[1])]);
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index];
    if (Math.hypot(x - target[0], z - target[1]) <= step * 1.5) return true;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const nextX = x + dx;
      const nextZ = z + dz;
      if (nextX < -6.6 || nextX > 6.6 || nextZ < -7.6 || nextZ > 7.6) continue;
      const nextKey = key(nextX, nextZ);
      if (visited.has(nextKey) || blocked(nextX, nextZ)) continue;
      visited.add(nextKey);
      queue.push([nextX, nextZ]);
    }
  }
  return false;
}

function unlock(arena: BurnedMansionArena, id: string): void {
  const door = arena.doors.find((candidate) => candidate.id === id);
  expect(door).toBeDefined();
  door!.tryUnlock(() => true);
  expect(arena.activateDoor(id)).toBe(true);
  arena.refreshColliders();
}

describe('Burned Mansion topology', () => {
  it('spawns the player clear of every wall collider', () => {
    const arena = makeArena();
    const body = new THREE.Box3(
      new THREE.Vector3(MANSION_PLAYER_SPAWN.x - 0.35, 0.05, MANSION_PLAYER_SPAWN.z - 0.35),
      new THREE.Vector3(MANSION_PLAYER_SPAWN.x + 0.35, 1.97, MANSION_PLAYER_SPAWN.z + 0.35),
    );
    expect(arena.wallColliders.some((box) => box.intersectsBox(body))).toBe(false);
  });

  it('gates each ground-floor zone and clears the paid doorway immediately', () => {
    const arena = makeArena();
    const spawn = [MANSION_PLAYER_SPAWN.x, MANSION_PLAYER_SPAWN.z] as const;
    const boxRoom = [MANSION_BOX_PLACEMENT.position.x, MANSION_BOX_PLACEMENT.position.z] as const;
    const stairHall = [1.45, -1.2] as const;
    const bunker = [5.2, -5.5] as const;

    expect(canWalk(spawn, boxRoom, arena.wallColliders)).toBe(false);
    unlock(arena, 'to-dining');
    expect(canWalk(spawn, boxRoom, arena.wallColliders)).toBe(true);

    expect(canWalk(boxRoom, stairHall, arena.wallColliders)).toBe(false);
    unlock(arena, 'to-upper');
    expect(canWalk(boxRoom, stairHall, arena.wallColliders)).toBe(true);

    expect(canWalk(stairHall, bunker, arena.wallColliders)).toBe(false);
    unlock(arena, 'to-east');
    expect(canWalk(stairHall, bunker, arena.wallColliders)).toBe(true);
  });

  it('keeps the Mystery Box behind the first paid divider', () => {
    expect(MANSION_PLAYER_SPAWN.z).toBeGreaterThan(2);
    expect(MANSION_BOX_PLACEMENT.position.z).toBeLessThan(2);
    expect(MANSION_BOX_PLACEMENT.floor).toBe(0);
  });

  it('separates the upper floor from the roof and uses one-way floor triggers', () => {
    const arena = makeArena();
    const roof = arena.group.getObjectByName('roof');
    const upper = arena.group.getObjectByName('upper-floor-north');
    expect(roof).toBeDefined();
    expect(upper).toBeDefined();
    const roofBox = new THREE.Box3().setFromObject(roof!);
    const upperBox = new THREE.Box3().setFromObject(upper!);
    expect(upperBox.max.y).toBeLessThan(roofBox.min.y);
    expect(arena.floorTransitions.map((zone) => zone.sourceFloor)).toEqual([0, 1]);
    const upDestination = new THREE.Vector3(
      arena.floorTransitions[0].targetX ?? 0,
      arena.floorTransitions[0].targetY,
      arena.floorTransitions[0].targetZ ?? 0,
    );
    const downDestination = new THREE.Vector3(
      arena.floorTransitions[1].targetX ?? 0,
      arena.floorTransitions[1].targetY,
      arena.floorTransitions[1].targetZ ?? 0,
    );
    expect(arena.floorTransitions[1].box.containsPoint(upDestination)).toBe(false);
    expect(arena.floorTransitions[0].box.containsPoint(downDestination)).toBe(false);
  });

  it('activates only windows and spawns belonging to unlocked zones', () => {
    const arena = makeArena();
    expect(arena.barriers).toHaveLength(3);
    expect(arena.spawnPoints).toHaveLength(3);
    unlock(arena, 'to-dining');
    expect(arena.barriers).toHaveLength(5);
    expect(arena.spawnPoints).toHaveLength(5);
    unlock(arena, 'to-east');
    expect(arena.barriers).toHaveLength(6);
    expect(arena.spawnPoints).toHaveLength(6);
  });

  it('keeps decorative debris out of player collision', () => {
    const arena = makeArena();
    const debris = arena.group.children.filter((child) => child.userData.mapRole === 'visual-debris');
    expect(debris.length).toBeGreaterThan(0);
    for (const piece of debris) {
      const box = new THREE.Box3().setFromObject(piece);
      expect(arena.wallColliders.some((wall) => wall.equals(box))).toBe(false);
    }
  });

  it('routes ground-floor zombies through the stair portal for an upper player', () => {
    const arena = makeArena();
    const manager = new ZombieManager(() => 0, {}, false, [[1.45, 2.4]], [], arena.floorTransitions);
    manager.spawnZombie(roundConfig(1), 5, -5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    for (let frame = 0; frame < 240 && zombie.floor === 0; frame++) {
      manager.update(1 / 60, 5, -5, 1);
    }
    expect(zombie.floor).toBe(1);
    expect(zombie.position.y).toBeCloseTo(3.4, 5);
  });

  it('lets a zombie cross a destroyed window without crossing solid wall segments', () => {
    const arena = makeArena();
    const barrier = arena.barriers.find((candidate) => candidate.id === 'start-west-a')!;
    for (let board = 0; board < barrier.boards.length; board++) barrier.damage(100);
    const manager = new ZombieManager(() => 0, {}, false, [[-9.2, 5.4]], [barrier]);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), -4, 5.4);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    for (let frame = 0; frame < 600; frame++) manager.update(1 / 60, -4, 5.4, 0);
    expect(zombie.position.x).toBeGreaterThan(-6.7);
  });

  it('registers the actual locked door mesh for non-recursive projectile raycasts', () => {
    const arena = makeArena();
    const collider = arena.colliders.find((object) => object.name === 'point-door-collider:to-dining');
    expect(collider).toBeInstanceOf(THREE.Mesh);
    arena.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-3.5, 1.1, 3),
      new THREE.Vector3(0, 0, -1),
      0,
      2,
    );
    expect(ray.intersectObjects([...arena.colliders], false).some((hit) => hit.object === collider)).toBe(true);
  });
});
