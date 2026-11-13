import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QUALITY_LEVELS, type DeviceProfile, type QualityLevel } from '../src/core/DeviceProfile';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { mysteryBoxFootprint } from '../src/zombies/MysteryBoxFootprint';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { ZombieNavigationService } from '../src/zombies/navigation/ZombieNavigationService';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { t } from '../src/i18n/i18n';
import { actionKey, doorPrompt } from '../src/ui/InteractionPrompts';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { CodeLockDialog } from '../src/ui/CodeLockDialog';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  COCHERAS,
  CONSIGNA,
  COCHERAS_TRACKS,
  COCHERAS_TRAIN_CARS,
  ESCALATOR_PORTAL,
  KOVKA,
  KOVKA_CORE_COLOR,
  KOVKA_CORRIDOR,
  KOVKA_REACTOR,
  KOVKA_UPGRADE_MACHINE,
  KOVKA_UPGRADE_SITE,
  KOVKA_WEAPON_FINISH,
  KOVKA_FORGE_CUE,
  STATION33_WEAPONS,
  MILICIA,
  PROTOCOL33_SURFACE_Y,
  SERVICE_PASSAGE,
  STATION33_BARRIERS,
  STATION33_DOORS,
  STATION33_PLAYER_BOUNDS,
  STATION33_PLAYER_SPAWN,
  STATION33_POINT_LIGHTS,
  STATION33_RING_LOCKERS,
  STATION33_SPAWNS,
  STATION33_WALL_BUYS,
  STATION33_WALL_THICKNESS,
  STATION33_WEAPON_CHEST,
  SUBESTACION,
  TALLER,
  POWER_LEVER,
  TRAIN_CAR,
  TURNSTILE_LINE,
  VESTIBULE,
  station33ZoneAt,
  type Station33Barrier,
  type Station33ZoneId,
} from '../src/zombies/maps/Station33Config';
import { circuitLevel } from '../src/zombies/maps/station33/Station33Lighting';
import { KOVKA_VAULT } from '../src/zombies/maps/station33/VaultProfile';
import type { ArenaAmbientCue, ZombieArena } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

vi.mock('../src/ui/CodeLockDialog', () => ({
  CodeLockDialog: vi.fn(function () { return { dispose: vi.fn() }; }),
}));

const DT = 1 / 60;
const ZOMBIE_BAND = { bottom: 0.05, top: 1.8 } as const;
const ROOMS = [VESTIBULE, CONSIGNA.corridor, CONSIGNA.hall, COCHERAS.hall, SUBESTACION.gallery, SUBESTACION.hall, MILICIA.hall, TALLER.hall, KOVKA.hall] as const;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(profile: DeviceProfile = TEST_PROFILE): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), profile);
  arena.init();
  return arena;
}

describe('Station 33 combination chest', () => {
  it('requires the exact code, reveals its weapon, grants once, and relocks on restart', () => {
    const arena = makeArena();
    const [chest] = arena.weaponPickups;
    const model = arena.group.getObjectByName(`code-chest:${chest.id}`)!;
    const weapon = model.getObjectByName('chest-weapon')!;
    expect(chest.codeLock.locked).toBe(true);
    expect(weapon.visible).toBe(false);
    expect(chest.claim()).toBe(false);
    for (const code of ['', '0000', '199', '19980', ' 1998']) expect(chest.codeLock.unlock(code)).toBe(false);
    expect(chest.codeLock.unlock('1998')).toBe(true);
    expect(chest.codeLock.locked).toBe(false);
    expect(weapon.visible).toBe(true);
    arena.update(1);
    expect(model.getObjectByName('chest-lid')!.rotation.x).toBeLessThan(-1);
    expect(chest.claim()).toBe(true);
    expect(chest.available).toBe(false);
    expect(weapon.visible).toBe(false);
    expect(chest.claim()).toBe(false);
    expect(chest.codeLock.unlock('1998')).toBe(false);
    arena.reset();
    expect(chest.available).toBe(true);
    expect(chest.codeLock.locked).toBe(true);
    expect(weapon.visible).toBe(false);
    expect(model.getObjectByName('chest-lid')!.rotation.x).toBe(0);
  });

  it('fits inside militia with an accessible front and a solid body', () => {
    const arena = makeArena();
    openDoorTo(arena, 'milicia');
    const chest = arena.weaponPickups[0];
    expect(station33ZoneAt(chest.position.x, chest.position.z)).toBe('milicia');
    const bounds = new THREE.Box3().setFromObject(arena.group.getObjectByName(chest.id)!);
    expect(bounds.min.x).toBeGreaterThan(MILICIA.hall.minX);
    expect(bounds.max.x).toBeLessThan(MILICIA.hall.maxX);
    expect(bounds.min.z).toBeGreaterThan(MILICIA.hall.minZ);
    for (const barrier of STATION33_BARRIERS) {
      expect(bounds.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
      expect(bounds.intersectsBox(bodyBox(barrier.x, barrier.z, 0.4)), barrier.id).toBe(false);
    }
    for (const box of structureBoxes(arena).filter((box) => !box.equals(bounds))) expect(box.intersectsBox(bounds)).toBe(false);
    const stand = bodyBox(chest.position.x, chest.position.z - 0.8, 0.3);
    expect(solidBoxes(arena).some((box) => box.intersectsBox(stand))).toBe(false);
  });

  it('requires entry to militia and grants the unlocked Barrett free through the normal inventory path', () => {
    const side = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(side.ctx);
    const arena = (mode as unknown as { arena: Station33Arena }).arena;
    const chest = arena.weaponPickups[0];
    side.player.teleport(chest.position.x, EYE_HEIGHT, chest.position.z - 0.8, 0);
    side.player.face(Math.PI);
    side.player.rig.updateMatrixWorld(true);
    expect(mode.getInteractPrompt()).toBeNull();
    openDoorTo(arena, 'milicia');
    expect(mode.getInteractPrompt()).toBe(t('prompt.codeChest', { key: actionKey(false) }));
    side.ctx.input.releaseAll = vi.fn();
    mode.onInteract();
    expect(mode.isSimulationPaused()).toBe(true);
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.onPointerUnlock()).toBe(true);
    expect(side.ctx.grantWeapon).not.toHaveBeenCalled();
    const [unlock, close] = vi.mocked(CodeLockDialog).mock.calls.at(-1)!;
    expect(unlock('0000')).toBe(false);
    expect(chest.codeLock.locked).toBe(true);
    expect(unlock(STATION33_WEAPON_CHEST.code)).toBe(true);
    close();
    expect(mode.isSimulationPaused()).toBe(false);
    expect(mode.isGameplayInputEnabled()).toBe(true);
    expect(side.ctx.lockPointer).toHaveBeenCalled();
    vi.mocked(side.ctx.canGrantWeapon).mockReturnValue(true);
    vi.mocked(side.ctx.grantWeapon).mockReturnValue(true);
    expect(chest.cost).toBe(0);
    mode.onInteract();
    expect(side.ctx.grantWeapon).toHaveBeenCalledExactlyOnceWith('barrett');
    expect(chest.available).toBe(false);
    mode.onInteract();
    expect(side.ctx.grantWeapon).toHaveBeenCalledTimes(1);
    mode.onRestartRequested();
    expect(chest.codeLock.locked).toBe(true);
    expect(chest.available).toBe(true);
  });
});

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

function openDoorTo(arena: Station33Arena, zone: Station33ZoneId): void {
  const config = STATION33_DOORS.find((door) => door.zone === zone)!;
  // A sealed hatch only sells once the main switch has powered the station.
  if (config.requiresPower) arena.switchOnPower();
  const door = arena.doors.find((candidate) => candidate.id === config.id)!;
  expect(door.tryUnlock(() => true).success).toBe(true);
  expect(arena.activateDoor(door.id)).toBe(true);
}

/** Doors bought, in order, on the way from the vestibule into each zone. */
const DOORS_TO: Readonly<Record<Station33ZoneId, ReadonlyArray<Station33ZoneId>>> = {
  vestibule: [],
  consigna: ['consigna'],
  cocheras: ['cocheras'],
  subestacion: ['cocheras', 'subestacion'],
  milicia: ['milicia'],
  taller: ['cocheras', 'subestacion', 'taller'],
  kovka: ['cocheras', 'subestacion', 'kovka'],
  // Behind Protocol 33's blast door, not a paid door.
  evacuacion: ['cocheras', 'subestacion', 'taller'],
  superficie: ['cocheras', 'subestacion', 'taller'],
};

function openWayTo(arena: Station33Arena, zone: Station33ZoneId): void {
  for (const step of DOORS_TO[zone]) openDoorTo(arena, step);
}

/** Barrier ids of the given zones, in config order. */
function barrierIdsOf(...zones: Station33ZoneId[]): string[] {
  return STATION33_BARRIERS.filter((barrier) => zones.includes(barrier.zone)).map((barrier) => barrier.id);
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

/** The zombies' navigation over the arena's current solids, as the manager builds it. */
function navigationOf(arena: ZombieArena): ZombieNavigationService {
  const navigation = new ZombieNavigationService(0.35, 0.42);
  const volumes = arena.colliders.map((collider) => new THREE.Box3().setFromObject(collider))
    .map(({ min, max }) => ({ minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z }));
  navigation.rebuild(arena.navigationBounds.map((bounds) => ({ floor: bounds.floor, bounds, baseY: bounds.baseY })), volumes);
  return navigation;
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

const FACE_EAST = -Math.PI / 2;
const FACE_NORTH = 0;
const FACE_WEST = Math.PI / 2;
const FACE_SOUTH = Math.PI;

describe('Station 33 layout', () => {

  it('offers reusable solid ammunition in the starting vestibule and resets feedback', () => {
    const arena = makeArena();
    expect(arena.ammoRefills).toHaveLength(1);
    const refill = arena.ammoRefills[0];
    expect(refill.cost).toBe(800);
    expect(refill.floor).toBe(0);
    expect(refill.position.x).toBeGreaterThan(VESTIBULE.minX);
    expect(refill.position.x).toBeLessThan(VESTIBULE.maxX);
    expect(solidBoxes(arena).some((box) => box.intersectsBox(bodyBox(refill.position.x, refill.position.z - 1, 0.3)))).toBe(false);
    expect(arena.wallColliders.some((box) => box.containsPoint(new THREE.Vector3(refill.position.x, 0.3, refill.position.z)))).toBe(true);
    const view = arena.group.getObjectByName(refill.id)!;
    refill.activate();
    arena.update(0.1);
    expect(view.userData.activeFeedback).toBe(true);
    arena.update(0.5);
    expect(view.userData.activeFeedback).toBe(false);
    refill.activate();
    arena.reset();
    expect(view.userData.activeFeedback).toBe(false);
  });

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

  it('starts with the vestibule alone: both doors locked and the other entrances dormant', () => {
    const arena: ZombieArena = makeArena();
    expect(arena.doors.map((door) => [door.id, door.cost, door.isLocked])).toEqual([
      ['to-consigna', 750, true], ['to-cocheras', 1250, true], ['to-subestacion', 1500, true], ['to-milicia', 3000, true],
      ['to-taller', 2000, true], ['to-kovka', 3500, true],
    ]);
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

  it('places every zombie spawn outside every room, clear of colliders, behind its own entrance', () => {
    const arena = makeArena();
    openDoorTo(arena, 'consigna');
    openDoorTo(arena, 'cocheras');
    openDoorTo(arena, 'milicia');
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
    openWayTo(arena, zone);
    openBarrier(arena, id);
    const spawn = arena.spawnPoints.find((point) => (point as ZombieSpawnPoint).barrierId === id) as ZombieSpawnPoint;
    const { hit } = chaseUntilHit(arena, spawn, STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.z, 120);
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
    openDoorTo(arena, 'cocheras');
    expect(arena.wallBuys.map((wallBuy) => [wallBuy.weaponId, wallBuy.price, wallBuy.ammoPrice])).toEqual([
      ['ppsh41', 1250, 625], ['m14', 800, 625], ['m60', 2500, 1250], ['ak47', 1750, 900], ['m40', 2000, 1000],
    ]);
    const startingBuys = arena.wallBuys.filter((wallBuy) => wallBuy.weaponId === 'm14');
    expect(startingBuys).toHaveLength(1);
    expect(arena.wallBuys.some((wallBuy) => wallBuy.weaponId === 'vector')).toBe(false);
    expect(startingBuys[0].position.x).toBeGreaterThan(VESTIBULE.minX);
    expect(startingBuys[0].position.x).toBeLessThan(VESTIBULE.maxX);
    expect(startingBuys[0].position.z).toBeGreaterThan(VESTIBULE.minZ);
    expect(startingBuys[0].position.z).toBeLessThan(VESTIBULE.maxZ);
    arena.group.updateMatrixWorld(true);
    const startingView = arena.group.getObjectByName(`wall-buy:${startingBuys[0].id}`)!;
    const startingBounds = new THREE.Box3().setFromObject(startingView);
    for (const other of arena.wallBuys.filter((wallBuy) => wallBuy.weaponId !== 'm14')) {
      const otherView = arena.group.getObjectByName(`wall-buy:${other.id}`)!;
      expect(startingBounds.intersectsBox(new THREE.Box3().setFromObject(otherView))).toBe(false);
    }
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
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(
      barrierIdsOf('vestibule', 'consigna'),
    );
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
      point.x - THREE.MathUtils.clamp(point.x, VESTIBULE.minX + 0.4, VESTIBULE.maxX - 0.4),
      point.z - THREE.MathUtils.clamp(point.z, VESTIBULE.minZ + 0.4, STATION33_PLAYER_BOUNDS.maxZ),
    );
    expect(vestibuleReach(arena.mysteryBoxPlacement.position)).toBeGreaterThan(arena.mysteryBoxPlacement.useRange + 1);
    for (const wallBuy of arena.wallBuys.filter((candidate) => candidate.position.x > VESTIBULE.maxX)) {
      expect(vestibuleReach(wallBuy.position), wallBuy.id).toBeGreaterThan(wallBuy.useRange + 1);
    }

    openDoorTo(arena, 'cocheras');
    openDoorTo(arena, 'milicia');
    expect(arena.ringMachines.map((machine) => machine.ringId)).toEqual(['resurrection', 'sleightOfHand', 'armor', 'doubleTap']);
    for (const config of STATION33_RING_LOCKERS) {
      const machine = arena.ringMachines.find((candidate) => candidate.id === config.id)!;
      expect(insideRoom(machine.position.x, machine.position.z), config.id).toBe(true);
      expect(station33ZoneAt(machine.position.x, machine.position.z), config.id).toBe(config.zone);
      expect(vestibuleReach(machine.position), config.id).toBeGreaterThan(machine.useRange + 1);
      for (const passage of passages) expect(passage.containsPoint(new THREE.Vector3(machine.position.x, 1, machine.position.z))).toBe(false);
      // The player can stand in front of it, within reach.
      const stand = { x: machine.position.x + config.facingX * 0.6, z: machine.position.z + config.facingZ * 0.6 };
      expect(solidBoxes(arena).some((box) => box.intersectsBox(bodyBox(stand.x, stand.z, 0.3))), config.id).toBe(false);
      expect(Math.hypot(stand.x - machine.position.x, stand.z - machine.position.z)).toBeLessThan(machine.useRange);
    }
  });

  it('keeps the Sleight of Hand locker dark until the power is on, and again after a reset', () => {
    const arena = makeArena();
    const [resurrection, sleight] = arena.ringMachines;
    expect(resurrection.powered).toBe(true);
    expect(sleight.powered).toBe(false);
    arena.switchOnPower();
    expect(sleight.powered).toBe(true);
    arena.reset();
    expect(sleight.powered).toBe(false);
    expect(resurrection.powered).toBe(true);
  });

  it('shows the ring for sale, hides it once bought, and restocks on reset', () => {
    const arena = makeArena();
    const [machine] = arena.ringMachines;
    const ring = arena.group.getObjectByName(`ring-locker:${machine.id}`)!.getObjectByName('locker-ring')!;
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

describe('Station 33 train sheds', () => {
  const { hall } = COCHERAS;

  it('stays walled off and silent until its service door is bought', () => {
    const arena = makeArena();
    expect(walk(arena, 5.6, 1.6, FACE_NORTH, 3).z).toBeGreaterThan(VESTIBULE.minZ);
    expect(arena.spawnPoints.some((point) => (point as ZombieSpawnPoint).barrierId?.startsWith('cocheras'))).toBe(false);

    openDoorTo(arena, 'cocheras');
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(
      barrierIdsOf('vestibule', 'cocheras'),
    );
    expect(arena.spawnPoints).toEqual([...STATION33_SPAWNS.vestibule, ...STATION33_SPAWNS.cocheras]);
    // Through the door onto the apron, up to the west track's buffer stop.
    const end = walk(arena, 5.6, 1.6, FACE_NORTH, 4);
    expect(end.z).toBeLessThan(hall.maxZ - 3);
    expect(end.z).toBeGreaterThan(COCHERAS_TRACKS.west.bufferZ);
  });

  it('keeps the trains solid and leaves open lanes on both sides of the derailed car', () => {
    const arena = makeArena();
    openDoorTo(arena, 'cocheras');
    const lead = COCHERAS_TRAIN_CARS.find((car) => car.id === 'west-lead')!;
    expect(walk(arena, 10, (lead.minZ + lead.maxZ) / 2, FACE_WEST, 4).x).toBeGreaterThan(lead.x + TRAIN_CAR.width / 2);
    // Between the trains and down the east lane, all the way to the far wall.
    for (const x of [8.6, 19.5]) {
      const end = walk(arena, x, -3, FACE_NORTH, 10);
      expect(end.z, `lane at x = ${x}`).toBeLessThan(hall.minZ + 1);
      expect(end.z, `lane at x = ${x}`).toBeGreaterThan(hall.minZ);
    }
  });

  it('seals the west tunnel with the trailer car and keeps the sheds off the escalator shaft', () => {
    const arena = makeArena();
    openDoorTo(arena, 'cocheras');
    const solids = solidBoxes(arena);
    const { x } = COCHERAS_TRACKS.west;
    const half = COCHERAS_TRACKS.portal.width / 2;
    for (let along = x - half; along <= x + half; along += 0.1) {
      const body = bodyBox(along, hall.minZ - STATION33_WALL_THICKNESS / 2, 0.35);
      expect(solids.some((box) => box.intersectsBox(body)), `portal at x = ${along.toFixed(1)}`).toBe(true);
    }
    expect(hall.minX - STATION33_WALL_THICKNESS).toBeGreaterThan(ESCALATOR_PORTAL.centerX + ESCALATOR_PORTAL.width / 2 + 0.3);
    const walls = new THREE.Box3(
      new THREE.Vector3(hall.minX - STATION33_WALL_THICKNESS, 0, hall.minZ - STATION33_WALL_THICKNESS),
      new THREE.Vector3(hall.maxX + STATION33_WALL_THICKNESS, 3, hall.maxZ),
    ).expandByScalar(-0.01);
    for (const barrier of STATION33_BARRIERS.filter((candidate) => candidate.zone !== 'cocheras')) {
      expect(walls.intersectsBox(passageBox(barrier)), `${barrier.id} vs sheds`).toBe(false);
    }
  });

  it('keeps the trains and props off the entrances it opens', () => {
    const arena = makeArena();
    openDoorTo(arena, 'cocheras');
    const solids = structureBoxes(arena);
    for (const spawn of STATION33_SPAWNS.cocheras) {
      const breach = bodyBox(spawn.breachX!, spawn.breachZ!, 0.4);
      expect(solids.some((box) => box.intersectsBox(breach)), spawn.barrierId).toBe(false);
    }
  });

  it('sells the M60 on the apron, out of reach from the other rooms', () => {
    const arena = makeArena();
    const m60 = arena.wallBuys.find((wallBuy) => wallBuy.weaponId === 'm60')!;
    expect(m60.position.z).toBeLessThan(hall.maxZ);
    expect(m60.position.x).toBeGreaterThan(hall.minX);
    expect(m60.position.x).toBeLessThan(hall.maxX);
    for (const room of [VESTIBULE, CONSIGNA.corridor, CONSIGNA.hall]) {
      const reach = Math.hypot(
        m60.position.x - THREE.MathUtils.clamp(m60.position.x, room.minX + 0.4, room.maxX - 0.4),
        m60.position.z - THREE.MathUtils.clamp(m60.position.z, room.minZ + 0.4, room.maxZ - 0.4),
      );
      expect(reach).toBeGreaterThan(m60.useRange + 1);
    }
  });
});

describe('Station 33 machine room', () => {
  const { gallery, hall } = SUBESTACION;

  it('stays walled off until its door is bought, then opens the gallery and the hall', () => {
    const arena = makeArena();
    openDoorTo(arena, 'cocheras');
    expect(walk(arena, 11, -24, FACE_NORTH, 3).z).toBeGreaterThan(COCHERAS.hall.minZ);
    expect(arena.spawnPoints.some((point) => (point as ZombieSpawnPoint).barrierId?.startsWith('subestacion'))).toBe(false);

    openDoorTo(arena, 'subestacion');
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(barrierIdsOf('vestibule', 'cocheras', 'subestacion'));
    expect(arena.spawnPoints).toEqual([...STATION33_SPAWNS.vestibule, ...STATION33_SPAWNS.cocheras, ...STATION33_SPAWNS.subestacion]);
    // Down the gallery and the aisle, up to the main switch.
    const end = walk(arena, 11, -24, FACE_NORTH, 12);
    expect(end.z).toBeLessThan(hall.minZ + 1.2);
    expect(Math.hypot(end.x - arena.powerSwitch.position.x, end.z - arena.powerSwitch.position.z)).toBeLessThan(arena.powerSwitch.useRange);
  });

  it('fits its gallery between the dead tunnel and the blast-gate passage, clear of every other passage', () => {
    const blastGate = STATION33_BARRIERS.find((barrier) => barrier.id === 'cocheras-blast-gate')!;
    const tunnelEast = COCHERAS_TRACKS.west.x + COCHERAS_TRACKS.portal.width / 2 + STATION33_WALL_THICKNESS;
    expect(gallery.minX - STATION33_WALL_THICKNESS).toBeGreaterThan(tunnelEast);
    expect(gallery.maxX + STATION33_WALL_THICKNESS).toBeLessThan(passageBox(blastGate).min.x);
    for (const room of [gallery, hall]) {
      const walls = new THREE.Box3(
        new THREE.Vector3(room.minX - STATION33_WALL_THICKNESS, 0, room.minZ - STATION33_WALL_THICKNESS),
        new THREE.Vector3(room.maxX + STATION33_WALL_THICKNESS, 3, room.maxZ),
      ).expandByScalar(-0.01);
      for (const barrier of STATION33_BARRIERS.filter((candidate) => candidate.zone !== 'subestacion')) {
        expect(walls.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
      }
    }
    expect(hall.minX - STATION33_WALL_THICKNESS).toBeGreaterThan(ESCALATOR_PORTAL.centerX + ESCALATOR_PORTAL.width / 2 + 0.3);
  });

  it('stops the player at every walk-through gate once its boards are gone', () => {
    const arena = makeArena();
    openWayTo(arena, 'subestacion');
    for (const barrier of arena.barriers) {
      while (!barrier.isOpen) barrier.damage(100);
    }
    const blastGate = STATION33_BARRIERS.find((barrier) => barrier.id === 'cocheras-blast-gate')!;
    expect(walk(arena, blastGate.x, COCHERAS.hall.minZ + 2, FACE_NORTH, 3).z).toBeGreaterThan(COCHERAS.hall.minZ);
    const tunnel = STATION33_BARRIERS.find((barrier) => barrier.id === 'subestacion-cable-tunnel')!;
    expect(walk(arena, tunnel.x, hall.minZ + 1.6, FACE_NORTH, 3).z).toBeGreaterThan(hall.minZ);
  });

  it('tiles its own floor, at the vestibule granite\'s texel density', () => {
    const arena = makeArena();
    const floorMaterial = (name: string): THREE.MeshStandardMaterial => (arena.group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const texelsPerMetre = (material: THREE.MeshStandardMaterial): number => material.map!.image.width / (material.userData.metersPerTile as number);
    for (const name of ['subestacion-gallery-floor', 'subestacion-hall-floor']) {
      expect(floorMaterial(name).name).toBe('station33_machine_room_floor');
      expect(texelsPerMetre(floorMaterial(name))).toBeCloseTo(texelsPerMetre(floorMaterial('vestibule-floor')));
    }
  });

  it('keeps the mimic diagram\'s feeder lamps dark until the mains come back', () => {
    const arena = makeArena();
    const lamp = (): number => {
      let brightness = -1;
      arena.group.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (material?.name === 'station33_mimic_live') brightness = material.color.r + material.color.g + material.color.b;
      });
      return brightness;
    };
    arena.update(1, new THREE.Vector3(11, 1.7, -40));
    expect(lamp()).toBe(0);
    arena.switchOnPower();
    for (let step = 0; step < 20; step++) arena.update(0.5, new THREE.Vector3(11, 1.7, -40));
    expect(lamp()).toBeGreaterThan(0.2);
  });
});

describe('Station 33 maintenance workshop', () => {
  it('routes the horde from every window of the open station to the deepest ring lockers', () => {
    const arena = makeArena();
    for (const zone of ['consigna', 'milicia', 'cocheras', 'subestacion', 'taller', 'kovka'] as const) openDoorTo(arena, zone);
    const navigation = navigationOf(arena);
    for (const locker of STATION33_RING_LOCKERS.filter((candidate) => candidate.zone === 'consigna' || candidate.zone === 'taller')) {
      const front = { x: locker.x + locker.facingX * 1.2, z: locker.z + locker.facingZ * 1.2 };
      for (const spawn of arena.spawnPoints as ReadonlyArray<ZombieSpawnPoint>) {
        const from = { x: spawn.breachX ?? spawn.x, z: spawn.breachZ ?? spawn.z };
        if (!navigation.contains(0, from.x, from.z)) continue;
        expect(navigation.findPath(0, from.x, from.z, front.x, front.z), `${spawn.barrierId} -> ${locker.id}`).not.toBeNull();
      }
    }
  });

  it('opens from the electricity room, activates its own entrance and closes again on reset', () => {
    const arena = makeArena();
    openWayTo(arena, 'subestacion');
    const door = STATION33_DOORS.find((candidate) => candidate.zone === 'taller')!;
    const approachZ = SUBESTACION.hall.minZ + 1.8;
    expect(walk(arena, door.x, approachZ, FACE_NORTH, 2).z).toBeGreaterThan(door.z);
    expect(arena.spawnPoints.some((point) => (point as ZombieSpawnPoint).barrierId === 'taller-service-door')).toBe(false);
    openDoorTo(arena, 'taller');
    expect(walk(arena, door.x, approachZ, FACE_NORTH, 2).z).toBeLessThan(TALLER.hall.maxZ - 1);
    expect(arena.spawnPoints).toContain(STATION33_SPAWNS.taller[0]);
    const gate = STATION33_BARRIERS.find((candidate) => candidate.zone === 'taller')!;
    expect(walk(arena, gate.x, TALLER.hall.minZ + 1.8, FACE_NORTH, 2).z).toBeGreaterThan(TALLER.hall.minZ);
    arena.reset();
    expect(arena.doors.find((candidate) => candidate.id === door.id)!.isLocked).toBe(true);
    expect(arena.spawnPoints).toEqual(STATION33_SPAWNS.vestibule);
  });

  it('has yellow walls, stays clear of other spawn passages and gives its lights priority inside', () => {
    const arena = makeArena();
    const room = new THREE.Box3(
      new THREE.Vector3(TALLER.hall.minX, 0, TALLER.hall.minZ),
      new THREE.Vector3(TALLER.hall.maxX, TALLER.ceilingHeight, TALLER.hall.maxZ),
    );
    for (const barrier of STATION33_BARRIERS.filter((candidate) => candidate.zone !== 'taller')) {
      expect(room.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
    }
    let yellowWalls = 0;
    arena.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      yellowWalls += materials.filter((material) => material.name === 'station33-workshop-yellow').length;
    });
    expect(yellowWalls).toBeGreaterThan(0);
    arena.switchOnPower();
    arena.update(3, new THREE.Vector3(9.4, EYE_HEIGHT, -50.6));
    const light = arena.group.children.find((object) => object instanceof THREE.PointLight && object.position.x === 9.4 && object.position.z === -50.6) as THREE.PointLight;
    expect(light.visible).toBe(true);
    expect(light.color.getHex()).toBe(TALLER.lightColor);
    expect(arena.pointLightCount).toBe(POINT_LIGHT_BUDGET[TEST_PROFILE.quality]);
  });

  it('lets the horde follow the player from electricity into the workshop', () => {
    const arena = makeArena();
    openWayTo(arena, 'taller');
    const spawn = STATION33_SPAWNS.subestacion[0];
    openBarrier(arena, spawn.barrierId!);
    const { hit } = chaseUntilHit(arena, spawn, 10, -50, 60);
    expect(hit).toBe(true);
  });

  it('lets its own horde round the crane bay to the player at the substation door', () => {
    const arena = makeArena();
    openWayTo(arena, 'taller');
    const spawn = STATION33_SPAWNS.taller[0];
    openBarrier(arena, spawn.barrierId!);
    const { hit } = chaseUntilHit(arena, spawn, 6.2, TALLER.hall.maxZ - 0.8, 60);
    expect(hit).toBe(true);
  });

  it('keeps the bigger workshop clear of the cable-tunnel passage and swings its crane hook', () => {
    const arena = makeArena();
    const tunnel = STATION33_BARRIERS.find((candidate) => candidate.id === 'subestacion-cable-tunnel')!;
    const room = new THREE.Box3(
      new THREE.Vector3(TALLER.hall.minX - STATION33_WALL_THICKNESS, 0, TALLER.hall.minZ),
      new THREE.Vector3(TALLER.hall.maxX + STATION33_WALL_THICKNESS, TALLER.ceilingHeight, TALLER.hall.maxZ),
    );
    expect(room.intersectsBox(passageBox(tunnel))).toBe(false);
    const hook = arena.group.getObjectByName('workshop-crane-hook')!;
    arena.update(1.3);
    const first = hook.rotation.z;
    arena.update(1.1);
    expect(hook.rotation.z).not.toBe(first);
  });
});

describe('Station 33 KOVKA chamber', () => {
  const { hall, pit } = KOVKA;
  const hatch = STATION33_DOORS.find((door) => door.zone === 'kovka')!;

  /** Inside the machine room, in front of the hatch. */
  const beforeHatch = { x: SUBESTACION.hall.minX + 1, z: hatch.z } as const;

  it('keeps the vestibule to its own doors and opens from the machine room only', () => {
    expect(hatch.outwardX).toBe(-1);
    expect(station33ZoneAt(beforeHatch.x, beforeHatch.z)).toBe('subestacion');
    expect(STATION33_DOORS.filter((door) => station33ZoneAt(door.x - door.outwardX, door.z - door.outwardZ) === 'vestibule')).toHaveLength(3);
    expect(KOVKA_CORRIDOR.minZ).toBeGreaterThan(SUBESTACION.hall.minZ);
    expect(KOVKA_CORRIDOR.maxZ).toBeLessThan(SUBESTACION.hall.maxZ);
    expect(KOVKA_CORRIDOR.minZ).toBeGreaterThan(pit.maxZ);
    expect(KOVKA_CORRIDOR.maxZ).toBeLessThan(hall.maxZ);
  });

  it('stays sealed behind its hatch until bought, then wakes its own entrances', () => {
    const arena = makeArena();
    openWayTo(arena, 'subestacion');
    expect(walk(arena, beforeHatch.x, beforeHatch.z, FACE_WEST, 3).x).toBeGreaterThan(SUBESTACION.hall.minX);
    expect(arena.spawnPoints.some((point) => (point as ZombieSpawnPoint).barrierId?.startsWith('kovka'))).toBe(false);
    openDoorTo(arena, 'kovka');
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(barrierIdsOf('vestibule', 'cocheras', 'subestacion', 'kovka'));
    expect(arena.spawnPoints).toEqual([...STATION33_SPAWNS.vestibule, ...STATION33_SPAWNS.cocheras, ...STATION33_SPAWNS.subestacion, ...STATION33_SPAWNS.kovka]);
    // Down the corridor, across the escalator axis and onto the deck before the reactor.
    expect(walk(arena, beforeHatch.x, beforeHatch.z, FACE_WEST, 5).x).toBeLessThan(hall.maxX - 2);
    for (const barrier of arena.barriers) {
      while (!barrier.isOpen) barrier.damage(100);
    }
    const gate = STATION33_BARRIERS.find((barrier) => barrier.zone === 'kovka' && barrier.kind === 'gate')!;
    expect(walk(arena, gate.x, hall.minZ + 1.6, FACE_NORTH, 3).z).toBeGreaterThan(hall.minZ);
    arena.reset();
    expect(arena.doors.find((door) => door.id === hatch.id)!.isLocked).toBe(true);
    expect(arena.spawnPoints).toEqual(STATION33_SPAWNS.vestibule);
  });

  it('stays west of the escalator shaft, off every other room and passage, and under the surface', () => {
    expect(hall.maxX + STATION33_WALL_THICKNESS).toBeLessThan(ESCALATOR_PORTAL.centerX - ESCALATOR_PORTAL.width / 2 - 0.3);
    const walls = new THREE.Box3(
      new THREE.Vector3(hall.minX - STATION33_WALL_THICKNESS, 0, hall.minZ - STATION33_WALL_THICKNESS),
      new THREE.Vector3(hall.maxX + STATION33_WALL_THICKNESS, 3, hall.maxZ),
    ).expandByScalar(-0.01);
    for (const barrier of STATION33_BARRIERS.filter((candidate) => candidate.zone !== 'kovka')) {
      expect(walls.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
    }
    for (const room of ROOMS.filter((candidate) => candidate !== hall)) {
      expect(walls.intersectsBox(new THREE.Box3(new THREE.Vector3(room.minX, 0, room.minZ), new THREE.Vector3(room.maxX, 3, room.maxZ)))).toBe(false);
    }
    // The surface's snow lies over everything north of z = -30, 12 cm thick.
    expect(KOVKA_VAULT.heightAt(KOVKA_VAULT.centerX)).toBeCloseTo(KOVKA.vaultApexY);
    expect(KOVKA.vaultApexY).toBeLessThan(PROTOCOL33_SURFACE_Y - 0.12);
    expect(KOVKA.vaultApexY - pit.floorY).toBeGreaterThanOrEqual(12);
    for (const x of [hall.minX + 1, KOVKA_REACTOR.x, hall.maxX - 1]) expect(station33ZoneAt(x, (hall.minZ + hall.maxZ) / 2)).toBe('kovka');
    expect(station33ZoneAt(hall.maxX - 1, hall.minZ + 0.5)).toBe('kovka');
    // The corridor crosses the escalator axis far north of the incline, clear of every passage.
    const corridor = new THREE.Box3(
      new THREE.Vector3(KOVKA_CORRIDOR.minX, 0, KOVKA_CORRIDOR.minZ - STATION33_WALL_THICKNESS),
      new THREE.Vector3(KOVKA_CORRIDOR.maxX, KOVKA_CORRIDOR.height, KOVKA_CORRIDOR.maxZ + STATION33_WALL_THICKNESS),
    ).expandByScalar(-0.01);
    expect(corridor.max.z).toBeLessThan(COCHERAS.hall.minZ - 5);
    for (const barrier of STATION33_BARRIERS) expect(corridor.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
    expect(station33ZoneAt(0, (KOVKA_CORRIDOR.minZ + KOVKA_CORRIDOR.maxZ) / 2)).toBe('kovka');
  });

  it('keeps the reactor in its pit and under the vault, solid to bullets, with the pit railed off floor 0', () => {
    const { x, axisY, radius, frontZ, backZ } = KOVKA_REACTOR;
    expect(x - radius).toBeGreaterThan(pit.minX);
    expect(x + radius).toBeLessThan(pit.maxX);
    expect(axisY - radius).toBeGreaterThan(pit.floorY);
    expect(backZ).toBeGreaterThan(pit.minZ);
    expect(frontZ).toBeLessThan(pit.maxZ);
    expect(axisY + radius).toBeLessThan(KOVKA_VAULT.heightAt(x) - 0.8);
    const arena = makeArena();
    openDoorTo(arena, 'kovka');
    // Over the forge standing before the face.
    const shot = new THREE.Raycaster(new THREE.Vector3(x, 2.6, hall.maxZ - 1), new THREE.Vector3(0, 0, -1));
    const hit = shot.intersectObjects([...arena.colliders], false)[0];
    expect(hit.object.name).toMatch(/^kovka-reactor-/);
    expect(hit.point.z).toBeGreaterThan(frontZ - 0.1);
    expect(walk(arena, x, pit.maxZ + 3, FACE_NORTH, 3).z).toBeGreaterThan(pit.maxZ);
    expect(walk(arena, x, pit.minZ - 3, FACE_SOUTH, 3).z).toBeLessThan(pit.minZ);
    expect(walk(arena, pit.minX - 2.5, (pit.minZ + pit.maxZ) / 2, FACE_EAST, 3).x).toBeLessThan(pit.minX);
    expect(walk(arena, pit.maxX + 2.5, (pit.minZ + pit.maxZ) / 2, FACE_WEST, 3).x).toBeGreaterThan(pit.maxX);
  });

  it('runs a lane down each side of the pit, so the horde can be circled round the reactor', () => {
    const arena = makeArena();
    openDoorTo(arena, 'kovka');
    for (const x of [pit.minX - 2.4, pit.maxX + 2.4]) {
      const end = walk(arena, x, pit.maxZ + 2, FACE_NORTH, 10);
      expect(end.z, `lane at x = ${x}`).toBeLessThan(hall.minZ + 1);
    }
    const navigation = navigationOf(arena);
    const front = { x: KOVKA_REACTOR.x, z: (pit.maxZ + hall.maxZ) / 2 };
    const back = { x: KOVKA_REACTOR.x, z: (hall.minZ + pit.minZ) / 2 };
    const route = navigation.findPath(0, front.x, front.z, back.x, back.z)!;
    expect(route).not.toBeNull();
    expect(route.every((point) => point.x < pit.minX || point.x > pit.maxX || point.z < pit.minZ || point.z > pit.maxZ)).toBe(true);
  });

  it('keeps the forge place in front of the reactor clear to stand at, and reachable from the hatch and every entrance', () => {
    const arena = makeArena();
    openDoorTo(arena, 'kovka');
    const { x, z, width, depth, approach, facingZ } = KOVKA_UPGRADE_SITE;
    expect(facingZ).toBe(1);
    expect(z - depth / 2).toBeGreaterThan(pit.maxZ);
    expect(z + depth / 2 + approach).toBeLessThan(hall.maxZ);
    const site = new THREE.Box3(
      new THREE.Vector3(x - width / 2, ZOMBIE_BAND.bottom, z + depth / 2 + 0.05),
      new THREE.Vector3(x + width / 2, ZOMBIE_BAND.top, z + depth / 2 + approach),
    );
    expect(solidBoxes(arena).some((box) => box.intersectsBox(site))).toBe(false);
    const stand = { x, z: z + depth / 2 + approach / 2 };
    const navigation = navigationOf(arena);
    expect(navigation.findPath(0, beforeHatch.x, beforeHatch.z, stand.x, stand.z)).not.toBeNull();
    for (const spawn of STATION33_SPAWNS.kovka) {
      expect(navigation.findPath(0, spawn.breachX!, spawn.breachZ!, stand.x, stand.z), spawn.barrierId).not.toBeNull();
    }
  });

  it('keeps the hatch sealed and off sale until the power, its lamp pulsing red then holding green', () => {
    const arena = makeArena();
    openWayTo(arena, 'subestacion');
    const door = arena.doors.find((candidate) => candidate.id === hatch.id)!;
    const lamp = (arena.group.getObjectByName('kovka-hatch-lamp') as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(door.isSealed).toBe(true);
    expect(doorPrompt(door, false)).toBe(t('prompt.doorNeedsPower', { door: t('door.to-kovka') }));
    expect(door.tryUnlock(() => { throw new Error('a sealed hatch must not charge'); })).toEqual({ cost: 3500, success: false, sealed: true });
    expect(walk(arena, beforeHatch.x, beforeHatch.z, FACE_WEST, 3).x).toBeGreaterThan(SUBESTACION.hall.minX);
    arena.update(0.2);
    expect(lamp.color.r).toBeGreaterThan(lamp.color.g);
    arena.switchOnPower();
    arena.update(0.2);
    expect(door.isSealed).toBe(false);
    expect(doorPrompt(door, false)).toBe(t('prompt.unlockDoor', { door: t('door.to-kovka'), key: actionKey(false), cost: 3500 }));
    expect(lamp.color.g).toBeGreaterThan(lamp.color.r);
    arena.reset();
    arena.update(0.2);
    expect(door.isSealed).toBe(true);
    expect(lamp.color.r).toBeGreaterThan(lamp.color.g);
  });

  it('stands the forge on its deck, solid, with room in front to use it', () => {
    const arena = makeArena();
    openDoorTo(arena, 'kovka');
    const machine = arena.upgradeMachine;
    const { x, z, width, depth, approach } = KOVKA_UPGRADE_SITE;
    expect(machine.position.z).toBeGreaterThan(z + depth / 2 - 0.1);
    expect(structureBoxes(arena).some((box) => box.containsPoint(new THREE.Vector3(x, 0.5, z)))).toBe(true);
    const front = new THREE.Box3(
      new THREE.Vector3(x - width / 2, ZOMBIE_BAND.bottom, z + depth / 2 + 0.05),
      new THREE.Vector3(x + width / 2, ZOMBIE_BAND.top, z + depth / 2 + approach),
    );
    expect(solidBoxes(arena).some((box) => box.intersectsBox(front))).toBe(false);
  });

  it('forges the weapon in hand once the power is on: price, a 7.5 s forge, double damage, refill, finish and shot looks', () => {
    const forgeSeconds = KOVKA_UPGRADE_MACHINE.forgeSeconds;
    expect(forgeSeconds).toBe(7.5);
    const side = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(side.ctx);
    const arena = (mode as unknown as { arena: Station33Arena }).arena;
    const economy = (mode as unknown as { economy: PlayerEconomy }).economy;
    const damageScale = (): number => (mode as unknown as { weaponDamageScale(id: string): number }).weaponDamageScale('m1911');
    const machine = arena.upgradeMachine;
    side.player.teleport(machine.position.x, EYE_HEIGHT, machine.position.z + 0.8, 0);
    side.player.face(FACE_NORTH);
    side.player.rig.updateMatrixWorld(true);
    const weapon = STATION33_WEAPONS.m1911.name;
    expect(mode.getInteractPrompt()).toBe(t('prompt.upgradeNeedsPower'));
    mode.onInteract();
    expect(machine.busy).toBe(false);

    arena.switchOnPower();
    expect(mode.getInteractPrompt()).toBe(t('prompt.upgradeWeapon', { weapon, key: actionKey(false), cost: 5000 }));
    mode.onInteract();
    expect(side.hud.flashNotEnoughPoints).toHaveBeenCalled();
    expect(machine.busy).toBe(false);

    economy.setUnlimitedSpending(true);
    mode.onInteract();
    expect(machine.busy).toBe(true);
    expect(mode.getInteractPrompt()).toBe(t('prompt.upgradeForging', { weapon }));
    const upgrade = mode as unknown as { weaponUpgrade: { update(): void; shotLooks(id: string): unknown } };
    arena.update(forgeSeconds - 0.5);
    upgrade.weaponUpgrade.update();
    // Nothing is handed over before the forge ends, however often USE is pressed.
    mode.onInteract();
    expect(machine.busy).toBe(true);
    expect(damageScale()).toBe(1);
    expect(side.ctx.setWeaponFinish).not.toHaveBeenCalled();
    expect(side.ctx.refillWeaponAmmo).not.toHaveBeenCalled();
    expect(upgrade.weaponUpgrade.shotLooks('m1911')).toBeNull();
    arena.update(0.6);
    upgrade.weaponUpgrade.update();
    expect(machine.busy).toBe(false);
    expect(damageScale()).toBe(2);
    expect(upgrade.weaponUpgrade.shotLooks('m1911')).toBe(KOVKA_WEAPON_FINISH.shots);
    expect(upgrade.weaponUpgrade.shotLooks('ak47')).toBeNull();
    expect(side.ctx.refillWeaponAmmo).toHaveBeenCalledWith('m1911');
    expect(side.ctx.setWeaponFinish).toHaveBeenCalledWith('m1911', KOVKA_WEAPON_FINISH);
    expect(side.hud.showNotice).toHaveBeenLastCalledWith('info', t('banner.weaponUpgraded', { weapon }));
    expect(mode.getInteractPrompt()).toBe(t('prompt.upgradeDone', { weapon }));
    mode.onInteract();
    expect(machine.busy).toBe(false);

    mode.onRestartRequested();
    expect(damageScale()).toBe(1);
    expect(side.ctx.resetArsenal).toHaveBeenCalled();
  });

  it('takes a MOTDRULES player straight to a powered forge from the developer console, ready to forge for free', () => {
    const side = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(side.ctx);
    const arena = (mode as unknown as { arena: Station33Arena }).arena;
    expect(mode.executeDeveloperCommand('forge')).toBe(t('dev.unavailable'));
    for (const key of 'MOTDRULES') mode.onKeyInput(key);
    expect(mode.executeDeveloperCommand('forge')).toBe(t('dev.ok'));
    expect(arena.powerSwitch.isOn).toBe(true);
    expect(arena.upgradeMachine.powered).toBe(true);
    for (const zone of ['cocheras', 'subestacion', 'kovka'] as const) {
      const door = STATION33_DOORS.find((candidate) => candidate.zone === zone)!;
      expect(arena.doors.find((candidate) => candidate.id === door.id)!.isLocked, zone).toBe(false);
    }
    side.player.rig.updateMatrixWorld(true);
    expect(station33ZoneAt(side.player.rig.position.x, side.player.rig.position.z)).toBe('kovka');
    const weapon = STATION33_WEAPONS[side.ctx.getEquippedWeaponId()].name;
    expect(mode.getInteractPrompt()).toBe(t('prompt.upgradeWeapon', { weapon, key: actionKey(false), cost: 5000 }));
    mode.onInteract();
    expect(arena.upgradeMachine.busy).toBe(true);
    // Once the forge is on its way, the shortcut is still harmless.
    expect(mode.executeDeveloperCommand('forge')).toBe(t('dev.ok'));
  });

  it('shows the weapon in the forge chamber while it forges and wails from the reactor as it starts', () => {
    const arena = makeArena();
    arena.switchOnPower();
    const cues: ArenaAmbientCue[] = [];
    arena.onAmbientCue = (cue) => cues.push(cue);
    const shown = (): THREE.Object3D | undefined => arena.group.getObjectByName('upgrade-machine-weapon');
    expect(shown()?.visible ?? false).toBe(false);
    arena.upgradeMachine.forge('m14');
    expect(cues).toEqual([KOVKA_FORGE_CUE]);
    const weapon = shown()!;
    expect(weapon.visible).toBe(true);
    arena.group.updateMatrixWorld(true);
    const inside = new THREE.Box3().setFromObject(weapon).getCenter(new THREE.Vector3());
    expect(Math.hypot(inside.x - KOVKA_UPGRADE_SITE.x, inside.z - KOVKA_UPGRADE_SITE.z)).toBeLessThan(0.3);
    expect(inside.y).toBeGreaterThan(1.1);
    const turn = weapon.rotation.x;
    arena.update(1);
    expect(weapon.rotation.x).not.toBe(turn);
    arena.update(KOVKA_UPGRADE_MACHINE.forgeSeconds);
    expect(arena.upgradeMachine.busy).toBe(false);
    expect(weapon.visible).toBe(false);
    arena.upgradeMachine.forge('ak47');
    expect(shown()!.visible).toBe(true);
    arena.reset();
    expect(arena.group.getObjectByName('upgrade-machine-weapon')?.visible ?? false).toBe(false);
  });

  it('paints the KOVKA finish onto the weapon in the chamber as it forges, from bare to fully dressed', () => {
    const arena = makeArena();
    arena.switchOnPower();
    arena.upgradeMachine.forge('m14');
    const weapon = arena.group.getObjectByName('upgrade-machine-weapon')!;
    const dressed: THREE.Mesh[] = [];
    weapon.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name.endsWith(`:${KOVKA_WEAPON_FINISH.id}`)) dressed.push(mesh);
    });
    expect(dressed.length).toBeGreaterThan(0);
    const shader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    (dressed[0].material as THREE.Material).onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('#define FINISH_PAINT');
    const reveal = shader.uniforms.uFinishReveal as THREE.IUniform<number>;
    expect(reveal.value).toBe(0);

    const forgeSeconds = KOVKA_UPGRADE_MACHINE.forgeSeconds;
    arena.update(forgeSeconds * 0.05);
    expect(reveal.value).toBe(0);
    arena.update(forgeSeconds * 0.4);
    expect(reveal.value).toBeGreaterThan(0.2);
    expect(reveal.value).toBeLessThan(0.8);
    const midway = reveal.value;
    arena.update(forgeSeconds * 0.1);
    expect(reveal.value).toBeGreaterThan(midway);
    arena.update(forgeSeconds * 0.4);
    expect(arena.upgradeMachine.busy).toBe(true);
    expect(reveal.value).toBe(1);

    // A later forge of the same weapon (after a restart) starts bare again.
    arena.reset();
    arena.switchOnPower();
    arena.upgradeMachine.forge('m14');
    expect(reveal.value).toBe(0);
  });

  it('keeps its solid props (cells, stretcher, console) on the deck, off the corridor, the upgrade site and the pit', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const props = arena.colliders.filter((collider) => ['kovka-cages', 'kovka-cage-door', 'kovka-gurney', 'kovka-console'].includes(collider.name));
    expect(props).toHaveLength(4);
    const { x, z, width, depth, approach } = KOVKA_UPGRADE_SITE;
    const keepClear = [
      new THREE.Box3(new THREE.Vector3(x - width / 2, 0, z - depth / 2), new THREE.Vector3(x + width / 2, 2, z + depth / 2 + approach)),
      new THREE.Box3(new THREE.Vector3(hall.maxX - 3, 0, KOVKA_CORRIDOR.minZ), new THREE.Vector3(KOVKA_CORRIDOR.maxX, 2, KOVKA_CORRIDOR.maxZ)),
      new THREE.Box3(new THREE.Vector3(pit.minX, -6, pit.minZ), new THREE.Vector3(pit.maxX, 2, pit.maxZ)),
    ];
    for (const prop of props) {
      const box = new THREE.Box3().setFromObject(prop);
      expect(box.min.x, prop.name).toBeGreaterThanOrEqual(hall.minX);
      expect(box.max.z, prop.name).toBeLessThanOrEqual(hall.maxZ + 1e-4);
      expect(box.min.z, prop.name).toBeGreaterThan(pit.maxZ);
      for (const area of keepClear) expect(box.intersectsBox(area), prop.name).toBe(false);
    }
  });

  it('lets its own horde reach the player at the hatch round the pit', () => {
    const arena = makeArena();
    openDoorTo(arena, 'kovka');
    const spawn = STATION33_SPAWNS.kovka.find((point) => point.barrierId === 'kovka-cable-gallery')!;
    openBarrier(arena, spawn.barrierId!);
    expect(chaseUntilHit(arena, spawn, hall.maxX - 1.2, hatch.z, 60).hit).toBe(true);
  });

  it('gives the chamber its own lights and wakes the reactor core with the mains', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    const inside = new THREE.Vector3(-12, EYE_HEIGHT, KOVKA.hall.maxZ - 5);
    const core = arena.group.children.find((object) => object instanceof THREE.PointLight && object.color.getHex() === KOVKA_CORE_COLOR) as THREE.PointLight;
    const glow = (): number => {
      let brightness = -1;
      arena.group.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (material?.name === 'station33_kovka_core') brightness = material.color.r + material.color.g + material.color.b;
      });
      return brightness;
    };
    arena.update(0.5, inside);
    const visible = arena.group.children.filter((object): object is THREE.PointLight => object instanceof THREE.PointLight && object.visible);
    expect(visible).toHaveLength(POINT_LIGHT_BUDGET.low);
    for (const light of visible) expect(station33ZoneAt(light.position.x, light.position.z)).toBe('kovka');
    expect(core.visible).toBe(true);
    expect(core.intensity).toBe(0);
    expect(glow()).toBe(0);
    arena.switchOnPower();
    for (let step = 0; step < 20; step++) arena.update(0.5, inside);
    expect(core.intensity).toBeGreaterThan(1);
    expect(glow()).toBeGreaterThan(0.5);
  });
});

describe('Station 33 main switch', () => {
  /** Runs Station 33 with the player in front of the main switch, looking at it. */
  function atTheSwitch() {
    const side = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(side.ctx);
    const arena = (mode as unknown as { arena: Station33Arena }).arena;
    side.player.teleport(POWER_LEVER.x, EYE_HEIGHT, POWER_LEVER.z + 0.9, 0);
    side.player.face(FACE_NORTH);
    side.player.rig.updateMatrixWorld(true);
    return { side, mode, arena };
  }

  it('is offered once and thrown for free, and the lever powers the station as it closes', () => {
    const { side, mode, arena } = atTheSwitch();
    const sleight = arena.ringMachines.find((machine) => machine.ringId === 'sleightOfHand')!;
    expect(mode.getInteractPrompt()).toBe(t('prompt.powerSwitch', { key: actionKey(false) }));
    mode.onInteract();
    expect(arena.powerSwitch.isOn).toBe(true);
    expect(side.ctx.audio.playPowerSwitch).toHaveBeenCalledOnce();
    expect(side.hud.showRoundBanner).toHaveBeenLastCalledWith(t('banner.powerOn'), t('banner.kovkaUnsealed'));
    expect(mode.getInteractPrompt()).toBeNull();
    // The blades still travel; the power arrives when they close.
    expect(sleight.powered).toBe(false);
    arena.update(0.6);
    expect(sleight.powered).toBe(true);
    expect(arena.group.getObjectByName('power-lever-web')!.visible).toBe(false);
    mode.onInteract();
    expect(side.ctx.audio.playPowerSwitch).toHaveBeenCalledOnce();
  });

  it('lights the whole station up: mains lamps, brighter lights, more fill, thinner haze, blazing lockers', () => {
    const scene = new THREE.Scene();
    const arena = new Station33Arena(scene, { ...TEST_PROFILE, quality: 'high' });
    arena.init();
    const inMachineRoom = new THREE.Vector3(11, 1.7, -40);
    const visibleIntensity = (): number => {
      let total = 0;
      for (let step = 0; step < 40; step++) {
        arena.update(0.25, inMachineRoom);
        arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible) total += object.intensity; });
      }
      return total;
    };
    const hemisphere = (): number => {
      let intensity = 0;
      arena.group.traverse((object) => { if (object instanceof THREE.HemisphereLight) intensity = object.intensity; });
      return intensity;
    };
    const bulb = (): number => {
      const material = (arena.group.getObjectByName('locker-bulb') as THREE.Mesh).material as THREE.MeshBasicMaterial;
      return material.color.r + material.color.g + material.color.b;
    };
    const before = { light: visibleIntensity(), hemisphere: hemisphere(), fog: (scene.fog as THREE.FogExp2).density, environment: scene.environmentIntensity, bulb: bulb() };

    arena.switchOnPower();
    arena.update(5, inMachineRoom);
    expect(visibleIntensity()).toBeGreaterThan(before.light * 1.5);
    expect(hemisphere()).toBeGreaterThan(before.hemisphere);
    expect((scene.fog as THREE.FogExp2).density).toBeLessThan(before.fog);
    expect(scene.environmentIntensity).toBeGreaterThan(before.environment);
    expect(bulb()).toBeGreaterThan(before.bulb * 10);

    arena.reset();
    expect(arena.powerSwitch.isOn).toBe(false);
    expect(hemisphere()).toBe(before.hemisphere);
    expect((scene.fog as THREE.FogExp2).density).toBe(before.fog);
    expect(scene.environmentIntensity).toBe(before.environment);
    expect(arena.group.getObjectByName('power-lever-web')!.visible).toBe(true);
    expect(arena.ringMachines.find((machine) => machine.ringId === 'sleightOfHand')!.powered).toBe(false);
  });
});

describe('Station 33 lights and ambience', () => {
  it.each(QUALITY_LEVELS)('keeps a fixed %s-quality point-light budget through flicker, blackouts and both rooms', (quality: QualityLevel) => {
    const arena = makeArena({ ...TEST_PROFILE, quality });
    const visibleLights = (): number => {
      let count = 0;
      arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible) count++; });
      return count;
    };
    expect(arena.pointLightCount).toBe(POINT_LIGHT_BUDGET[quality]);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
    const observers = [new THREE.Vector3(0, 1.7, 15), new THREE.Vector3(17.5, 1.7, 12), new THREE.Vector3(10, 1.7, 10), new THREE.Vector3(11, 1.7, -14)];
    for (let step = 0; step < 600; step++) arena.update(0.5, observers[step % observers.length]);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
  });

  it.each(QUALITY_LEVELS)('lights the vestibule from the spawn exactly as phase 1 did (%s)', (quality: QualityLevel) => {
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

  it('hands the real lights to the train sheds once the player is past their door', () => {
    const arena = makeArena({ ...TEST_PROFILE, quality: 'low' });
    const shedsLit = (): number => {
      let count = 0;
      arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible && object.position.z < VESTIBULE.minZ) count++; });
      return count;
    };
    const at = (z: number): void => arena.update(0, new THREE.Vector3(5.6, 1.7, z));
    at(-0.5);
    expect(shedsLit()).toBe(0);
    at(-1.2);
    expect(shedsLit()).toBe(POINT_LIGHT_BUDGET.low);
    at(0.2);
    expect(shedsLit()).toBe(POINT_LIGHT_BUDGET.low);
    at(0.8);
    expect(shedsLit()).toBe(0);
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
      // Another event may fire in the same step, after the dip.
      if (cues.slice(before).some((cue) => cue.sound === 'power-dip')) {
        dimmedOnDip ||= fluorescents.every((light) => light.intensity < 1);
      }
    }
    expect(dimmedOnDip).toBe(true);
    expect(new Set(cues.map((cue) => cue.sound)))
      .toEqual(new Set(['pa-crackle', 'distant-train', 'power-dip', 'metal-echo', 'machinery']));
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
    openDoorTo(arena, 'cocheras');
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
