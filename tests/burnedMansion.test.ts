import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceProfile } from '../src/core/DeviceProfile';
import type { Input } from '../src/player/Input';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { MIN_PLAYER_DISTANCE, ZombieSpawner } from '../src/zombies/ZombieSpawner';
import {
  MANSION_BARRIERS,
  MANSION_BUNKER_BOUNDS,
  MANSION_BUNKER_Y,
  MANSION_BOX_PLACEMENT,
  MANSION_DOOR_COSTS,
  MANSION_PLAYER_SPAWN,
  MANSION_SPAWNS,
  MANSION_SECRET_AREAS,
  MANSION_WALL_BUYS,
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
  bounds = { minX: -6.6, maxX: 6.6, minZ: -7.6, maxZ: 7.6 },
  floorY = 0,
): boolean {
  const step = 0.25;
  const radius = 0.35;
  const key = (x: number, z: number): string => `${Math.round(x / step)},${Math.round(z / step)}`;
  const blocked = (x: number, z: number): boolean =>
    obstacles.some(
      (box) =>
        box.max.y > floorY + 0.05 &&
        box.min.y < floorY + 1.95 &&
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
      if (nextX < bounds.minX || nextX > bounds.maxX || nextZ < bounds.minZ || nextZ > bounds.maxZ) continue;
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
  if (id === 'nuclear-bunker') arena.update(3);
  arena.refreshColliders();
}

const idleInput = {
  isDown: () => false,
  wasPressed: () => false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  moveAxisX: 0,
  moveAxisY: 0,
} as unknown as Input;

function movementInput(code: 'KeyW' | 'KeyS'): Input {
  return {
    ...idleInput,
    isDown: (candidate: string) => candidate === code,
  } as unknown as Input;
}

const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0 },
} as unknown as Weapon;

describe('Burned Mansion topology', () => {
  it('spawns the player clear of every wall collider', () => {
    const arena = makeArena();
    const body = new THREE.Box3(
      new THREE.Vector3(MANSION_PLAYER_SPAWN.x - 0.35, 0.05, MANSION_PLAYER_SPAWN.z - 0.35),
      new THREE.Vector3(MANSION_PLAYER_SPAWN.x + 0.35, 1.97, MANSION_PLAYER_SPAWN.z + 0.35),
    );
    expect(arena.wallColliders.some((box) => box.intersectsBox(body))).toBe(false);
  });

  it('gates each ground-floor zone and clears the bunker only after its animation', () => {
    const arena = makeArena();
    const spawn = [MANSION_PLAYER_SPAWN.x, MANSION_PLAYER_SPAWN.z] as const;
    const boxRoom = [MANSION_BOX_PLACEMENT.position.x, MANSION_BOX_PLACEMENT.position.z] as const;
    const eastHall = [1.6, -5] as const;
    const bunkerVestibule = [5.2, -3.3] as const;

    expect(canWalk(spawn, boxRoom, arena.wallColliders)).toBe(false);
    unlock(arena, 'to-dining');
    expect(canWalk(spawn, boxRoom, arena.wallColliders)).toBe(true);

    expect(canWalk(boxRoom, eastHall, arena.wallColliders)).toBe(false);
    unlock(arena, 'to-east-hall');
    expect(canWalk(boxRoom, eastHall, arena.wallColliders)).toBe(true);

    expect(canWalk(eastHall, bunkerVestibule, arena.wallColliders)).toBe(false);
    const bunkerDoor = arena.doors.find((door) => door.id === 'nuclear-bunker')!;
    bunkerDoor.tryUnlock(() => true);
    expect(arena.activateDoor('nuclear-bunker')).toBe(true);
    expect(arena.activateDoor('nuclear-bunker')).toBe(false);
    arena.refreshColliders();
    expect(canWalk(eastHall, bunkerVestibule, arena.wallColliders)).toBe(false);
    arena.update(1);
    expect(canWalk(eastHall, bunkerVestibule, arena.wallColliders)).toBe(false);
    arena.update(2);
    expect(canWalk(eastHall, bunkerVestibule, arena.wallColliders)).toBe(true);
  });

  it('keeps the Mystery Box behind the first paid divider', () => {
    expect(MANSION_PLAYER_SPAWN.z).toBeGreaterThan(2);
    expect(MANSION_BOX_PLACEMENT.position.z).toBeLessThan(2);
    expect(MANSION_BOX_PLACEMENT.floor).toBe(0);
  });

  it('builds a large enclosed underground bunker with an open stairwell', () => {
    const arena = makeArena();
    const roof = arena.group.getObjectByName('mansion-roof');
    const bunkerFloor = arena.group.getObjectByName('bunker-floor');
    const bunkerCeiling = arena.group.getObjectByName('bunker-ceiling');
    expect(roof).toBeDefined();
    expect(bunkerFloor).toBeDefined();
    expect(bunkerCeiling).toBeDefined();
    expect(arena.group.getObjectByName('upper-floor-north')).toBeUndefined();
    expect(arena.group.children.some((child) => child.name.startsWith('stair-step-'))).toBe(false);
    const roofBox = new THREE.Box3().setFromObject(roof!);
    const bunkerFloorBox = new THREE.Box3().setFromObject(bunkerFloor!);
    const bunkerCeilingBox = new THREE.Box3().setFromObject(bunkerCeiling!);
    expect(roofBox.min.y).toBeCloseTo(3.2);
    expect(bunkerFloorBox.min.y).toBeLessThan(MANSION_BUNKER_Y);
    expect(bunkerCeilingBox.max.y).toBeLessThan(0);
    const bunkerSize = bunkerFloorBox.getSize(new THREE.Vector3());
    expect(bunkerSize.x).toBeGreaterThanOrEqual(10);
    expect(bunkerSize.z).toBeGreaterThanOrEqual(8.9);

    const stairwell = new THREE.Box3(
      new THREE.Vector3(4.2, -0.31, -6.85),
      new THREE.Vector3(6.1, -0.13, -3.05),
    );
    const ceilingSegments = arena.group.children.filter((child) => child.name.startsWith('bunker-ceiling'));
    expect(ceilingSegments).toHaveLength(4);
    expect(ceilingSegments.some((segment) => new THREE.Box3().setFromObject(segment).intersectsBox(stairwell))).toBe(false);
  });

  it('keeps one-way floor triggers outside their destinations', () => {
    const arena = makeArena();
    expect(arena.floorTransitions.map((zone) => zone.sourceFloor)).toEqual([0, -1]);
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

  it('moves continuously down, stops, turns and returns up without teleporting', () => {
    const arena = makeArena();
    const player = new PlayerController(1);
    player.setFloorTransitions(arena.floorTransitions);
    player.setWallColliders(arena.wallColliders);

    player.teleport(5.15, EYE_HEIGHT, -2.7, 0, arena.playerBounds);
    let previousZ = player.rig.position.z;
    let previousY = player.rig.position.y;
    for (let frame = 0; frame < 150 && player.floor === 0; frame++) {
      player.update(1 / 60, movementInput('KeyW'), weaponStub);
      expect(player.rig.position.z).toBeLessThanOrEqual(previousZ + 1e-6);
      expect(player.rig.position.y).toBeLessThanOrEqual(previousY + 1e-6);
      expect(Math.abs(player.rig.position.z - previousZ)).toBeLessThan(0.1);
      previousZ = player.rig.position.z;
      previousY = player.rig.position.y;
    }
    expect(player.floor).toBe(-1);
    for (let frame = 0; frame < 10; frame++) player.update(1 / 60, movementInput('KeyW'), weaponStub);
    expect(player.rig.position.y).toBeCloseTo(MANSION_BUNKER_Y + EYE_HEIGHT, 1);

    const stopped = player.rig.position.clone();
    for (let frame = 0; frame < 20; frame++) player.update(1 / 60, idleInput, weaponStub);
    expect(player.rig.position.distanceTo(stopped)).toBeLessThan(0.35);

    for (let frame = 0; frame < 180 && player.floor === -1; frame++) {
      player.update(1 / 60, movementInput('KeyS'), weaponStub);
    }
    expect(player.floor).toBe(0);
    for (let frame = 0; frame < 20; frame++) player.update(1 / 60, movementInput('KeyS'), weaponStub);
    expect(player.rig.position.y).toBeCloseTo(EYE_HEIGHT, 1);
  });

  it('places each standard wall buy in its intended progression zone', () => {
    const arena = makeArena();
    expect(MANSION_WALL_BUYS.map((buy) => buy.weaponId)).toEqual(['m1911', 'ak47', 'm4a1', 'm60']);
    expect(MANSION_WALL_BUYS.map((buy) => buy.price)).toEqual([500, 1750, 1500, 2500]);
    expect(MANSION_WALL_BUYS.every((buy) => buy.ammoPrice > 0)).toBe(true);
    expect(MANSION_WALL_BUYS.find((buy) => buy.weaponId === 'm1911')!.position.z).toBeGreaterThan(2);
    expect(MANSION_WALL_BUYS.find((buy) => buy.weaponId === 'ak47')!.position.x).toBeLessThan(0);
    const m4a1 = MANSION_WALL_BUYS.find((buy) => buy.weaponId === 'm4a1')!;
    expect(m4a1.position.x).toBeGreaterThan(0);
    expect(m4a1.position.x).toBeLessThan(3.2);
    expect(m4a1.position.x - 0.35).toBeGreaterThan(2.2);
    expect(arena.wallBuys).toHaveLength(4);
    expect(arena.group.children.filter((child) => child.userData.mapRole === 'wall-buy')).toHaveLength(4);
  });

  it('keeps the paid room sequence and bunker price centralized', () => {
    const arena = makeArena();
    expect(arena.doors.map((door) => [door.id, door.cost])).toEqual([
      ['to-dining', MANSION_DOOR_COSTS.diningHall],
      ['to-east-hall', MANSION_DOOR_COSTS.eastHall],
      ['nuclear-bunker', 9999],
    ]);
    expect(MANSION_DOOR_COSTS.nuclearBunker).toBe(9999);
  });

  it('centralizes the bunker cost and exposes both secret Wonder Weapons', () => {
    const arena = makeArena();
    const secret = MANSION_SECRET_AREAS[0];
    const door = arena.doors.find((candidate) => candidate.id === secret.doorId)!;
    const pickups = arena.weaponPickups;

    expect(secret.unlockCost).toBe(9999);
    expect(door.cost).toBe(9999);
    expect(door.prompt).toBe('Open sealed bunker');
    expect(door.requiredMessage).toBe('9999 PTS REQUIRED');
    expect(secret.rewards.map((reward) => reward.weaponId)).toEqual(['raygun', 'tesla']);
    expect(pickups.map((pickup) => pickup.weaponId)).toEqual(['raygun', 'tesla']);
    expect(pickups.every((pickup) => pickup.requiredDoorId === secret.doorId)).toBe(true);
    for (const pickup of pickups) {
      expect(pickup.available).toBe(true);
      expect(pickup.claim()).toBe(true);
      expect(pickup.claim()).toBe(false);
    }
    arena.reset();
    expect(pickups.every((pickup) => pickup.available)).toBe(true);
    expect(arena.group.getObjectByName('bunker-zeus')?.userData.weaponId).toBe('tesla');
  });

  it('uses comfortable uniform steps over one continuous navigation ramp', () => {
    const arena = makeArena();
    const steps = arena.group.children.filter((child) => child.name.startsWith('bunker-stair-step-'));
    expect(steps).toHaveLength(17);
    for (const step of steps) {
      const size = new THREE.Box3().setFromObject(step).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThanOrEqual(1.6);
    }
    const ramp = arena.group.getObjectByName('bunker-stair-navigation-ramp');
    expect(ramp?.userData.mapRole).toBe('walkable-stair-ramp');
    expect(ramp?.userData.walkableSurface).toBe(true);
    expect(arena.group.children.filter((child) => child.name === 'bunker-stair-handrail')).toHaveLength(2);
  });

  it('uses an actual radiation trefoil and a marked ZEUS containment station', () => {
    const arena = makeArena();
    const sign = arena.group.getObjectByName('radiation-warning-symbol');
    expect(sign?.userData.mapRole).toBe('bunker-ending-interaction');
    expect(arena.completionInteraction.cost).toBe(30000);
    expect(sign?.children.filter((child) => child.userData.mapRole === 'radiation-symbol-part')).toHaveLength(4);
    expect(arena.group.children.filter((child) => child.userData.mapRole === 'zeus-containment-ring')).toHaveLength(1);
    expect(arena.group.getObjectByName('zeus-containment-pedestal')).toBeDefined();
  });

  it('keeps clear walking routes from the stair landing to both Wonder Weapon stations', () => {
    const arena = makeArena();
    const landing = [3.75, -6.4] as const;
    const rayGunApproach = [-1.2, -3] as const;
    const zeusApproach = [-0.8, -6.1] as const;

    expect(canWalk(landing, rayGunApproach, arena.wallColliders, MANSION_BUNKER_BOUNDS, MANSION_BUNKER_Y)).toBe(true);
    expect(canWalk(landing, zeusApproach, arena.wallColliders, MANSION_BUNKER_BOUNDS, MANSION_BUNKER_Y)).toBe(true);
    expect(canWalk(rayGunApproach, zeusApproach, arena.wallColliders, MANSION_BUNKER_BOUNDS, MANSION_BUNKER_Y)).toBe(true);
  });

  it('exposes the real Ray Gun and ZEUS pickups only after the nuclear door opens', () => {
    const arena = makeArena();
    const mode = new ZombiesMode('burned-mansion');
    const player = {
      floor: -1,
      rig: { position: new THREE.Vector3() },
      camera: {
        getWorldDirection: (out: THREE.Vector3) => out.set(0, 0, -1),
      },
    };
    (mode as unknown as { arena: BurnedMansionArena }).arena = arena;
    (mode as unknown as { ctx: unknown }).ctx = { player };
    const findPickup = () =>
      (mode as unknown as { findFacingWeaponPickup(): { id: string } | null }).findFacingWeaponPickup();

    player.rig.position.set(-1.2, MANSION_BUNKER_Y + EYE_HEIGHT, -0.9);
    expect(findPickup()).toBeNull();

    unlock(arena, 'nuclear-bunker');
    expect(findPickup()?.id).toBe('bunker-raygun');
    player.rig.position.set(-1.7, MANSION_BUNKER_Y + EYE_HEIGHT, -4.8);
    expect(findPickup()?.id).toBe('bunker-zeus');
  });

  it('activates only windows and spawns belonging to unlocked zones', () => {
    const arena = makeArena();
    expect(arena.barriers).toHaveLength(3);
    expect(arena.spawnPoints).toHaveLength(3);
    unlock(arena, 'to-dining');
    expect(arena.barriers).toHaveLength(5);
    expect(arena.spawnPoints).toHaveLength(5);
    unlock(arena, 'to-east-hall');
    expect(arena.barriers).toHaveLength(6);
    expect(arena.spawnPoints).toHaveLength(6);
    unlock(arena, 'nuclear-bunker');
    expect(arena.barriers).toHaveLength(7);
    expect(arena.spawnPoints).toHaveLength(7);
  });

  it('defines every zombie spawn outside with a route through its assigned barricade', () => {
    for (const point of Object.values(MANSION_SPAWNS).flat()) {
      expect(point.exterior).toBe(true);
      expect(
        point.x < -7.45 || point.x > 7.45 || point.z < -8.45 || point.z > 8.45,
      ).toBe(true);
      const barrier = MANSION_BARRIERS.find((candidate) => candidate.id === point.barrierId);
      expect(barrier).toBeDefined();
      const approachSide =
        (point.approachX! - barrier!.x) * barrier!.outwardX +
        (point.approachZ! - barrier!.z) * barrier!.outwardZ;
      const breachSide =
        (point.breachX! - barrier!.x) * barrier!.outwardX +
        (point.breachZ! - barrier!.z) * barrier!.outwardZ;
      expect(approachSide).toBeGreaterThan(0);
      expect(breachSide).toBeLessThan(0);
    }
  });

  it('keeps the initial spawn selection beyond the configured player safety distance', () => {
    const arena = makeArena();
    const spawn = new ZombieSpawner(() => 0, arena.spawnPoints).pickSpawn(
      MANSION_PLAYER_SPAWN.x,
      MANSION_PLAYER_SPAWN.z,
    );
    expect(
      Math.hypot(spawn.x - MANSION_PLAYER_SPAWN.x, spawn.z - MANSION_PLAYER_SPAWN.z),
    ).toBeGreaterThanOrEqual(MIN_PLAYER_DISTANCE);
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

  it('gives every large visible prop a matching simplified player collider', () => {
    const arena = makeArena();
    const props = arena.group.children.filter((child) => child.userData.mapRole === 'solid-prop');
    expect(props.length).toBeGreaterThanOrEqual(6);
    for (const prop of props) {
      const box = new THREE.Box3().setFromObject(prop);
      expect(arena.wallColliders.some((collider) => collider.equals(box))).toBe(true);
      expect(arena.colliders).toContain(prop);
    }
  });

  it('routes ground-floor zombies through the stairs for a player inside the bunker', () => {
    const arena = makeArena();
    unlock(arena, 'nuclear-bunker');
    const manager = new ZombieManager(() => 0, {}, false, [[1.45, -2.5]], [], arena.floorTransitions);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), 5, -2);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    for (let frame = 0; frame < 600 && zombie.floor === 0; frame++) {
      manager.update(1 / 60, 5.5, -2, -1);
    }
    expect(zombie.floor).toBe(-1);
    expect(zombie.position.y).toBeCloseTo(MANSION_BUNKER_Y, 5);
  });

  it.each([4.35, 5.95])('routes a zombie entering the stair edge at x=%s', (stairX) => {
    const arena = makeArena();
    unlock(arena, 'nuclear-bunker');
    const manager = new ZombieManager(
      () => 0,
      {},
      false,
      [[stairX, -2.8]],
      [],
      arena.floorTransitions,
    );
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), 5.5, -2);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';

    for (let frame = 0; frame < 600 && zombie.floor === 0; frame++) {
      manager.update(1 / 60, 5.5, -2, -1);
    }

    expect(zombie.floor).toBe(-1);
    expect(zombie.position.y).toBeCloseTo(MANSION_BUNKER_Y, 5);
  });

  it('retargets stairs when the player changes floors repeatedly', () => {
    const arena = makeArena();
    unlock(arena, 'nuclear-bunker');
    const manager = new ZombieManager(() => 0, {}, false, [[1.45, -2.5]], [], arena.floorTransitions);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), 5, -2);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';

    for (let frame = 0; frame < 180; frame++) {
      const bunker = Math.floor(frame / 15) % 2 === 0;
      manager.update(1 / 60, 5.5, bunker ? -2 : -4.2, bunker ? -1 : 0);
    }
    for (let frame = 0; frame < 900 && zombie.floor !== -1; frame++) {
      manager.update(1 / 60, 5.5, -2, -1);
    }

    expect(zombie.floor).toBe(-1);
    expect(zombie.position.y).toBeCloseTo(MANSION_BUNKER_Y, 5);
  });

  it('refreshes navigation for an active zombie when a paid door opens', () => {
    const arena = makeArena();
    const manager = new ZombieManager(() => 0, {}, false, [[-3.5, 4.5]]);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), -3.5, -0.5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';

    for (let frame = 0; frame < 240; frame++) manager.update(1 / 60, -3.5, -0.5, 0);
    expect(zombie.position.z).toBeGreaterThan(2.35);

    zombie.position.set(-3.5, 0, 2.7);
    unlock(arena, 'to-dining');
    manager.registerColliders([...arena.colliders]);
    for (let frame = 0; frame < 600; frame++) manager.update(1 / 60, -3.5, -0.5, 0);

    expect(zombie.position.z).toBeLessThan(1.5);
  });

  it('requests a grid path the moment a wall blocks the straight line', () => {
    // Zombie in the start room south-west, player in the dining room: the
    // direct line crosses the z = 2 wall, so pursuit must adopt a navigation
    // path immediately instead of pushing the wall until the failsafe fires.
    const arena = makeArena();
    unlock(arena, 'to-dining');
    const manager = new ZombieManager(() => 0.5, {}, false, [[-6, 5.5]]);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), -6, -5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';

    for (let frame = 0; frame < 30; frame++) manager.update(1 / 60, -6, -5, 0);

    expect(manager.navigationComputationCount).toBeGreaterThan(0);
    expect(manager.navigationPathCount).toBeGreaterThan(0);
  });

  it('routes from the start room to the east hall only through the open doors', () => {
    const arena = makeArena();
    unlock(arena, 'to-dining');
    unlock(arena, 'to-east-hall');
    const manager = new ZombieManager(() => 0.5, {}, false, [[-6, 5.5]]);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), 2, -4);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };

    let crossedDining = false;
    let crossedEastHall = false;
    const previous = zombie.position.clone();
    for (let frame = 0; frame < 1200 && damage === 0; frame++) {
      manager.update(1 / 60, 2, -4, 0);
      const { x, z } = zombie.position;
      if (previous.z >= 2 && z < 2) {
        // The only z = 2 crossing available is the dining door aperture.
        expect(Math.abs(x + 3.5)).toBeLessThan(1.1);
        crossedDining = true;
      }
      if (previous.x <= 0 && x > 0) {
        // The only x = 0 crossing available is the east hall door aperture.
        expect(Math.abs(z + 2.5)).toBeLessThan(1.1);
        crossedEastHall = true;
      }
      previous.copy(zombie.position);
    }

    expect(crossedDining).toBe(true);
    expect(crossedEastHall).toBe(true);
    expect(damage).toBeGreaterThan(0);
  });

  it('never routes through a locked door or a boarded window', () => {
    // Post-breach chaser (no barrier assignment): every passage into the
    // dining room is sealed — locked door plus boarded windows — so there is
    // no walkable route and the zombie must press the wall without ever
    // crossing it, until the anti-stuck net decides otherwise (outside this
    // six-second window).
    const arena = makeArena();
    const manager = new ZombieManager(() => 0.5, {}, false, [[-6, 5.5]], arena.barriers);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), -6, -5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    zombie.barrierTarget = null;
    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };

    // Six seconds: long enough to prove no sealed passage is ever crossed,
    // short enough to stay before the anti-stuck last-resort relocation.
    for (let frame = 0; frame < 360; frame++) {
      manager.update(1 / 60, -6, -5, 0);
      expect(zombie.position.z).toBeGreaterThan(1.3);
    }
    expect(damage).toBe(0);
  });

  it('lets zombies pursue through the full ground-floor room sequence', () => {
    const arena = makeArena();
    const manager = new ZombieManager(() => 0, {}, false, [[-3.5, 4.8]]);
    manager.spawnZombie(roundConfig(1), -3.5, -2.5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';

    unlock(arena, 'to-dining');
    manager.registerColliders([...arena.colliders]);
    for (let frame = 0; frame < 900; frame++) manager.update(1 / 60, -3.5, -2.5, 0);
    expect(zombie.position.z).toBeLessThan(2);

    unlock(arena, 'to-east-hall');
    manager.registerColliders([...arena.colliders]);
    for (let frame = 0; frame < 900; frame++) manager.update(1 / 60, 2.5, -5, 0);
    expect(zombie.position.x).toBeGreaterThan(0);

    unlock(arena, 'nuclear-bunker');
    manager.registerColliders([...arena.colliders]);
    for (let frame = 0; frame < 900; frame++) manager.update(1 / 60, 5.5, -2.5, 0);
    expect(zombie.position.x).toBeGreaterThan(3.2);
    expect(zombie.position.z).toBeLessThan(0);
  });

  it('routes around solid furniture instead of attacking through it', () => {
    const arena = makeArena();
    const manager = new ZombieManager(() => 0, {}, false, [[-5.5, 7.55]]);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), -5.5, 5.4);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };

    let maxStep = 0;
    for (let frame = 0; frame < 480; frame++) {
      const previous = zombie.position.clone();
      manager.update(1 / 60, -5.5, 5.4, 0);
      maxStep = Math.max(maxStep, zombie.position.distanceTo(previous));
    }

    expect(damage).toBeGreaterThan(0);
    expect(Math.abs(zombie.position.x + 5.5)).toBeGreaterThan(0.4);
    expect(maxStep).toBeLessThan(0.1);
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

  it('follows exterior approach, attacks closed boards, then enters continuously', () => {
    const arena = makeArena();
    const manager = new ZombieManager(() => 0, {}, false, arena.spawnPoints, arena.barriers);
    manager.registerColliders([...arena.colliders]);
    manager.spawnZombie(roundConfig(1), 5, -5);
    const zombie = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ][0];
    zombie.state = 'walk';
    expect(zombie.position.x).toBeLessThan(-7.45);
    expect(zombie.barrierTarget?.id).toBe('start-west-a');
    const assignedBarrier = zombie.barrierTarget!;
    manager.update(1 / 60, -4, 5.4, 0);
    expect(zombie.group.rotation.y).toBeGreaterThan(0);
    expect(zombie.group.rotation.y).toBeLessThan(0.2);

    let crossed = false;
    let maxStep = 0;
    for (let frame = 0; frame < 2400; frame++) {
      const previous = zombie.position.clone();
      manager.update(1 / 60, -4, 5.4, 0);
      maxStep = Math.max(maxStep, zombie.position.distanceTo(previous));
      if (!assignedBarrier.isOpen) expect(zombie.position.x).toBeLessThan(-7.5);
      if (zombie.position.x > -6.7) {
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
    expect(maxStep).toBeLessThan(0.1);
  });

  it('uses scaled PBR surfaces, instanced frames and room-specific unshadowed point lights', () => {
    const arena = makeArena();
    const walls = arena.group.children.filter((child) => child.userData.mapRole === 'wall') as THREE.Mesh[];
    const wall = walls[0];
    const wallMaterial = wall.material as THREE.MeshStandardMaterial;
    expect(wallMaterial.map).toBeInstanceOf(THREE.DataTexture);
    expect(wallMaterial.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(wallMaterial.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(wallMaterial.aoMap).toBeInstanceOf(THREE.DataTexture);
    expect(new Set(walls.map((mesh) => (mesh.material as THREE.Material).name))).toEqual(
      new Set(['plaster_damaged', 'concrete_dirty', 'burned_wall']),
    );
    expect(new Set(walls.map((mesh) => mesh.userData.surface))).toEqual(
      new Set(['concrete']),
    );
    const wallUvs = wall.geometry.getAttribute('uv');
    expect(Math.max(...Array.from({ length: wallUvs.count }, (_, index) => wallUvs.getX(index)))).toBeGreaterThan(2);

    const roofMaterial = (arena.group.getObjectByName('mansion-roof') as THREE.Mesh).material as THREE.Material;
    const groundMaterial = (arena.group.getObjectByName('ground-floor') as THREE.Mesh).material as THREE.Material;
    const bunkerMaterial = (arena.group.getObjectByName('bunker-floor') as THREE.Mesh).material as THREE.Material;
    expect(roofMaterial.name).toBe('blackened_plaster_ceiling');
    expect(groundMaterial.name).toBe('worn_concrete_floor');
    expect(bunkerMaterial.name).toBe('worn_concrete_floor');

    expect(arena.group.children.filter((child) => child.userData.mapRole === 'soot-detail').length).toBeGreaterThan(5);
    expect(arena.group.children.filter((child) => child.userData.mapRole === 'exposed-brick')).toHaveLength(2);
    const frames = arena.group.children.filter((child) => child.userData.mapRole === 'window-frames');
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame instanceof THREE.InstancedMesh)).toBe(true);
    const pointLights = arena.group.children.filter((child) => child instanceof THREE.PointLight);
    expect(pointLights).toHaveLength(6);
    expect(pointLights.every((light) => !light.castShadow)).toBe(true);
  });

  it('restores doors, active zones, colliders and barrier state on restart', () => {
    const arena = makeArena();
    unlock(arena, 'to-dining');
    unlock(arena, 'to-east-hall');
    unlock(arena, 'nuclear-bunker');
    const barrier = arena.barriers[0];
    barrier.damage(100);
    barrier.repair(0.3);

    arena.reset();

    expect(arena.doors.every((door) => door.isLocked)).toBe(true);
    expect(arena.barriers).toHaveLength(3);
    expect(arena.spawnPoints).toHaveLength(3);
    expect(barrier.state).toBe('intact');
    expect(barrier.boards.every((board) => board.hp === board.maxHp)).toBe(true);
    expect(
      arena.colliders.filter((object) => object.name.startsWith('point-door-collider:')),
    ).toHaveLength(3);
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
