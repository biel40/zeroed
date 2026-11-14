import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, type DeviceProfile, type QualityLevel } from '../src/core/DeviceProfile';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { Input } from '../src/player/Input';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';
import { LaSeuArena } from '../src/zombies/maps/LaSeuArena';
import {
  ALTAR,
  CHANCEL,
  LA_SEU_BOX_PLACEMENT,
  LA_SEU_DOORS,
  LA_SEU_ENTRANCES,
  LA_SEU_LIGHT_SITES,
  LA_SEU_PASSAGE,
  LA_SEU_PLAYER_SPAWN,
  LA_SEU_ROOMS,
  LA_SEU_SPAWNS,
  LA_SEU_WALL_BUYS,
  LA_SEU_WALL_THICKNESS,
  NAVE,
  NAVE_COLUMN_ZS,
  PEW_BLOCKS,
  PLAZA,
  naveBayCenter,
  type LaSeuEntrance,
} from '../src/zombies/maps/LaSeuConfig';
import { pointedArch, ribVaultGeometry, vaultHeightAt } from '../src/zombies/maps/laSeu/GothicVault';
import { pewBlockFootprint } from '../src/zombies/maps/laSeu/NaveFurniture';
import { naveVaultBays } from '../src/zombies/maps/laSeu/NaveShell';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import { mysteryBoxFootprint } from '../src/zombies/MysteryBoxFootprint';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;
const ZOMBIE_BAND = { bottom: 0.05, top: 1.8 } as const;
/** Longest solid the horde still treats as an obstacle (ZombieManager). */
const MAX_OBSTACLE_FOOTPRINT = 20;
const FACE_NORTH = 0;
const FACE_EAST = -Math.PI / 2;
const FACE_SOUTH = Math.PI;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(profile: DeviceProfile = TEST_PROFILE): LaSeuArena {
  const arena = new LaSeuArena(new THREE.Scene(), profile);
  arena.init();
  return arena;
}

/** World AABBs of everything solid a zombie body or the player can bump into. */
function solidBoxes(arena: ZombieArena): THREE.Box3[] {
  arena.group.updateMatrixWorld(true);
  return [
    ...arena.colliders.map((object) => new THREE.Box3().setFromObject(object)),
    ...(arena.wallColliders ?? []),
  ].filter((box) => box.max.y > ZOMBIE_BAND.bottom && box.min.y < ZOMBIE_BAND.top);
}

function bodyBox(x: number, z: number, radius: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(x - radius, ZOMBIE_BAND.bottom, z - radius),
    new THREE.Vector3(x + radius, ZOMBIE_BAND.top, z + radius),
  );
}

function isClear(arena: ZombieArena, x: number, z: number, radius: number): boolean {
  const body = bodyBox(x, z, radius);
  return !solidBoxes(arena).some((box) => box.intersectsBox(body));
}

/** Footprint of an entrance's dead-end passage, walls included. */
function passageBox(entrance: LaSeuEntrance): THREE.Box3 {
  const halfWidth = LA_SEU_PASSAGE.width[entrance.kind] / 2 + LA_SEU_WALL_THICKNESS;
  const near = LA_SEU_WALL_THICKNESS / 2;
  const far = near + LA_SEU_PASSAGE.length + LA_SEU_WALL_THICKNESS;
  const a = new THREE.Vector3(entrance.x + entrance.outwardX * near, 0, entrance.z + entrance.outwardZ * near);
  const b = new THREE.Vector3(entrance.x + entrance.outwardX * far, 3, entrance.z + entrance.outwardZ * far);
  const box = new THREE.Box3().setFromPoints([a, b]);
  if (entrance.outwardX !== 0) box.expandByVector(new THREE.Vector3(0, 0, halfWidth));
  else box.expandByVector(new THREE.Vector3(halfWidth, 0, 0));
  return box;
}

function insideRoom(x: number, z: number): boolean {
  return LA_SEU_ROOMS.some((room) => x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ);
}

function openBarrier(arena: LaSeuArena, id: string): void {
  const barrier = arena.barriers.find((candidate) => candidate.id === id)!;
  while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
}

function openPlaza(arena: LaSeuArena): void {
  const door = arena.doors[0];
  expect(door.tryUnlock(() => true).success).toBe(true);
  expect(arena.activateDoor(door.id)).toBe(true);
}

function spawnOf(arena: LaSeuArena, id: string): ZombieSpawnPoint {
  return arena.spawnPoints.find((point) => (point as ZombieSpawnPoint).barrierId === id) as ZombieSpawnPoint;
}

/** Runs one zombie from `spawn` at a stationary player until it lands a hit. */
function chaseUntilHit(arena: LaSeuArena, spawn: ZombieSpawnPoint, playerX: number, playerZ: number, seconds: number): { hit: boolean; path: THREE.Vector3[] } {
  const manager = new ZombieManager(() => 0, {}, false, [spawn], arena.barriers, [], () => 1);
  manager.setNavigationBounds(arena.navigationBounds);
  manager.registerColliders([...arena.colliders]);
  expect(manager.spawnZombie(roundConfig(6), playerX, playerZ, 6)).toBe(true);
  const zombie = [...manager.actives][0];
  zombie.state = 'walk';
  let hit = false;
  manager.onPlayerAttack = () => { hit = true; };
  const path: THREE.Vector3[] = [];
  for (let frame = 0; frame < seconds / DT && !hit; frame++) {
    manager.update(DT, playerX, playerZ, 0);
    if (frame % 10 === 0) path.push(zombie.position.clone());
  }
  return { hit, path };
}

const idleInput = {
  isDown: () => false,
  wasPressed: () => false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  moveAxisX: 0,
  moveAxisY: 0,
} as unknown as Input;

const forwardInput = { ...idleInput, isDown: (code: string) => code === 'KeyW' } as unknown as Input;

const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0, absorbCompensation: () => undefined },
} as unknown as Weapon;

/** Walks the player forward from (x, z) along `yaw` for `seconds` and returns where they ended. */
function walk(arena: ZombieArena, x: number, z: number, yaw: number, seconds: number): THREE.Vector3 {
  const player = new PlayerController(1);
  player.setWallColliders(arena.wallColliders!);
  player.teleport(x, EYE_HEIGHT, z, 0, arena.playerBounds);
  player.face(yaw);
  for (let frame = 0; frame < seconds / DT; frame++) player.update(DT, forwardInput, weaponStub);
  return player.rig.position.clone();
}

describe('La Seu Gothic geometry', () => {
  it('draws an equilateral pointed arch: upright at the springs, a point at the crown', () => {
    expect(pointedArch(-1)).toBeCloseTo(0);
    expect(pointedArch(1)).toBeCloseTo(0);
    expect(pointedArch(0)).toBeCloseTo(1);
    expect(pointedArch(0.5)).toBeCloseTo(pointedArch(-0.5));
    // Two arcs meeting at an angle: the crown is a point, never flat like a round arch.
    expect(pointedArch(0) - pointedArch(0.1)).toBeGreaterThan(0.02);
  });

  it('vaults every bay as two crossing tunnels: level ridges, arches on all four sides', () => {
    const [aisle, central] = naveVaultBays(0);
    const centerZ = (central.minZ + central.maxZ) / 2;
    expect(vaultHeightAt(central, 0, centerZ)).toBeCloseTo(NAVE.naveApexY);
    expect(vaultHeightAt(central, 0, central.minZ)).toBeCloseTo(NAVE.naveApexY);
    expect(vaultHeightAt(central, central.minX, centerZ)).toBeCloseTo(NAVE.naveApexY);
    expect(vaultHeightAt(central, central.minX, central.minZ)).toBeCloseTo(NAVE.naveSpringY);
    // The side aisle's vault lands on the arcade exactly: same spring, same crown.
    expect(vaultHeightAt(aisle, aisle.maxX, centerZ)).toBeCloseTo(NAVE.aisleApexY);
    expect(vaultHeightAt(aisle, aisle.maxX, aisle.minZ)).toBeCloseTo(NAVE.aisleSpringY);

    const geometry = ribVaultGeometry(central, 10, 5);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let index = 0; index < position.count; index++) {
      expect(position.getY(index)).toBeCloseTo(vaultHeightAt(central, position.getX(index), position.getZ(index)), 4);
      expect(normal.getY(index)).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('La Seu layout', () => {
  it('initializes and restarts single-player with the plaza Mystery Box', () => {
    const { ctx } = makeContext();
    const mode = new ZombiesMode('la-seu');
    mode.init(ctx);
    const state = mode as unknown as { box: unknown; boxView: unknown };
    expect(state.box).not.toBeNull();
    expect(state.boxView).not.toBeNull();
    mode.onInteract();
    mode.onRestartRequested();
    expect(state.box).not.toBeNull();
  });

  it('starts with the nave alone: the wicket locked and the plaza gates dormant', () => {
    const arena: ZombieArena = makeArena();
    expect(arena.doors.map((door) => [door.id, door.cost, door.isLocked])).toEqual([['to-plaza', 1000, true]]);
    const nave = LA_SEU_ENTRANCES.filter((entrance) => entrance.zone === 'nave');
    expect(nave).toHaveLength(5);
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(nave.map((entrance) => entrance.id));
    expect(arena.spawnPoints).toEqual(LA_SEU_SPAWNS.nave);
    expect(arena.activateDoor('nowhere')).toBe(false);
    expect(arena.completionInteraction).toBeUndefined();
  });

  it('spawns the player on the central aisle, clear of every solid, under the high vault', () => {
    const arena = makeArena();
    expect(isClear(arena, LA_SEU_PLAYER_SPAWN.x, LA_SEU_PLAYER_SPAWN.z, 0.35)).toBe(true);
    expect(Math.abs(LA_SEU_PLAYER_SPAWN.x)).toBeLessThan(NAVE.columnX);
    const up = new THREE.Raycaster(new THREE.Vector3(LA_SEU_PLAYER_SPAWN.x, EYE_HEIGHT, LA_SEU_PLAYER_SPAWN.z), new THREE.Vector3(0, 1, 0));
    arena.group.updateMatrixWorld(true);
    const [ceiling] = up.intersectObjects([...arena.colliders], false);
    expect(ceiling.object.name).toBe('nave-vault');
    expect(ceiling.point.y).toBeGreaterThan(20);
  });

  it('places every zombie spawn outside every room, clear of colliders, behind its own entrance', () => {
    const arena = makeArena();
    openPlaza(arena);
    const solids = solidBoxes(arena);
    for (const spawn of Object.values(LA_SEU_SPAWNS).flat()) {
      expect(insideRoom(spawn.x, spawn.z), `spawn ${spawn.barrierId}`).toBe(false);
      const body = bodyBox(spawn.x, spawn.z, 0.45);
      for (const box of solids) expect(box.intersectsBox(body), `spawn ${spawn.barrierId}`).toBe(false);
      const entrance = LA_SEU_ENTRANCES.find((candidate) => candidate.id === spawn.barrierId)!;
      const side = (x: number, z: number): number => (x - entrance.x) * entrance.outwardX + (z - entrance.z) * entrance.outwardZ;
      expect(side(spawn.approachX!, spawn.approachZ!)).toBeGreaterThan(0.4);
      expect(side(spawn.breachX!, spawn.breachZ!)).toBeLessThan(-0.4);
      expect(isClear(arena, spawn.breachX!, spawn.breachZ!, 0.42), `breach ${spawn.barrierId}`).toBe(true);
    }
  });

  it('keeps every entrance passage off the others and off every room but its own wall', () => {
    const passages = LA_SEU_ENTRANCES.map(passageBox);
    for (let index = 0; index < passages.length; index++) {
      for (let other = index + 1; other < passages.length; other++) expect(passages[index].intersectsBox(passages[other])).toBe(false);
      for (const room of LA_SEU_ROOMS) {
        const interior = new THREE.Box3(new THREE.Vector3(room.minX, 0, room.minZ), new THREE.Vector3(room.maxX, 3, room.maxZ)).expandByScalar(-0.01);
        expect(interior.intersectsBox(passages[index]), LA_SEU_ENTRANCES[index].id).toBe(false);
      }
    }
  });

  it('builds every wall the horde must respect short enough to count as an obstacle', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const size = new THREE.Vector3();
    for (const collider of arena.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      box.getSize(size);
      const inBand = box.max.y > ZOMBIE_BAND.bottom && box.min.y < ZOMBIE_BAND.top && size.y >= 0.5;
      if (!inBand || collider.userData.mapRole === 'slab' || collider.userData.mapRole?.startsWith('passage-')) continue;
      expect(Math.max(size.x, size.z), collider.name).toBeLessThanOrEqual(MAX_OBSTACLE_FOOTPRINT);
    }
  });

  it.each(LA_SEU_ENTRANCES.map((entrance) => [entrance.id, entrance.zone] as const))('gives the %s entrance (%s) a walkable route to the player spawn', (id, zone) => {
    const arena = makeArena();
    if (zone === 'plaza') openPlaza(arena);
    openBarrier(arena, id);
    const { hit } = chaseUntilHit(arena, spawnOf(arena, id), LA_SEU_PLAYER_SPAWN.x, LA_SEU_PLAYER_SPAWN.z, 150);
    expect(hit).toBe(true);
  });

  it('hangs every wall buy 2 cm off a wall, within reach, at the configured prices', () => {
    const arena = makeArena();
    openPlaza(arena);
    expect(arena.wallBuys.map((wallBuy) => [wallBuy.weaponId, wallBuy.price, wallBuy.ammoPrice])).toEqual([
      ['m14', 800, 625], ['ak47', 1750, 900], ['m60', 2500, 1250],
    ]);
    const inside = (point: THREE.Vector3): boolean => arena.wallColliders.some((box) => box.containsPoint(point));
    for (const wallBuy of LA_SEU_WALL_BUYS) {
      const facing = new THREE.Vector3(Math.sin(wallBuy.yaw), 0, Math.cos(wallBuy.yaw));
      const position = new THREE.Vector3(wallBuy.position.x, wallBuy.position.y, wallBuy.position.z);
      expect(inside(position.clone().addScaledVector(facing, -0.03)), wallBuy.id).toBe(true);
      expect(inside(position.clone().addScaledVector(facing, -0.01)), wallBuy.id).toBe(false);
      const stand = position.clone().addScaledVector(facing, 0.7);
      expect(insideRoom(stand.x, stand.z), wallBuy.id).toBe(true);
      expect(isClear(arena, stand.x, stand.z, 0.3), wallBuy.id).toBe(true);
    }
    // The first rifle is in the nave, in reach from the first round.
    expect(LA_SEU_WALL_BUYS[0].position.z).toBeLessThan(NAVE.maxZ);
  });
});

describe('La Seu nave', () => {
  it('stands both rows of octagonal columns as solids for the player, the horde and bullets', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const columns = arena.colliders.filter((collider) => collider.userData.mapRole === 'column');
    expect(columns).toHaveLength(NAVE_COLUMN_ZS.length * 2);
    for (const column of columns) {
      const box = new THREE.Box3().setFromObject(column);
      expect(Math.abs(Math.abs(column.position.x) - NAVE.columnX)).toBeLessThan(1e-9);
      expect(box.max.y).toBeCloseTo(NAVE.aisleSpringY);
      expect(arena.wallColliders.some((wall) => wall.containsPoint(column.position))).toBe(true);
      // Eight sides: the corner of the bounding square is open air, the shaft itself is not.
      const down = new THREE.Vector3(0, -1, 0);
      const corner = new THREE.Raycaster(new THREE.Vector3(box.min.x + 0.05, 30, box.min.z + 0.05), down);
      expect(corner.intersectObject(column, false)).toHaveLength(0);
      const middle = new THREE.Raycaster(new THREE.Vector3(column.position.x, 30, column.position.z), down);
      expect(middle.intersectObject(column, false).length).toBeGreaterThan(0);
    }
    // The player cannot walk through a shaft on the way up the column line.
    const blocked = walk(arena, NAVE.columnX, NAVE_COLUMN_ZS[0] + 2, FACE_NORTH, 3);
    expect(blocked.z).toBeGreaterThan(NAVE_COLUMN_ZS[0] + 0.8);
  });

  it('keeps the central aisle and the west side aisle open from the doors to the crossing', () => {
    const arena = makeArena();
    const crossing = naveBayCenter(NAVE.bays - 1);
    const central = walk(arena, 0, LA_SEU_PLAYER_SPAWN.z, FACE_NORTH, 14);
    expect(central.z).toBeLessThan(crossing);
    expect(Math.abs(central.x)).toBeLessThan(0.01);
    const side = walk(arena, -10.2, LA_SEU_PLAYER_SPAWN.z, FACE_NORTH, 14);
    expect(side.z).toBeLessThan(crossing);
  });

  it('fills the central aisle with solid pew blocks, leaves the cleared ones open and a cross-aisle at every column line', () => {
    const arena = makeArena();
    for (const block of PEW_BLOCKS) {
      const footprint = pewBlockFootprint(block);
      const centerX = (footprint.minX + footprint.maxX) / 2;
      const centerZ = (footprint.minZ + footprint.maxZ) / 2;
      expect(isClear(arena, centerX, centerZ, 0.3), `${block.bay}/${block.side}`).toBe(block.state === 'cleared');
      // Clear of the column lines either end of its bay.
      expect(footprint.maxZ).toBeLessThan(naveBayCenter(block.bay) + NAVE.bayLength / 2 - 1.2);
      expect(Math.abs(footprint.maxX) < NAVE.columnX - 1.6 || Math.abs(footprint.minX) < NAVE.columnX - 1.6).toBe(true);
    }
    for (const z of NAVE_COLUMN_ZS) {
      // From one side aisle to the other along the column line, round both shafts.
      for (const x of [-10, -3, 0, 3, 10]) expect(isClear(arena, x, z, 0.42), `cross-aisle ${x}, ${z}`).toBe(true);
    }
    const acrossPews = walk(arena, -10, naveBayCenter(2), FACE_EAST, 6);
    expect(acrossPews.x).toBeLessThan(-PEW_BLOCKS.length / 2 + 1);
  });

  it('lets the horde reach a player behind the altar from the far west door, and stops the player at the sacristy door', () => {
    const arena = makeArena();
    openBarrier(arena, 'nave-almoina-door');
    const behindAltar = { x: ALTAR.x, z: ALTAR.z - ALTAR.daisDepth / 2 - 0.8 };
    expect(isClear(arena, behindAltar.x, behindAltar.z, 0.35)).toBe(true);
    const { hit, path } = chaseUntilHit(arena, spawnOf(arena, 'nave-almoina-door'), behindAltar.x, behindAltar.z, 150);
    expect(hit).toBe(true);
    expect(path.some((point) => point.z < CHANCEL.maxZ)).toBe(true);

    openBarrier(arena, 'chancel-sacristy');
    const sacristy = LA_SEU_ENTRANCES.find((entrance) => entrance.id === 'chancel-sacristy')!;
    const end = walk(arena, sacristy.x - 2.5, sacristy.z, FACE_EAST, 4);
    expect(end.x).toBeLessThan(CHANCEL.maxX);
  });
});

describe('La Seu plaza', () => {
  it('stays shut behind the wicket until it is bought, then opens the way out and wakes its gates', () => {
    const arena = makeArena();
    const shut = walk(arena, 0, -2, FACE_SOUTH, 4);
    expect(shut.z).toBeLessThan(NAVE.maxZ);
    openPlaza(arena);
    arena.update(5);
    const out = walk(arena, 0, -2, FACE_SOUTH, 4);
    expect(out.z).toBeGreaterThan(PLAZA.minZ + 4);
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(LA_SEU_ENTRANCES.map((entrance) => entrance.id));
    expect(arena.spawnPoints).toEqual([...LA_SEU_SPAWNS.nave, ...LA_SEU_SPAWNS.plaza]);
    expect(arena.activateDoor(LA_SEU_DOORS[0].id)).toBe(false);
  });

  it('keeps the player on the plaza: side walls, the parapet over the sea and the front either side of the doors', () => {
    const arena = makeArena();
    openPlaza(arena);
    expect(walk(arena, 0, 8, FACE_SOUTH, 6).z).toBeLessThan(PLAZA.maxZ);
    expect(walk(arena, 0, 8, FACE_EAST, 8).x).toBeLessThan(PLAZA.maxX);
    expect(walk(arena, -7, 8, FACE_NORTH, 6).z).toBeGreaterThan(PLAZA.minZ);
  });

  it('routes the horde through the wicket both ways', () => {
    const arena = makeArena();
    openPlaza(arena);
    openBarrier(arena, 'nave-west-chapel');
    const outward = chaseUntilHit(arena, spawnOf(arena, 'nave-west-chapel'), 6, 11, 200);
    expect(outward.hit).toBe(true);
    expect(outward.path.some((point) => point.z > PLAZA.minZ)).toBe(true);
    openBarrier(arena, 'plaza-palau-gate');
    const inward = chaseUntilHit(arena, spawnOf(arena, 'plaza-palau-gate'), 0, naveBayCenter(3), 200);
    expect(inward.hit).toBe(true);
  });

  it('stands the crate against the front, clear of the piers, with room to use it', () => {
    const arena = makeArena();
    openPlaza(arena);
    const footprint = mysteryBoxFootprint(LA_SEU_BOX_PLACEMENT);
    expect(footprint.min.z).toBeGreaterThanOrEqual(PLAZA.minZ - 1e-6);
    arena.group.updateMatrixWorld(true);
    for (const collider of arena.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      if (collider.userData.mapRole === 'slab') continue;
      expect(box.intersectsBox(footprint.clone().expandByScalar(-0.01)), collider.name).toBe(false);
    }
    const stand = bodyBox(LA_SEU_BOX_PLACEMENT.position.x, footprint.max.z + 0.5, 0.3);
    expect(solidBoxes(arena).some((box) => box.intersectsBox(stand))).toBe(false);
  });
});

describe('La Seu lights and ambience', () => {
  const visibleLights = (arena: LaSeuArena): THREE.PointLight[] => {
    const lights: THREE.PointLight[] = [];
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible) lights.push(object); });
    return lights;
  };

  it.each(QUALITY_LEVELS)('keeps a fixed %s-quality point-light budget wherever the player goes', (quality: QualityLevel) => {
    const arena = makeArena({ ...TEST_PROFILE, quality });
    expect(arena.pointLightCount).toBe(POINT_LIGHT_BUDGET[quality]);
    expect(visibleLights(arena)).toHaveLength(POINT_LIGHT_BUDGET[quality]);
    const observers = [new THREE.Vector3(0, 1.7, -4), new THREE.Vector3(0, 1.7, -54), new THREE.Vector3(8, 1.7, 12), new THREE.Vector3(-10, 1.7, -25)];
    for (let step = 0; step < 400; step++) arena.update(0.1, observers[Math.floor(step / 100)]);
    expect(visibleLights(arena)).toHaveLength(POINT_LIGHT_BUDGET[quality]);
    for (const light of visibleLights(arena)) expect(light.castShadow).toBe(false);
  });

  it('moves the real lights to the sites nearest the player, one site per light, and back on reset', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    const litSites = (): string[] => visibleLights(arena)
      .filter((light) => light.intensity > 0)
      .map((light) => LA_SEU_LIGHT_SITES.find((site) => site.x === light.position.x && site.y === light.position.y && site.z === light.position.z)!.id)
      .sort();
    const start = litSites();
    expect(start).toHaveLength(POINT_LIGHT_BUDGET.low);
    expect(start).toContain('entry-moon');
    const plaza = new THREE.Vector3(0, 1.7, 9);
    for (let step = 0; step < 80; step++) arena.update(0.1, plaza);
    const outside = litSites();
    expect(new Set(outside).size).toBe(POINT_LIGHT_BUDGET.low);
    expect(outside.filter((id) => id.startsWith('plaza-')).length).toBeGreaterThanOrEqual(2);
    arena.reset();
    expect(litSites()).toEqual(start);
  });

  it('applies its own night mood and reuses existing music', () => {
    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.45;
    const arena = new LaSeuArena(scene, { ...TEST_PROFILE, useReducedEffects: false });
    arena.init();
    expect((scene.fog as THREE.FogExp2).density).toBe(arena.ambience.fog.density);
    expect(scene.environmentIntensity).toBe(arena.ambience.environmentIntensity?.intensity);
    // Thin enough to read the vault from the floor.
    expect(Math.exp(-((arena.ambience.fog.density * NAVE.naveApexY) ** 2))).toBeGreaterThan(0.7);
    expect(arena.group.getObjectByName('laseu-moon-shafts')).toBeDefined();
    expect(makeArena().group.getObjectByName('laseu-moon-shafts')).toBeUndefined();
  });
});

describe('La Seu reset', () => {
  it('restores boards, the wicket, lights and spawns without leaving anything behind', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const childCount = (): number => {
      let count = 0;
      arena.group.traverse(() => { count++; });
      return count;
    };
    const intensities = (): number[] => {
      const values: number[] = [];
      arena.group.traverse((object) => { if (object instanceof THREE.PointLight) values.push(object.intensity); });
      return values;
    };
    const baseline = {
      children: childCount(),
      colliders: arena.colliders.length,
      wallColliders: arena.wallColliders.map((box) => box.clone()),
      spawns: arena.spawnPoints,
      intensities: intensities(),
    };

    openPlaza(arena);
    for (const barrier of arena.barriers) {
      while (!barrier.isOpen) barrier.damage(100);
    }
    for (let step = 0; step < 200; step++) arena.update(0.25, new THREE.Vector3(0, 1.7, 10));

    arena.reset();
    expect(childCount()).toBe(baseline.children);
    expect(arena.colliders).toHaveLength(baseline.colliders);
    expect(arena.wallColliders.every((box, index) => box.equals(baseline.wallColliders[index]))).toBe(true);
    expect(arena.spawnPoints).toEqual(baseline.spawns);
    expect(arena.doors[0].isLocked).toBe(true);
    for (const barrier of arena.barriers) expect(barrier.intactCount).toBe(barrier.boards.length);
    expect(intensities()).toEqual(baseline.intensities);
  });
});
