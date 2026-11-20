import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceProfile } from '../src/core/DeviceProfile';
import type { Input } from '../src/player/Input';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import {
  CATACOMB_AMBIENT_EVENTS,
  CATACOMB_DOORS,
  CATACOMB_ENTRANCES,
  CATACOMB_FLOOR,
  CATACOMB_FLOOR_Y,
  CATACOMB_LIGHT_SITES,
  CATACOMB_MOOD,
  CATACOMB_ROOMS,
  CATACOMB_WALL_BUYS,
  CATACOMB_WALL_THICKNESS,
  CATACOMB_ZONES,
  CRYPT_EMERGENCE_SITES,
  CRYPT_LANDING,
  CRYPT_STAIR,
  CRYPT_STAIR_X,
  CRYPT_TOMB_EMERGENCE,
  CRYPT_TOMB_EMERGENCES,
  CRYPT_ZOMBIE_LOOK,
  GALLERIES,
  PANTHEON,
  PANTHEON_CRACK,
  PANTHEON_PIERS,
  PANTHEON_PIER,
  RELIQUARY,
  ROYAL_TOMB,
  ROYAL_TOMBS,
  SANCTUARY,
  WIND_ACCENT_COLOR,
  WIND_BOW_ALTAR,
  WIND_BOW_COMPONENT_SITES,
  WIND_BOW_COMPONENTS,
  windBowSocket,
} from '../src/zombies/maps/DieKathedraleCatacombsConfig';
import {
  CHANCEL,
  DIE_KATHEDRALE_DOORS,
  DIE_KATHEDRALE_LIGHT_SITES,
  DIE_KATHEDRALE_PASSAGE,
  DIE_KATHEDRALE_ROOMS,
  DIE_KATHEDRALE_SPAWNS,
  DIE_KATHEDRALE_WALL_THICKNESS,
  NAVE,
  naveBayCenter,
} from '../src/zombies/maps/DieKathedraleConfig';
import { DIE_KATHEDRALE_FOOTSTEP_SURFACES } from '../src/zombies/maps/dieKathedrale/DieKathedraleFootstepSurfaces';
import { sanctuaryStepBoxes } from '../src/zombies/maps/dieKathedrale/catacombs/WindSanctuary';
import { undergroundPresence, type UndergroundPresence } from '../src/zombies/maps/dieKathedrale/catacombs/UndergroundPresence';
import { footstepSurfaceAt } from '../src/zombies/maps/FootstepSurfaces';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import { emergenceDuration } from '../src/zombies/emergence/ZombieEmergence';
import { TOMB_LID_SLIDE_SECONDS } from '../src/zombies/maps/dieKathedrale/catacombs/TombLids';
import { roundConfig, ZOMBIE_TYPE_CONFIGS } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;
const B = CATACOMB_FLOOR_Y;
/** The band a body occupies on the catacomb floor (feet + 0.05 to head). */
const LOW_BAND = { bottom: B + 0.05, top: B + 1.8 } as const;
const MAX_OBSTACLE_FOOTPRINT = 20;
const FACE_NORTH = 0;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(profile: DeviceProfile = TEST_PROFILE): DieKathedraleArena {
  const arena = new DieKathedraleArena(new THREE.Scene(), profile);
  arena.init();
  return arena;
}

function openDoor(arena: DieKathedraleArena, id: string): void {
  const door = arena.doors.find((candidate) => candidate.id === id)!;
  expect(door.tryUnlock(() => true).success, id).toBe(true);
  expect(arena.activateDoor(id), id).toBe(true);
}

function openBarrier(arena: DieKathedraleArena, id: string): void {
  const barrier = arena.barriers.find((candidate) => candidate.id === id)!;
  while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
}

/** The gates that lead from the narthex down to the stair. */
const TO_CRYPT = ['rood-gate', 'choir-gate', 'crypt-gate'] as const;

function solidBoxesIn(arena: DieKathedraleArena, bottom: number, top: number): THREE.Box3[] {
  arena.group.updateMatrixWorld(true);
  return [
    ...arena.colliders.map((object) => new THREE.Box3().setFromObject(object)),
    ...arena.wallColliders,
  ].filter((box) => box.max.y > bottom && box.min.y < top);
}

function isClearBelow(arena: DieKathedraleArena, x: number, z: number, radius: number): boolean {
  const body = new THREE.Box3(new THREE.Vector3(x - radius, LOW_BAND.bottom, z - radius), new THREE.Vector3(x + radius, LOW_BAND.top, z + radius));
  return !solidBoxesIn(arena, LOW_BAND.bottom, LOW_BAND.top).some((box) => box.intersectsBox(body));
}

/** Spots to stand on below ground. */
const PROBES = {
  landing: { x: CRYPT_STAIR_X, z: -62.6 },
  gallerySouth: { x: -20, z: -66.7 },
  galleryWest: { x: -28.3, z: -73 },
  galleryNorth: { x: -15, z: -81 },
  pantheon: { x: 3.6, z: -74 },
  pantheonCorner: { x: 12, z: -82.5 },
  reliquary: { x: 0, z: -86.2 },
  breathPassage: { x: -9, z: SANCTUARY.z },
  sanctuary: { x: SANCTUARY.x, z: SANCTUARY.z + 2.4 },
} as const;
type ProbeId = keyof typeof PROBES;

const FLOOD_STEP = 0.5;

/** Every probe the player can walk to on the catacomb floor from the landing, through the player's own colliders. */
function reachableBelow(arena: DieKathedraleArena): ProbeId[] {
  const walls = arena.wallColliders.filter((box) => box.max.y > LOW_BAND.bottom && box.min.y < LOW_BAND.top);
  const body = new THREE.Box3();
  const free = (x: number, z: number): boolean => {
    if (z > CRYPT_STAIR.bottomZ - 0.4) return false;
    body.min.set(x - 0.3, LOW_BAND.bottom, z - 0.3);
    body.max.set(x + 0.3, LOW_BAND.top, z + 0.3);
    return !walls.some((wall) => wall.intersectsBox(body));
  };
  const key = (x: number, z: number): string => `${Math.round(x / FLOOD_STEP)}/${Math.round(z / FLOOD_STEP)}`;
  const start = PROBES.landing;
  const seen = new Set<string>([key(start.x, start.z)]);
  const queue: Array<readonly [number, number]> = [[start.x, start.z]];
  while (queue.length > 0) {
    const [x, z] = queue.pop()!;
    for (const [stepX, stepZ] of [[FLOOD_STEP, 0], [-FLOOD_STEP, 0], [0, FLOOD_STEP], [0, -FLOOD_STEP]] as const) {
      const nextX = x + stepX;
      const nextZ = z + stepZ;
      if (seen.has(key(nextX, nextZ)) || !free(nextX, nextZ)) continue;
      seen.add(key(nextX, nextZ));
      queue.push([nextX, nextZ]);
    }
  }
  return (Object.keys(PROBES) as ProbeId[]).filter((id) => seen.has(key(PROBES[id].x, PROBES[id].z)));
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

function playerOn(arena: DieKathedraleArena): PlayerController {
  const player = new PlayerController(1);
  player.setWallColliders(arena.wallColliders);
  player.setFloorTransitions(arena.floorTransitions);
  return player;
}

/** One zombie from `spawn` at a still player on `floor`; whether it lands a hit, and where it went. */
function chase(arena: DieKathedraleArena, spawn: ZombieSpawnPoint, player: { x: number; z: number }, floor: number, seconds: number): { hit: boolean; floors: Set<number> } {
  const manager = new ZombieManager(() => 0, {}, false, [spawn], arena.barriers, arena.floorTransitions, () => 1);
  manager.setNavigationBounds(arena.navigationBounds);
  manager.registerColliders([...arena.colliders]);
  expect(manager.spawnZombie(roundConfig(6), player.x, player.z, 6, floor)).toBe(true);
  const zombie = [...manager.actives][0];
  zombie.state = 'walk';
  let hit = false;
  manager.onPlayerAttack = () => { hit = true; };
  const floors = new Set<number>([zombie.floor]);
  const eyeY = (floor === CATACOMB_FLOOR ? B : 0) + EYE_HEIGHT;
  for (let frame = 0; frame < seconds / DT && !hit; frame++) {
    manager.update(DT, player.x, player.z, floor, eyeY);
    floors.add(zombie.floor);
  }
  return { hit, floors };
}

function spawnOf(id: string): ZombieSpawnPoint {
  return Object.values(DIE_KATHEDRALE_SPAWNS).flat().find((point) => point.barrierId === id)!;
}

describe('Die Kathedrale catacombs: layout', () => {
  it('builds five rooms below the cathedral\'s floor, outside its footprint, the stair excepted', () => {
    expect(Object.keys(CATACOMB_ROOMS)).toEqual(expect.arrayContaining(['landing', 'galleries', 'pantheon', 'reliquary', 'sanctuary']));
    expect(B).toBeLessThan(-4);
    for (const [name, room] of Object.entries(CATACOMB_ROOMS)) {
      for (const above of DIE_KATHEDRALE_ROOMS) {
        const overlap = room.minX < above.maxX && room.maxX > above.minX && room.minZ < above.maxZ && room.maxZ > above.minZ;
        expect(overlap, name).toBe(false);
      }
    }
    // The stair starts on the inner face of the nave's north wall, in the crossing's west bay, clear of the chancel.
    expect(CRYPT_STAIR.headZ).toBeCloseTo(NAVE.minZ - DIE_KATHEDRALE_WALL_THICKNESS);
    expect(CRYPT_STAIR.maxX).toBeLessThan(CHANCEL.minX - DIE_KATHEDRALE_WALL_THICKNESS);
    expect(CRYPT_STAIR.minX).toBeGreaterThan(NAVE.minX);
    const gate = DIE_KATHEDRALE_DOORS.find((door) => door.id === 'crypt-gate')!;
    expect(gate.x).toBe(CRYPT_STAIR_X);
    expect(gate.zones).toEqual(['crossing', 'galleries']);
    // About 32 degrees: steep enough to feel the descent, never a ladder.
    const slope = Math.atan2(-B, CRYPT_STAIR.topZ - CRYPT_STAIR.bottomZ) * 180 / Math.PI;
    expect(slope).toBeGreaterThan(28);
    expect(slope).toBeLessThan(36);
  });

  it('starts with every catacomb gate locked and every catacomb entrance asleep', () => {
    const arena = makeArena();
    for (const door of arena.doors.filter((candidate) => candidate.floor === CATACOMB_FLOOR)) {
      expect(door.isLocked, door.id).toBe(true);
      expect(door.y).toBe(B);
    }
    for (const entrance of CATACOMB_ENTRANCES) expect(arena.barriers.some((barrier) => barrier.id === entrance.id), entrance.id).toBe(false);
    expect(arena.spawnPoints.every((spawn) => (spawn as ZombieSpawnPoint).floor === undefined)).toBe(true);
  });

  it('joins the floors with one stair whose triggers sit on its far landings', () => {
    const arena = makeArena();
    const transitions = arena.floorTransitions.filter((zone) => zone.sourceFloor === CATACOMB_FLOOR || zone.targetFloor === CATACOMB_FLOOR);
    expect(transitions.map((zone) => [zone.sourceFloor, zone.targetFloor])).toEqual([[0, CATACOMB_FLOOR], [CATACOMB_FLOOR, 0]]);
    const ramp = transitions[0].ramp!;
    expect(ramp.top.y).toBe(0);
    expect(ramp.bottom.y).toBe(B);
    expect(transitions[0].box.containsPoint(new THREE.Vector3(CRYPT_STAIR_X, B + EYE_HEIGHT, CRYPT_STAIR.bottomZ))).toBe(true);
    expect(transitions[1].box.containsPoint(new THREE.Vector3(CRYPT_STAIR_X, EYE_HEIGHT, CRYPT_STAIR.topZ))).toBe(true);
    // Each floor's navigation covers the whole flight: a body keeps its floor until the far landing.
    for (const bounds of arena.navigationBounds.filter((candidate) => candidate.floor === 0 || candidate.floor === CATACOMB_FLOOR)) {
      expect(bounds.maxZ, `floor ${bounds.floor}`).toBeGreaterThanOrEqual(CRYPT_STAIR.topZ);
      expect(bounds.minZ, `floor ${bounds.floor}`).toBeLessThanOrEqual(CRYPT_STAIR.bottomZ);
    }
  });

  it('keeps the player out of the stair until the crypt gate is bought, then walks them down and back up', () => {
    const arena = makeArena();
    for (const id of ['rood-gate', 'choir-gate']) openDoor(arena, id);
    arena.update(5);
    // Between the broken pew of the crossing and the gate.
    const start = NAVE.minZ + 1.6;
    let player = playerOn(arena);
    player.teleport(CRYPT_STAIR_X, EYE_HEIGHT, start, 0, arena.playerBounds);
    player.face(FACE_NORTH);
    for (let frame = 0; frame < 3 / DT; frame++) player.update(DT, forwardInput, weaponStub);
    expect(player.rig.position.z).toBeGreaterThan(NAVE.minZ - 0.1);
    expect(player.floor).toBe(0);

    openDoor(arena, 'crypt-gate');
    arena.update(5);
    player = playerOn(arena);
    player.teleport(CRYPT_STAIR_X, EYE_HEIGHT, start, 0, arena.playerBounds);
    player.face(FACE_NORTH);
    for (let frame = 0; frame < 6 / DT; frame++) player.update(DT, forwardInput, weaponStub);
    expect(player.floor).toBe(CATACOMB_FLOOR);
    expect(player.rig.position.y).toBeCloseTo(B + EYE_HEIGHT, 3);
    expect(player.rig.position.z).toBeLessThan(CRYPT_STAIR.bottomZ);

    player.face(Math.PI);
    for (let frame = 0; frame < 9 / DT; frame++) player.update(DT, forwardInput, weaponStub);
    // Off the flight the view settles on the floor's height.
    for (let frame = 0; frame < 1 / DT; frame++) player.update(DT, idleInput, weaponStub);
    expect(player.floor).toBe(0);
    expect(player.rig.position.y).toBeCloseTo(EYE_HEIGHT, 3);
    expect(player.rig.position.z).toBeGreaterThan(NAVE.minZ);
  });

  it.each([
    [[], ['landing', 'gallerySouth', 'galleryWest', 'galleryNorth']],
    [['pantheon-gate'], ['landing', 'gallerySouth', 'galleryWest', 'galleryNorth', 'pantheon', 'pantheonCorner']],
    [['pantheon-gate', 'reliquary-gate'], ['landing', 'gallerySouth', 'galleryWest', 'galleryNorth', 'pantheon', 'pantheonCorner', 'reliquary']],
    [['pantheon-gate', 'reliquary-gate', 'sanctuary-gate'], ['landing', 'gallerySouth', 'galleryWest', 'galleryNorth', 'pantheon', 'pantheonCorner', 'reliquary', 'breathPassage', 'sanctuary']],
    [['ossuary-gate'], ['landing', 'gallerySouth', 'galleryWest', 'galleryNorth', 'sanctuary', 'breathPassage']],
  ] as ReadonlyArray<readonly [string[], ProbeId[]]>)('opens exactly what the catacomb gates %j lead to', (doors, expected) => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, ...doors]) openDoor(arena, door);
    expect([...reachableBelow(arena)].sort()).toEqual([...expected].sort());
  });

  it('closes a loop: the shrine joins the reliquary to the galleries, so no room below is a dead end once all is open', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, ...CATACOMB_DOORS.map((candidate) => candidate.id)]) openDoor(arena, door);
    const reachable = reachableBelow(arena);
    expect(reachable).toHaveLength(Object.keys(PROBES).length);
    const loop = ['pantheon-gate', 'reliquary-gate', 'sanctuary-gate', 'ossuary-gate'];
    const ring = CATACOMB_DOORS.filter((door) => loop.includes(door.id));
    // Around the ring each gate joins the zone the last one led to.
    expect(ring.map((door) => door.zones)).toEqual([['galleries', 'pantheon'], ['pantheon', 'reliquary'], ['reliquary', 'sanctuary'], ['galleries', 'sanctuary']]);
  });

  it('builds every wall the horde must respect below ground short enough to count as an obstacle', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const size = new THREE.Vector3();
    let walls = 0;
    for (const collider of arena.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      box.getSize(size);
      const inBand = box.max.y > LOW_BAND.bottom && box.min.y < LOW_BAND.top && size.y >= 0.5;
      if (!inBand || collider.userData.mapRole === 'slab' || collider.userData.mapRole === 'ceiling' || collider.userData.mapRole?.startsWith('passage-')) continue;
      if (collider.userData.mapRole === 'wall') walls++;
      expect(Math.max(size.x, size.z), collider.name).toBeLessThanOrEqual(MAX_OBSTACLE_FOOTPRINT);
    }
    expect(walls).toBeGreaterThan(20);
  });

  it('stands the shrine\'s walkable floor inside its round wall', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, 'ossuary-gate']) openDoor(arena, door);
    const steps = sanctuaryStepBoxes();
    expect(steps.length).toBeGreaterThanOrEqual(12);
    // A body touching the curved wall is always stopped, wherever the wall is not a passage's mouth.
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
      const x = SANCTUARY.x + Math.cos(angle) * (SANCTUARY.radius - 0.15);
      const z = SANCTUARY.z + Math.sin(angle) * (SANCTUARY.radius - 0.15);
      const atPassage = [0, Math.PI / 2, Math.PI].some((mouth) => Math.abs(Math.atan2(Math.sin(angle - mouth), Math.cos(angle - mouth))) < 0.3);
      if (atPassage) continue;
      expect(isClearBelow(arena, x, z, 0.3), `${(angle * 180 / Math.PI).toFixed(0)} deg`).toBe(false);
    }
    // Round the pedestal there is room to circle a crowd, and the stepped masonry keeps close to the wall.
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      expect(isClearBelow(arena, SANCTUARY.x + Math.cos(angle) * 3, SANCTUARY.z + Math.sin(angle) * 3, 0.42)).toBe(true);
    }
    for (let angle = Math.PI / 72; angle < Math.PI * 2; angle += Math.PI / 36) {
      expect(isClearBelow(arena, SANCTUARY.x + Math.cos(angle) * 4.6, SANCTUARY.z + Math.sin(angle) * 4.6, 0.3), `${(angle * 180 / Math.PI).toFixed(0)} deg`).toBe(true);
    }
  });
});

describe('Die Kathedrale catacombs: horde', () => {
  it('places every catacomb spawn on its floor, outside every room, clear of solids, behind its own entrance', () => {
    const arena = makeArena();
    for (const door of DIE_KATHEDRALE_DOORS) openDoor(arena, door.id);
    for (const entrance of CATACOMB_ENTRANCES) {
      const spawn = spawnOf(entrance.id);
      expect(spawn.floor, entrance.id).toBe(CATACOMB_FLOOR);
      for (const room of Object.values(CATACOMB_ROOMS)) {
        const inside = spawn.x > room.minX && spawn.x < room.maxX && spawn.z > room.minZ && spawn.z < room.maxZ;
        expect(inside, entrance.id).toBe(false);
      }
      expect(isClearBelow(arena, spawn.x, spawn.z, 0.45), `spawn ${entrance.id}`).toBe(true);
      expect(isClearBelow(arena, spawn.breachX!, spawn.breachZ!, 0.42), `breach ${entrance.id}`).toBe(true);
      const barrier = arena.barriers.find((candidate) => candidate.id === entrance.id)!;
      expect(barrier.floor).toBe(CATACOMB_FLOOR);
      expect(barrier.y).toBeCloseTo(B + 1.15);
    }
    const passageEnds = CATACOMB_ENTRANCES.map((entrance) => ({
      x: entrance.x + entrance.outwardX * (CATACOMB_WALL_THICKNESS / 2 + DIE_KATHEDRALE_PASSAGE.length),
      z: entrance.z + entrance.outwardZ * (CATACOMB_WALL_THICKNESS / 2 + DIE_KATHEDRALE_PASSAGE.length),
    }));
    const below = arena.navigationBounds.find((bounds) => bounds.floor === CATACOMB_FLOOR)!;
    for (const end of passageEnds) {
      expect(end.x).toBeGreaterThanOrEqual(below.minX);
      expect(end.x).toBeLessThanOrEqual(below.maxX);
      expect(end.z).toBeGreaterThanOrEqual(below.minZ);
      expect(end.z).toBeLessThanOrEqual(below.maxZ);
    }
  });

  it.each(CATACOMB_ENTRANCES.map((entrance) => [entrance.id] as const))('gives the %s entrance a walkable route to a player at the foot of the stair', (id) => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, ...CATACOMB_DOORS.map((candidate) => candidate.id)]) openDoor(arena, door);
    openBarrier(arena, id);
    const { hit } = chase(arena, spawnOf(id), PROBES.landing, CATACOMB_FLOOR, 150);
    expect(hit).toBe(true);
  });

  it('brings the cathedral\'s dead down the stair to a player below, and the catacombs\' up to a player in the crossing', () => {
    const arena = makeArena();
    for (const door of TO_CRYPT) openDoor(arena, door);
    openBarrier(arena, 'chancel-sacristy');
    const down = chase(arena, spawnOf('chancel-sacristy'), PROBES.landing, CATACOMB_FLOOR, 150);
    expect(down.hit).toBe(true);
    expect([...down.floors]).toEqual([0, CATACOMB_FLOOR]);
    openBarrier(arena, 'gallery-south-burial');
    const up = chase(arena, spawnOf('gallery-south-burial'), { x: -8, z: -46 }, 0, 150);
    expect(up.hit).toBe(true);
    expect([...up.floors]).toEqual([CATACOMB_FLOOR, 0]);
  });

  it('raises the crypt\'s own dead from the catacomb floor only', () => {
    expect(makeArena().zombieFloorLook).toBe(CRYPT_ZOMBIE_LOOK);
    expect(CRYPT_ZOMBIE_LOOK.floor).toBe(CATACOMB_FLOOR);
  });

  it('sends the round\'s dead from the player\'s own floor when there are spawns there', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, 'pantheon-gate']) openDoor(arena, door);
    const manager = new ZombieManager(() => 0, {}, false, arena.spawnPoints, arena.barriers, arena.floorTransitions, () => 1);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    expect(manager.spawnZombie(roundConfig(2), PROBES.pantheon.x, PROBES.pantheon.z, 2, CATACOMB_FLOOR)).toBe(true);
    expect(manager.spawnZombie(roundConfig(2), 0, -20, 2, 0)).toBe(true);
    const [below, above] = [...manager.actives];
    expect(below.floor).toBe(CATACOMB_FLOOR);
    expect(below.position.y).toBeCloseTo(B);
    expect(above.floor).toBe(0);
    expect(above.position.y).toBeCloseTo(0);
  });
});

describe('Die Kathedrale catacombs: the royal pantheon', () => {
  it('lays four distinct monarchs in the side bays, one tomb open and empty beside the cracked wall', () => {
    expect(ROYAL_TOMBS).toHaveLength(4);
    expect(new Set(ROYAL_TOMBS.map((tomb) => tomb.effigy)).size).toBe(4);
    const empty = ROYAL_TOMBS.filter((tomb) => tomb.effigy === 'empty');
    expect(empty).toHaveLength(1);
    expect(Math.hypot(empty[0].x - PANTHEON_CRACK.x, empty[0].z - PANTHEON_CRACK.z)).toBeLessThan(4);
    const centre = { x: (PANTHEON.minX + PANTHEON.maxX) / 2, z: (PANTHEON.minZ + PANTHEON.maxZ) / 2 };
    for (const tomb of ROYAL_TOMBS) expect(Math.hypot(tomb.x - centre.x, tomb.z - centre.z), tomb.id).toBeGreaterThan(5);
  });

  it('keeps room to kite round every tomb and pier: a ring of open floor and escape on every side', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, 'pantheon-gate']) openDoor(arena, door);
    for (const tomb of ROYAL_TOMBS) {
      expect(isClearBelow(arena, tomb.x, tomb.z, 0.3), tomb.id).toBe(false);
      const halfX = ROYAL_TOMB.width / 2 + 0.17;
      const halfZ = ROYAL_TOMB.length / 2 + 0.17;
      // North and south of every tomb, and on at least one long side, a body passes.
      expect(isClearBelow(arena, tomb.x, tomb.z - halfZ - 0.6, 0.42), `${tomb.id} north`).toBe(true);
      expect(isClearBelow(arena, tomb.x, tomb.z + halfZ + 0.6, 0.42), `${tomb.id} south`).toBe(true);
      const sides = [-1, 1].filter((side) => isClearBelow(arena, tomb.x + side * (halfX + 1.2), tomb.z, 0.42));
      expect(sides.length, tomb.id).toBeGreaterThanOrEqual(1);
    }
    for (const pier of PANTHEON_PIERS) {
      expect(isClearBelow(arena, pier.x, pier.z, 0.3)).toBe(false);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        expect(isClearBelow(arena, pier.x + dx * (PANTHEON_PIER.halfWidth + 0.6), pier.z + dz * (PANTHEON_PIER.halfWidth + 0.6), 0.42)).toBe(true);
      }
    }
  });
});

describe('Die Kathedrale catacombs: the dead rise from their tombs', () => {
  const walkerRadius = ZOMBIE_TYPE_CONFIGS.normal.bodyRadius;
  const tombOf = (id: string) => ROYAL_TOMBS.find((tomb) => tomb.id === id)!;

  it('picks a few royal tombs below ground: the body rises inside the chest and lands on clear pantheon floor beside it', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, 'pantheon-gate']) openDoor(arena, door);
    expect(CRYPT_EMERGENCE_SITES.length).toBeGreaterThan(0);
    expect(CRYPT_EMERGENCE_SITES.length).toBeLessThan(ROYAL_TOMBS.length);
    for (const site of CRYPT_EMERGENCE_SITES) {
      const tomb = tombOf(site.id);
      expect(tomb, site.id).toBeDefined();
      expect(site.floor).toBe(CATACOMB_FLOOR);
      expect(site.zone).toBe('pantheon');
      expect(site.rise.y).toBe(B);
      expect(Math.abs(site.rise.x - tomb.x)).toBeLessThan(ROYAL_TOMB.width / 2);
      expect(Math.abs(site.rise.z - tomb.z)).toBeLessThan(ROYAL_TOMB.length / 2);
      expect(site.rim).toBeCloseTo(ROYAL_TOMB.plinthHeight + ROYAL_TOMB.chestHeight);
      expect(site.rimDistance).toBeGreaterThan(0);
      expect(site.rise.z).toBe(site.exit.z);
      expect(Math.abs(site.exit.x - site.rise.x)).toBeGreaterThan(site.rimDistance);
      expect(site.exit.x - walkerRadius).toBeGreaterThan(PANTHEON.minX);
      expect(site.exit.x + walkerRadius).toBeLessThan(PANTHEON.maxX);
      expect(isClearBelow(arena, site.exit.x, site.exit.z, walkerRadius), site.id).toBe(true);
    }
    for (const emergence of CRYPT_TOMB_EMERGENCES) {
      if (emergence.lidShift !== undefined) expect(tombOf(emergence.tombId).effigy, emergence.tombId).not.toBe('empty');
    }
  });

  it('wakes the tombs once the pantheon is open, and sleeps them again on reset', () => {
    const arena = makeArena();
    expect(arena.emergenceTuning).toBe(CRYPT_TOMB_EMERGENCE);
    for (const door of TO_CRYPT) openDoor(arena, door);
    expect(arena.emergenceSites).toEqual([]);
    openDoor(arena, 'pantheon-gate');
    expect(arena.emergenceSites).toEqual(CRYPT_EMERGENCE_SITES);
    arena.reset();
    expect(arena.emergenceSites).toEqual([]);
  });

  it('grinds a shut lid aside within the stir, clear of the rising body, and shuts it on reset', () => {
    const arena = makeArena();
    expect(TOMB_LID_SLIDE_SECONDS).toBeLessThanOrEqual(CRYPT_TOMB_EMERGENCE.timing.stir);
    for (const emergence of CRYPT_TOMB_EMERGENCES.filter((candidate) => candidate.lidShift !== undefined)) {
      const tomb = tombOf(emergence.tombId);
      const site = CRYPT_EMERGENCE_SITES.find((candidate) => candidate.id === tomb.id)!;
      const lid = arena.group.getObjectByName(`die-kathedrale-tomb-lid:${tomb.id}`)!;
      expect(lid.position.x).toBeCloseTo(tomb.x);
      arena.disturbEmergenceSite(tomb.id, 'breach');
      arena.update(TOMB_LID_SLIDE_SECONDS);
      expect(lid.position.x).toBeCloseTo(tomb.x);
      arena.disturbEmergenceSite(tomb.id, 'stir');
      for (let elapsed = 0; elapsed < TOMB_LID_SLIDE_SECONDS + DT; elapsed += DT) arena.update(DT);
      expect(lid.position.x).toBeCloseTo(tomb.x - emergence.side * emergence.lidShift!);
      // The lid's near edge (with its turn) leaves the body's shoulders a gap to rise through.
      const nearEdge = lid.position.x + emergence.side * ((ROYAL_TOMB.width + 0.1) / 2 + (ROYAL_TOMB.length / 2) * Math.abs(Math.sin(lid.rotation.y)));
      expect(emergence.side * (site.rise.x - nearEdge)).toBeGreaterThan(0.1);
      arena.reset();
      expect(lid.position.x).toBeCloseTo(tomb.x);
      expect(lid.rotation.y).toBeCloseTo(0);
    }
    expect(() => arena.disturbEmergenceSite('tomb-east', 'stir')).not.toThrow();
  });

  it('brings the dead out of a tomb unable to strike, then hunting a player across the pantheon', () => {
    const arena = makeArena();
    for (const door of [...TO_CRYPT, 'pantheon-gate']) openDoor(arena, door);
    const manager = new ZombieManager(() => 0, {}, false, arena.spawnPoints, arena.barriers, arena.floorTransitions, () => 1);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    manager.setEmergenceSites(arena.emergenceSites, { ...CRYPT_TOMB_EMERGENCE, chance: 1 });
    const player = PROBES.pantheon;
    expect(manager.spawnZombie(roundConfig(2), player.x, player.z, 2, CATACOMB_FLOOR)).toBe(true);
    const zombie = [...manager.actives][0];
    expect(manager.isEmerging(zombie)).toBe(true);
    const site = CRYPT_EMERGENCE_SITES.find((candidate) => candidate.rise.x === zombie.position.x && candidate.rise.z === zombie.position.z)!;
    expect(site).toBeDefined();
    let hitAt = -1;
    manager.onPlayerAttack = () => { if (hitAt < 0) hitAt = elapsed; };
    let elapsed = 0;
    for (; elapsed < 30 && hitAt < 0; elapsed += DT) {
      manager.update(DT, player.x, player.z, CATACOMB_FLOOR, B + EYE_HEIGHT);
      expect(zombie.position.y).toBeCloseTo(B);
    }
    expect(hitAt).toBeGreaterThan(emergenceDuration(CRYPT_TOMB_EMERGENCE.timing));
    expect(zombie.floor).toBe(CATACOMB_FLOOR);
  });
});

describe('Die Kathedrale catacombs: the Wind Bow, prepared and not built', () => {
  it('reserves stable ids and places for its three parts, two below ground and one hidden upstairs', () => {
    expect(WIND_BOW_COMPONENTS).toEqual(['oathwood', 'whisperstring', 'tempestCore']);
    const oathwood = WIND_BOW_COMPONENT_SITES.oathwood;
    const emptyTomb = ROYAL_TOMBS.find((tomb) => tomb.effigy === 'empty')!;
    expect(oathwood.floor).toBe(CATACOMB_FLOOR);
    expect(Math.abs(oathwood.position.x - emptyTomb.x)).toBeLessThan(ROYAL_TOMB.width / 2);
    expect(Math.abs(oathwood.position.z - emptyTomb.z)).toBeLessThan(ROYAL_TOMB.length / 2);
    const whisperstring = WIND_BOW_COMPONENT_SITES.whisperstring;
    expect(whisperstring.floor).toBe(0);
    // Inside the confessional of the east aisle's fourth bay.
    expect(whisperstring.position.z).toBeCloseTo(naveBayCenter(4));
    expect(whisperstring.position.x).toBeGreaterThan(NAVE.maxX - 1.15);
    expect(whisperstring.position.x).toBeLessThan(NAVE.maxX);
    const core = WIND_BOW_COMPONENT_SITES.tempestCore;
    expect(core.floor).toBe(CATACOMB_FLOOR);
    expect(Math.hypot(core.position.x - SANCTUARY.x, core.position.z - SANCTUARY.z)).toBeLessThan(0.01);
  });

  it('builds the reliquary\'s altar with three empty sockets on its top, one per part', () => {
    const arena = makeArena();
    const altar = arena.colliders.find((collider) => collider.name === 'reliquary-altar')!;
    expect(altar).toBeDefined();
    const box = new THREE.Box3().setFromObject(altar);
    const sockets = WIND_BOW_COMPONENTS.map(windBowSocket);
    expect(new Set(sockets.map((socket) => `${socket.x}/${socket.z}`)).size).toBe(3);
    for (const socket of sockets) {
      expect(socket.x).toBeGreaterThan(box.min.x);
      expect(socket.x).toBeLessThan(box.max.x);
      expect(socket.y).toBeGreaterThanOrEqual(box.max.y);
      expect(socket.y - box.max.y).toBeLessThan(0.05);
      expect(socket.z).toBeCloseTo(WIND_BOW_ALTAR.z);
    }
    expect(WIND_BOW_ALTAR.x).toBeGreaterThan(RELIQUARY.minX);
    expect(WIND_BOW_ALTAR.x).toBeLessThan(RELIQUARY.maxX);
  });

  it('adds no bow, no pickup and no quest interaction to the map', () => {
    const arena: ZombieArena = makeArena();
    expect(arena.weaponPickups).toBeUndefined();
    expect(arena.completionInteraction).toBeUndefined();
    expect(arena.ritualInteraction).toBeUndefined();
    expect(arena.wallBuys.map((wallBuy) => wallBuy.weaponId)).not.toContain('windBow');
  });
});

describe('Die Kathedrale catacombs: light, sound and the two levels', () => {
  const presence = (): UndergroundPresence => ({ depth: 0, showCathedral: true, showCatacombs: false });

  it('draws only the level the observer can see', () => {
    const out = presence();
    expect(undergroundPresence({ x: 0, y: EYE_HEIGHT, z: -3.6 }, false, out)).toEqual({ depth: 0, showCathedral: true, showCatacombs: false });
    expect(undergroundPresence({ x: CRYPT_STAIR_X, y: EYE_HEIGHT, z: -46 }, false, out).showCatacombs).toBe(false);
    expect(undergroundPresence({ x: CRYPT_STAIR_X, y: EYE_HEIGHT, z: -46 }, true, out).showCatacombs).toBe(true);
    const stair = undergroundPresence({ x: CRYPT_STAIR_X, y: -1.3, z: -55 }, true, out);
    expect(stair.showCathedral && stair.showCatacombs).toBe(true);
    expect(stair.depth).toBeGreaterThan(0);
    expect(stair.depth).toBeLessThan(1);
    const landing = undergroundPresence({ x: CRYPT_STAIR_X, y: B + EYE_HEIGHT, z: -62.5 }, true, out);
    expect(landing).toEqual({ depth: 1, showCathedral: true, showCatacombs: true });
    expect(undergroundPresence({ x: 3.6, y: B + EYE_HEIGHT, z: -74 }, true, out)).toEqual({ depth: 1, showCathedral: false, showCatacombs: true });
  });

  it('hides each level\'s meshes with its group and darkens the mood below ground, then restores both on reset', () => {
    const scene = new THREE.Scene();
    const arena = new DieKathedraleArena(scene, { ...TEST_PROFILE, useReducedEffects: false });
    arena.init();
    const cathedral = arena.group.getObjectByName('die-kathedrale-cathedral')!;
    const catacombs = arena.group.getObjectByName('die-kathedrale-catacombs')!;
    const moon = arena.group.getObjectByName('die-kathedrale-moonlight') as THREE.DirectionalLight;
    const moonIntensity = moon.intensity;
    expect([cathedral.visible, catacombs.visible]).toEqual([true, false]);
    for (const door of TO_CRYPT) openDoor(arena, door);
    arena.update(0.1, new THREE.Vector3(3.6, B + EYE_HEIGHT, -74));
    expect([cathedral.visible, catacombs.visible]).toEqual([false, true]);
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(CATACOMB_MOOD.fogDensity);
    expect(moon.intensity).toBe(0);
    // The stair belongs to neither group: it stays in view from both levels.
    const stairMeshes = arena.group.children.filter((child) => child.name.startsWith('die-kathedrale-crypt-stair'));
    expect(stairMeshes.length).toBeGreaterThan(0);
    arena.reset();
    expect([cathedral.visible, catacombs.visible]).toEqual([true, false]);
    expect((scene.fog as THREE.FogExp2).density).toBe(arena.ambience.fog.density);
    expect(moon.intensity).toBe(moonIntensity);
  });

  it('keeps torches and candles as islands below ground, the wind\'s cold light only at the crack and in the shrine, and every weapon lit', () => {
    for (const site of CATACOMB_LIGHT_SITES) {
      if (site.id !== 'crypt-head-torch') expect(site.y, site.id).toBeLessThan(0);
      expect(site.distance, site.id).toBeLessThanOrEqual(12);
    }
    const cold = CATACOMB_LIGHT_SITES.filter((site) => site.color === WIND_ACCENT_COLOR).map((site) => site.id).sort();
    expect(cold).toEqual(['pantheon-crack', 'sanctuary-breath']);
    const lit = (x: number, z: number): boolean => CATACOMB_LIGHT_SITES.some((site) => Math.hypot(site.x - x, site.z - z) < site.distance * 0.8);
    for (const wallBuy of CATACOMB_WALL_BUYS) expect(lit(wallBuy.position.x, wallBuy.position.z), wallBuy.id).toBe(true);
    // The west tomb is left in the dark.
    const west = ROYAL_TOMBS.find((tomb) => tomb.id === 'tomb-west')!;
    expect(CATACOMB_LIGHT_SITES.filter((site) => site.flicker).every((site) => Math.hypot(site.x - west.x, site.z - west.z) > 6)).toBe(true);
  });

  it('turns the fill cold and dimmer below ground without going black, and gives the surface its own back on reset', () => {
    const scene = new THREE.Scene();
    const arena = new DieKathedraleArena(scene, TEST_PROFILE);
    arena.init();
    const hemisphere = arena.group.children.find((child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight)!;
    const surface = { sky: hemisphere.color.getHex(), ground: hemisphere.groundColor.getHex(), intensity: hemisphere.intensity, fog: (scene.fog as THREE.FogExp2).color.getHex() };
    for (const door of TO_CRYPT) openDoor(arena, door);
    arena.update(0.1, new THREE.Vector3(3.6, B + EYE_HEIGHT, -74));
    const sky = hemisphere.color;
    expect(sky.getHex()).toBe(new THREE.Color(CATACOMB_MOOD.hemisphereSky).getHex());
    // Desaturated blue-grey: cold, but never a saturated blue.
    expect(sky.b).toBeGreaterThan(sky.r);
    expect(sky.b - sky.r).toBeLessThan(0.05);
    expect(hemisphere.intensity).toBeLessThan(surface.intensity);
    expect(hemisphere.intensity).toBeGreaterThan(surface.intensity * 0.3);
    const fog = (scene.fog as THREE.FogExp2).color;
    expect(fog.b).toBeGreaterThanOrEqual(fog.r);
    arena.reset();
    expect({ sky: hemisphere.color.getHex(), ground: hemisphere.groundColor.getHex(), intensity: hemisphere.intensity, fog: (scene.fog as THREE.FogExp2).color.getHex() }).toEqual(surface);
  });

  it('haloes every flame below ground with a shared glow, adding no real light', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    const catacombs = arena.group.getObjectByName('die-kathedrale-catacombs')!;
    const halos = catacombs.getObjectByName('die-kathedrale-catacomb-halos')!;
    const flames = CATACOMB_LIGHT_SITES.filter((site) => site.flicker && site.y < 0);
    expect(halos.children).toHaveLength(flames.length);
    const materials = new Set(halos.children.map((halo) => (halo as THREE.Sprite).material));
    expect(materials.size).toBeLessThanOrEqual(2);
    for (const material of materials) {
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(material.depthWrite).toBe(false);
      expect(material.opacity).toBeLessThan(0.4);
    }
    for (const site of flames) {
      expect(halos.children.some((halo) => halo.position.distanceTo(new THREE.Vector3(site.x, site.y, site.z)) < 0.01), site.id).toBe(true);
    }
    let pointLights = 0;
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight) pointLights++; });
    expect(pointLights).toBe(arena.pointLightCount);
  });

  it('lets a faint cold spill down the stair and lights the reliquary gate with a torch, the west tomb still dark', () => {
    const spill = CATACOMB_LIGHT_SITES.find((site) => site.id === 'crypt-stair-spill')!;
    const color = new THREE.Color(spill.color);
    expect(spill.flicker).toBe(false);
    expect(color.b).toBeGreaterThan(color.r);
    expect(spill.color).not.toBe(WIND_ACCENT_COLOR);
    expect(spill.intensity).toBeLessThan(2);
    const torch = CATACOMB_LIGHT_SITES.find((site) => site.id === 'pantheon-reliquary-torch')!;
    expect(torch.flicker).toBe(true);
    expect(Math.abs(torch.z - PANTHEON.minZ)).toBeLessThan(0.5);
  });

  it('moves the real lights down with the player', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    for (let step = 0; step < 80; step++) arena.update(0.1, new THREE.Vector3(3.6, B + EYE_HEIGHT, -74));
    const lights: THREE.PointLight[] = [];
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.intensity > 0) lights.push(object); });
    expect(lights.length).toBeGreaterThan(0);
    for (const light of lights) {
      const site = DIE_KATHEDRALE_LIGHT_SITES.find((candidate) => candidate.x === light.position.x && candidate.z === light.position.z)!;
      expect(site.id.startsWith('pantheon-'), site.id).toBe(true);
    }
  });

  it('plays the catacombs\' own sounds below ground and the cathedral\'s above, never both', () => {
    const arena = makeArena();
    const heard: string[] = [];
    arena.onAmbientCue = (cue) => heard.push(cue.sound);
    const below = new THREE.Vector3(-20, B + EYE_HEIGHT, -66.7);
    for (let step = 0; step < 400; step++) arena.update(1, below);
    expect(new Set(heard)).toEqual(new Set(CATACOMB_AMBIENT_EVENTS.map((event) => event.sound)));
    expect(heard).toContain('water-drip');
    expect(heard).not.toContain('distant-howl');
    heard.length = 0;
    for (let step = 0; step < 400; step++) arena.update(1);
    expect(heard).not.toContain('water-drip');
    expect(heard).not.toContain('stone-settle');
  });

  it('walks on grit in the galleries, stone in the pantheon and water at the foot of the stair', () => {
    const at = (x: number, z: number): string => footstepSurfaceAt(DIE_KATHEDRALE_FOOTSTEP_SURFACES, x, z, CATACOMB_FLOOR);
    expect(at(PROBES.gallerySouth.x, PROBES.gallerySouth.z)).toBe('debris');
    expect(at(PROBES.pantheon.x, PROBES.pantheon.z)).toBe('stone');
    expect(at((CRYPT_LANDING.minX + CRYPT_LANDING.maxX) / 2 - 1.6, CRYPT_LANDING.minZ + 1.6)).toBe('water');
    // The cathedral's floor above the same spot keeps its own surface.
    expect(footstepSurfaceAt(DIE_KATHEDRALE_FOOTSTEP_SURFACES, PROBES.gallerySouth.x, PROBES.gallerySouth.z, 0)).toBe('stone');
    expect(GALLERIES.minX).toBeLessThan(PROBES.gallerySouth.x);
  });

  it('turns the shrine\'s dome to face inwards', () => {
    const arena = makeArena();
    const dome = arena.colliders.find((collider) => collider.name === 'catacomb-sanctuary-dome') as THREE.Mesh;
    expect(dome).toBeDefined();
    const position = dome.geometry.getAttribute('position');
    const normal = dome.geometry.getAttribute('normal');
    let inward = 0;
    for (let index = 0; index < position.count; index++) {
      const towardAxis = (SANCTUARY.x - position.getX(index)) * normal.getX(index) + (SANCTUARY.z - position.getZ(index)) * normal.getZ(index);
      if (normal.getY(index) <= 0.01 && towardAxis >= -1e-6) inward++;
    }
    expect(inward / position.count).toBeGreaterThan(0.95);
  });

  it('wakes each catacomb zone with its first gate and closes everything again on reset', () => {
    const arena = makeArena();
    for (const door of TO_CRYPT) openDoor(arena, door);
    expect(arena.spawnPoints).toEqual(expect.arrayContaining([...DIE_KATHEDRALE_SPAWNS.galleries]));
    expect(arena.spawnPoints).not.toEqual(expect.arrayContaining([...DIE_KATHEDRALE_SPAWNS.pantheon]));
    openDoor(arena, 'pantheon-gate');
    expect(arena.spawnPoints).toEqual(expect.arrayContaining([...DIE_KATHEDRALE_SPAWNS.pantheon]));
    expect(CATACOMB_ZONES.every((zone) => DIE_KATHEDRALE_SPAWNS[zone].length > 0)).toBe(true);
    arena.reset();
    for (const door of arena.doors) expect(door.isLocked, door.id).toBe(true);
    expect(arena.spawnPoints.every((spawn) => (spawn as ZombieSpawnPoint).floor === undefined)).toBe(true);
  });
});
