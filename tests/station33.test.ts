import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceProfile, QualityLevel } from '../src/core/DeviceProfile';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { mysteryBoxFootprint } from '../src/zombies/MysteryBoxFootprint';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  CONSIGNA,
  ESCALATOR_PORTAL,
  SERVICE_PASSAGE,
  STATION33_BARRIERS,
  STATION33_DOORS,
  STATION33_PLAYER_BOUNDS,
  STATION33_PLAYER_SPAWN,
  STATION33_POINT_LIGHTS,
  STATION33_SPAWNS,
  STATION33_WALL_BUYS,
  STATION33_WALL_THICKNESS,
  TURNSTILE_LINE,
  VESTIBULE,
  type Station33Barrier,
  type Station33ZoneId,
} from '../src/zombies/maps/Station33Config';
import { circuitLevel } from '../src/zombies/maps/station33/Station33Lighting';
import type { ArenaAmbientCue, ZombieArena } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;
const ZOMBIE_BAND = { bottom: 0.05, top: 1.8 } as const;
const ROOMS = [VESTIBULE, CONSIGNA.corridor, CONSIGNA.hall] as const;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(profile: DeviceProfile = TEST_PROFILE): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), profile);
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

/** Ballistic/zombie solids only (the player list also holds the Mystery Box footprint). */
function structureBoxes(arena: ZombieArena): THREE.Box3[] {
  arena.group.updateMatrixWorld(true);
  return arena.colliders
    .map((object) => new THREE.Box3().setFromObject(object))
    .filter((box) => box.max.y > ZOMBIE_BAND.bottom && box.min.y < ZOMBIE_BAND.top);
}

function bodyBox(x: number, z: number, radius: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(x - radius, ZOMBIE_BAND.bottom, z - radius),
    new THREE.Vector3(x + radius, ZOMBIE_BAND.top, z + radius),
  );
}

/** Footprint of an entrance's dead-end service passage, walls included. */
function passageBox(barrier: Station33Barrier): THREE.Box3 {
  const halfWidth = SERVICE_PASSAGE.width[barrier.kind] / 2 + STATION33_WALL_THICKNESS;
  const near = STATION33_WALL_THICKNESS / 2;
  const far = near + SERVICE_PASSAGE.length + STATION33_WALL_THICKNESS;
  const a = new THREE.Vector3(barrier.x + barrier.outwardX * near, 0, barrier.z + barrier.outwardZ * near);
  const b = new THREE.Vector3(barrier.x + barrier.outwardX * far, 3, barrier.z + barrier.outwardZ * far);
  const box = new THREE.Box3().setFromPoints([a, b]);
  if (barrier.outwardX !== 0) box.expandByVector(new THREE.Vector3(0, 0, halfWidth));
  else box.expandByVector(new THREE.Vector3(halfWidth, 0, 0));
  return box;
}

function insideRoom(x: number, z: number): boolean {
  return ROOMS.some((room) => x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ);
}

function openBarrier(arena: Station33Arena, id: string): void {
  const barrier = arena.barriers.find((candidate) => candidate.id === id)!;
  while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
}

function openDoorTo(arena: ZombieArena, zone: Station33ZoneId): void {
  const config = STATION33_DOORS.find((door) => door.zone === zone)!;
  const door = arena.doors.find((candidate) => candidate.id === config.id)!;
  expect(door.tryUnlock(() => true).success).toBe(true);
  expect(arena.activateDoor(door.id)).toBe(true);
}

/** Runs one zombie from `spawn` at a stationary player until it lands a hit. */
function chaseUntilHit(arena: Station33Arena, spawn: ZombieSpawnPoint, playerX: number, playerZ: number, seconds: number): { hit: boolean; path: THREE.Vector3[] } {
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
  recoil: { pitch: 0, yaw: 0 },
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

const FACE_EAST = -Math.PI / 2;

describe('Station 33 layout', () => {
  it('initializes and restarts single-player with the luggage-office Mystery Box', () => {
    const { ctx } = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(ctx);
    const state = mode as unknown as { box: unknown; boxView: unknown };
    expect(state.box).not.toBeNull();
    expect(state.boxView).not.toBeNull();
    mode.onInteract();
    mode.onRestartRequested();
    expect(state.box).not.toBeNull();
  });

  it('starts with the vestibule alone: the luggage-office door locked and its entrances dormant', () => {
    const arena: ZombieArena = makeArena();
    expect(arena.doors.map((door) => [door.id, door.cost, door.isLocked])).toEqual([['to-consigna', 750, true]]);
    expect(arena.activateDoor('escalator')).toBe(false);
    expect(arena.completionInteraction).toBeUndefined();
    expect(arena.soulLampInteractions).toBeUndefined();
    const vestibule = STATION33_BARRIERS.filter((barrier) => barrier.zone === 'vestibule');
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(vestibule.map((barrier) => barrier.id));
    expect(arena.spawnPoints).toEqual(STATION33_SPAWNS.vestibule);
  });

  it('spawns the player clear of every solid', () => {
    const arena = makeArena();
    const player = bodyBox(STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.z, 0.35);
    for (const box of solidBoxes(arena)) expect(box.intersectsBox(player)).toBe(false);
  });

  it('places every zombie spawn outside both rooms, clear of colliders, behind its own entrance', () => {
    const arena = makeArena();
    openDoorTo(arena, 'consigna');
    const solids = solidBoxes(arena);
    for (const spawn of Object.values(STATION33_SPAWNS).flat()) {
      expect(insideRoom(spawn.x, spawn.z), `spawn ${spawn.barrierId}`).toBe(false);
      const body = bodyBox(spawn.x, spawn.z, 0.45);
      for (const box of solids) expect(box.intersectsBox(body), `spawn ${spawn.barrierId}`).toBe(false);
      const barrier = STATION33_BARRIERS.find((candidate) => candidate.id === spawn.barrierId)!;
      const side = (x: number, z: number): number => (x - barrier.x) * barrier.outwardX + (z - barrier.z) * barrier.outwardZ;
      expect(side(spawn.approachX!, spawn.approachZ!)).toBeGreaterThan(0.4);
      expect(side(spawn.breachX!, spawn.breachZ!)).toBeLessThan(-0.4);
    }
  });

  it('keeps the luggage office off every spawn passage and clear of z < 0', () => {
    const passages = STATION33_BARRIERS.map(passageBox);
    for (let index = 0; index < passages.length; index++) {
      for (let other = index + 1; other < passages.length; other++) expect(passages[index].intersectsBox(passages[other])).toBe(false);
    }
    for (const room of [CONSIGNA.corridor, CONSIGNA.hall]) {
      expect(room.minZ).toBeGreaterThanOrEqual(0);
      const walls = new THREE.Box3(
        new THREE.Vector3(room.minX - STATION33_WALL_THICKNESS, 0, room.minZ - STATION33_WALL_THICKNESS),
        new THREE.Vector3(room.maxX + STATION33_WALL_THICKNESS, 3, room.maxZ + STATION33_WALL_THICKNESS),
      );
      // Each office entrance passage starts at its own wall; every other passage stays clear.
      for (const [index, barrier] of STATION33_BARRIERS.entries()) {
        if (barrier.zone === 'consigna') continue;
        const shrunk = walls.clone().expandByScalar(-0.01);
        expect(shrunk.intersectsBox(passages[index]), `${barrier.id} vs office`).toBe(false);
      }
    }
  });

  it.each(STATION33_BARRIERS.map((barrier) => [barrier.id, barrier.zone] as const))('gives the %s entrance (%s) a walkable route to the player spawn', (id, zone) => {
    const arena = makeArena();
    if (zone !== 'vestibule') openDoorTo(arena, zone);
    openBarrier(arena, id);
    const spawn = arena.spawnPoints.find((point) => (point as ZombieSpawnPoint).barrierId === id) as ZombieSpawnPoint;
    const { hit } = chaseUntilHit(arena, spawn, STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.z, 60);
    expect(hit).toBe(true);
  });

  it('lets the horde through the turnstile line to reach the escalator end', () => {
    const arena = makeArena();
    openBarrier(arena, 'surface-stairs');
    const spawn = arena.spawnPoints.find((point) => (point as ZombieSpawnPoint).barrierId === 'surface-stairs') as ZombieSpawnPoint;
    const { hit, path } = chaseUntilHit(arena, spawn, 0, 1.6, 50);
    expect(hit).toBe(true);
    expect(path.some((point) => point.z < TURNSTILE_LINE.z - 1)).toBe(true);
  });

  it('seals the escalator portal for the player', () => {
    const arena = makeArena();
    const gate = arena.wallColliders.find((box) =>
      box.min.x <= ESCALATOR_PORTAL.centerX - ESCALATOR_PORTAL.width / 2 + 0.01 &&
      box.max.x >= ESCALATOR_PORTAL.centerX + ESCALATOR_PORTAL.width / 2 - 0.01 &&
      box.max.y >= ESCALATOR_PORTAL.height - 0.01 &&
      box.max.z >= VESTIBULE.minZ - 0.01);
    expect(gate).toBeDefined();
    const end = walk(arena, 0, 2.5, 0, 3);
    expect(end.z).toBeGreaterThan(VESTIBULE.minZ + 0.3);
  });

  it('hangs every wall buy 2 cm off a wall, within reach, at the configured prices', () => {
    const arena = makeArena();
    openDoorTo(arena, 'consigna');
    expect(arena.wallBuys.map((wallBuy) => [wallBuy.weaponId, wallBuy.price, wallBuy.ammoPrice])).toEqual([['ak47', 1750, 900], ['mp5', 1000, 500], ['vector', 900, 625]]);
    const vectors = arena.wallBuys.filter((wallBuy) => wallBuy.weaponId === 'vector');
    expect(vectors).toHaveLength(1);
    expect(vectors[0].position.x).toBeGreaterThan(VESTIBULE.minX);
    expect(vectors[0].position.x).toBeLessThan(VESTIBULE.maxX);
    expect(vectors[0].position.z).toBeGreaterThan(VESTIBULE.minZ);
    expect(vectors[0].position.z).toBeLessThan(VESTIBULE.maxZ);
    const inside = (point: THREE.Vector3): boolean => arena.wallColliders.some((box) => box.containsPoint(point));
    for (const wallBuy of STATION33_WALL_BUYS) {
      const facing = new THREE.Vector3(Math.sin(wallBuy.yaw), 0, Math.cos(wallBuy.yaw));
      const position = new THREE.Vector3(wallBuy.position.x, wallBuy.position.y, wallBuy.position.z);
      expect(inside(position.clone().addScaledVector(facing, -0.03)), wallBuy.id).toBe(true);
      expect(inside(position.clone().addScaledVector(facing, -0.01)), wallBuy.id).toBe(false);
      const stand = position.clone().addScaledVector(facing, 0.7);
      expect(insideRoom(stand.x, stand.z), wallBuy.id).toBe(true);
      expect(solidBoxes(arena).some((box) => box.intersectsBox(bodyBox(stand.x, stand.z, 0.3))), wallBuy.id).toBe(false);
    }
  });

  it('leaves the vestibule clear where the old crate stood, before and after a reset', () => {
    const arena: ZombieArena = makeArena();
    const formerBox = bodyBox(4.9, 0.95, 0.35);
    for (const reset of [false, true]) {
      if (reset) arena.reset();
      for (const box of solidBoxes(arena)) expect(box.intersectsBox(formerBox)).toBe(false);
    }
  });
});

describe('Station 33 luggage office', () => {
  it('gives the corridor room for the horde and the player to pass each other', () => {
    expect(CONSIGNA.corridor.maxZ - CONSIGNA.corridor.minZ).toBeGreaterThanOrEqual(5.5);
    const door = STATION33_DOORS.find((candidate) => candidate.zone === 'consigna')!;
    expect(door.z - 0.8).toBeGreaterThan(CONSIGNA.corridor.minZ);
    expect(door.z + 0.8).toBeLessThan(CONSIGNA.corridor.maxZ);
  });

  it('stays unreachable and silent until its door is bought', () => {
    const arena = makeArena();
    expect(walk(arena, 6.2, 8.8, FACE_EAST, 3).x).toBeLessThan(VESTIBULE.maxX);
    expect(arena.spawnPoints.some((point) => (point as ZombieSpawnPoint).barrierId?.startsWith('consigna'))).toBe(false);

    let topologyChanges = 0;
    arena.onTopologyChanged = () => topologyChanges++;
    openDoorTo(arena, 'consigna');
    expect(topologyChanges).toBe(1);
    expect(arena.activateDoor('to-consigna')).toBe(false);
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(STATION33_BARRIERS.map((barrier) => barrier.id));
    expect(arena.spawnPoints).toEqual([...STATION33_SPAWNS.vestibule, ...STATION33_SPAWNS.consigna]);
    expect(walk(arena, 6.2, 8.8, FACE_EAST, 3).x).toBeGreaterThan(CONSIGNA.corridor.minX + 1);
    // Down the corridor and into the hall, never past its far wall.
    expect(walk(arena, 8, 10, FACE_EAST, 8).x).toBeLessThan(CONSIGNA.hall.maxX);
  });

  it('closes its door and puts the office back to sleep on reset', () => {
    const arena = makeArena();
    const baseline = { colliders: arena.colliders.length, walls: arena.wallColliders.length };
    openDoorTo(arena, 'consigna');
    expect(arena.colliders.length).toBe(baseline.colliders - 1);
    arena.update(2);
    arena.reset();
    expect(arena.doors.every((door) => door.isLocked)).toBe(true);
    expect(arena.colliders).toHaveLength(baseline.colliders);
    expect(arena.wallColliders).toHaveLength(baseline.walls);
    expect(arena.spawnPoints).toEqual(STATION33_SPAWNS.vestibule);
    expect(walk(arena, 6.2, 8.8, FACE_EAST, 3).x).toBeLessThan(VESTIBULE.maxX);
  });

  it('puts the crate and the ring locker in the hall, clear of solids, passages and the vestibule', () => {
    const arena = makeArena();
    openDoorTo(arena, 'consigna');
    const { hall } = CONSIGNA;
    const crate = mysteryBoxFootprint(arena.mysteryBoxPlacement);
    expect(crate.min.x).toBeGreaterThan(hall.minX);
    expect(crate.max.x).toBeLessThan(hall.maxX);
    expect(crate.min.z).toBeGreaterThan(hall.minZ);
    for (const box of structureBoxes(arena)) expect(box.intersectsBox(crate)).toBe(false);
    const passages = STATION33_BARRIERS.map(passageBox);
    for (const passage of passages) expect(passage.intersectsBox(crate)).toBe(false);

    const vestibuleReach = (point: { x: number; z: number }): number => Math.hypot(
      point.x - THREE.MathUtils.clamp(point.x, STATION33_PLAYER_BOUNDS.minX, VESTIBULE.maxX - 0.4),
      point.z - THREE.MathUtils.clamp(point.z, STATION33_PLAYER_BOUNDS.minZ, STATION33_PLAYER_BOUNDS.maxZ),
    );
    expect(vestibuleReach(arena.mysteryBoxPlacement.position)).toBeGreaterThan(arena.mysteryBoxPlacement.useRange + 1);
    for (const wallBuy of arena.wallBuys.filter((candidate) => candidate.position.x > VESTIBULE.maxX)) {
      expect(vestibuleReach(wallBuy.position), wallBuy.id).toBeGreaterThan(wallBuy.useRange + 1);
    }

    expect(arena.ringMachines).toHaveLength(1);
    for (const machine of arena.ringMachines) {
      expect(machine.ringId).toBe('resurrection');
      expect(insideRoom(machine.position.x, machine.position.z)).toBe(true);
      expect(vestibuleReach(machine.position)).toBeGreaterThan(machine.useRange + 1);
      for (const passage of passages) expect(passage.containsPoint(new THREE.Vector3(machine.position.x, 1, machine.position.z))).toBe(false);
      // The player can stand in front of it, within reach.
      const stand = { x: machine.position.x - 0.6, z: machine.position.z };
      expect(solidBoxes(arena).some((box) => box.intersectsBox(bodyBox(stand.x, stand.z, 0.3)))).toBe(false);
      expect(Math.hypot(stand.x - machine.position.x, stand.z - machine.position.z)).toBeLessThan(machine.useRange);
    }
  });

  it('shows the ring for sale, hides it once bought, and restocks on reset', () => {
    const arena = makeArena();
    const [machine] = arena.ringMachines;
    const ring = arena.group.getObjectByName('locker-ring')!;
    expect(ring.visible).toBe(true);
    machine.setDisplay('empty');
    expect(ring.visible).toBe(false);
    machine.setDisplay('recharge');
    arena.update(0.5);
    expect(ring.visible).toBe(false);
    arena.reset();
    expect(ring.visible).toBe(true);
  });
});

describe('Station 33 lights and ambience', () => {
  it.each(['low', 'medium', 'high'] as const)('keeps a fixed %s-quality point-light budget through flicker, blackouts and both rooms', (quality: QualityLevel) => {
    const arena = makeArena({ ...TEST_PROFILE, quality });
    const visibleLights = (): number => {
      let count = 0;
      arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible) count++; });
      return count;
    };
    expect(arena.pointLightCount).toBe(POINT_LIGHT_BUDGET[quality]);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
    const observers = [new THREE.Vector3(0, 1.7, 15), new THREE.Vector3(17.5, 1.7, 12), new THREE.Vector3(10, 1.7, 10)];
    for (let step = 0; step < 600; step++) arena.update(0.5, observers[step % observers.length]);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
  });

  it.each(['low', 'medium', 'high'] as const)('lights the vestibule from the spawn exactly as phase 1 did (%s)', (quality: QualityLevel) => {
    const arena = makeArena({ ...TEST_PROFILE, quality });
    const visible: string[] = [];
    arena.group.traverse((object) => {
      if (object instanceof THREE.PointLight && object.visible) visible.push(`${object.position.x},${object.position.z}`);
    });
    const phaseOne = STATION33_POINT_LIGHTS.slice(0, POINT_LIGHT_BUDGET[quality]).map((light) => `${light.x},${light.z}`);
    expect(visible.sort()).toEqual(phaseOne.sort());
  });

  it('hands the real lights to the luggage office once the player is inside', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'high' });
    arena.update(0, new THREE.Vector3(17.5, 1.7, 12));
    const officeLights: THREE.PointLight[] = [];
    arena.group.traverse((object) => {
      if (object instanceof THREE.PointLight && object.visible && object.position.x > VESTIBULE.maxX) officeLights.push(object);
    });
    expect(officeLights.length).toBeGreaterThanOrEqual(2);
  });

  it('switches rooms only once the player is clearly past the door, and back to the vestibule on reset', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    const officeLit = (): boolean => {
      let lit = false;
      arena.group.traverse((object) => { lit ||= object instanceof THREE.PointLight && object.visible && object.position.x > VESTIBULE.maxX; });
      return lit;
    };
    const at = (x: number): void => arena.update(0, new THREE.Vector3(x, 1.7, 8.8));
    at(7.4);
    expect(officeLit()).toBe(false);
    at(8);
    expect(officeLit()).toBe(true);
    at(6.8);
    expect(officeLit()).toBe(true);
    at(6.2);
    expect(officeLit()).toBe(false);
    at(12);
    arena.reset();
    expect(officeLit()).toBe(false);
  });

  it('desynchronises the flicker of every circuit and keeps it in range', () => {
    const circuits = ['steady', 'unstable', 'failing', 'amber', 'emergency'] as const;
    const samples = circuits.map((circuit) => Array.from({ length: 400 }, (_, index) => circuitLevel(circuit, index * 0.05, 1.3)));
    for (const values of samples) {
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    const faultyWindows = (values: number[]): number => values.filter((value) => value < 0.9).length;
    expect(faultyWindows(samples[2])).toBeGreaterThan(faultyWindows(samples[0]));
    expect(samples[0].join()).not.toBe(Array.from({ length: 400 }, (_, index) => circuitLevel('steady', index * 0.05, 4.2)).join());
  });

  it('emits positioned ambient cues and blacks the fluorescents out on a power dip', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'high' });
    const fluorescents: THREE.PointLight[] = [];
    arena.group.traverse((object) => {
      if (object instanceof THREE.PointLight && object.color.getHex() !== 0xff2a12 && object.distance >= 12) fluorescents.push(object);
    });
    const cues: ArenaAmbientCue[] = [];
    let dimmedOnDip = false;
    arena.onAmbientCue = (cue) => cues.push(cue);
    // 200 s covers the first window of every event (initial delay + spread).
    for (let step = 0; step < 800; step++) {
      const before = cues.length;
      arena.update(0.25);
      if (cues.length > before && cues[cues.length - 1].sound === 'power-dip') {
        dimmedOnDip ||= fluorescents.every((light) => light.intensity < 1);
      }
    }
    expect(dimmedOnDip).toBe(true);
    expect(new Set(cues.map((cue) => cue.sound))).toEqual(new Set(['pa-crackle', 'distant-train', 'power-dip']));
    for (const cue of cues) expect(Number.isFinite(cue.position.x + cue.position.y + cue.position.z)).toBe(true);
  });

  it('applies its own underground mood to the scene', () => {
    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.45;
    const arena = new Station33Arena(scene, { ...TEST_PROFILE, useReducedEffects: false });
    arena.init();
    expect((scene.fog as THREE.FogExp2).density).toBe(arena.ambience.fog.density);
    expect(scene.environmentIntensity).toBe(arena.ambience.environmentIntensity?.intensity);
    expect(arena.ambience.musicTrack).toBe('station33_theme');
  });
});

describe('Station 33 reset', () => {
  it('restores boards, lights, spawns and scheduling without leaving anything behind', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const childCount = (): number => {
      let count = 0;
      arena.group.traverse(() => { count++; });
      return count;
    };
    const baseline = {
      children: childCount(),
      colliders: arena.colliders.length,
      wallColliders: arena.wallColliders.map((box) => box.clone()),
      spawns: arena.spawnPoints,
      intensities: [] as number[],
    };
    arena.update(0);
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight) baseline.intensities.push(object.intensity); });

    openDoorTo(arena, 'consigna');
    for (const barrier of arena.barriers) {
      while (!barrier.isOpen) barrier.damage(100);
    }
    const cues: string[] = [];
    arena.onAmbientCue = (cue) => cues.push(cue.sound);
    for (let step = 0; step < 900; step++) arena.update(0.25);
    expect(cues.length).toBeGreaterThan(0);

    arena.reset();
    expect(childCount()).toBe(baseline.children);
    expect(arena.colliders).toHaveLength(baseline.colliders);
    expect(arena.wallColliders.every((box, index) => box.equals(baseline.wallColliders[index]))).toBe(true);
    expect(arena.spawnPoints).toEqual(baseline.spawns);
    for (const barrier of arena.barriers) expect(barrier.intactCount).toBe(barrier.boards.length);
    const intensities: number[] = [];
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight) intensities.push(object.intensity); });
    expect(intensities).toEqual(baseline.intensities);
    // Ambient events wait their initial delay again after a restart.
    cues.length = 0;
    arena.update(5);
    expect(cues).toHaveLength(0);
  });
});
