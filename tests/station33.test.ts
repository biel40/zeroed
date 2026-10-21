import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceProfile, QualityLevel } from '../src/core/DeviceProfile';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import { mysteryBoxFootprint } from '../src/zombies/MysteryBoxFootprint';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  ESCALATOR_PORTAL,
  STATION33_BARRIERS,
  STATION33_BOX_PLACEMENT,
  STATION33_PLAYER_BOUNDS,
  STATION33_PLAYER_SPAWN,
  STATION33_SPAWNS,
  STATION33_WALL_BUYS,
  TURNSTILE_LINE,
  VESTIBULE,
} from '../src/zombies/maps/Station33Config';
import { circuitLevel } from '../src/zombies/maps/station33/Station33Lighting';
import type { ArenaAmbientCue, ZombieArena } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;
const ZOMBIE_BAND = { bottom: 0.05, top: 1.8 } as const;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(profile: DeviceProfile = TEST_PROFILE): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), profile);
  arena.init();
  return arena;
}

/** World AABBs of everything solid a zombie body or the player can bump into. */
function solidBoxes(arena: Station33Arena): THREE.Box3[] {
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

function openBarrier(arena: Station33Arena, id: string): void {
  const barrier = arena.barriers.find((candidate) => candidate.id === id)!;
  while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
}

/** Runs one zombie from `spawn` at a stationary player until it lands a hit. */
function chaseUntilHit(arena: Station33Arena, spawn: ZombieSpawnPoint, playerX: number, playerZ: number, seconds: number): { hit: boolean; path: THREE.Vector3[] } {
  const manager = new ZombieManager(() => 0, {}, false, [spawn], arena.barriers, [], () => 1);
  manager.setNavigationBounds(arena.navigationBounds);
  manager.setBodyObstacles([mysteryBoxFootprint(arena.mysteryBoxPlacement)]);
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

const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0 },
} as unknown as Weapon;

describe('Station 33 vestibule layout', () => {
  it('is a single sealed start zone: no doors, endings or map-only interactions', () => {
    const arena: ZombieArena = makeArena();
    expect(arena.doors).toHaveLength(0);
    expect(arena.activateDoor('anything')).toBe(false);
    expect(arena.completionInteraction).toBeUndefined();
    expect(arena.soulLampInteractions).toBeUndefined();
    expect(arena.barriers.map((barrier) => barrier.id)).toEqual(STATION33_BARRIERS.map((barrier) => barrier.id));
    expect(arena.spawnPoints).toHaveLength(STATION33_BARRIERS.length);
  });

  it('spawns the player clear of every solid', () => {
    const arena = makeArena();
    const player = bodyBox(STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.z, 0.35);
    for (const box of solidBoxes(arena)) expect(box.intersectsBox(player)).toBe(false);
  });

  it('places every zombie spawn outside the hall, clear of colliders, behind its own entrance', () => {
    const arena = makeArena();
    const solids = solidBoxes(arena);
    for (const spawn of Object.values(STATION33_SPAWNS).flat()) {
      const inside = spawn.x >= VESTIBULE.minX && spawn.x <= VESTIBULE.maxX && spawn.z >= VESTIBULE.minZ && spawn.z <= VESTIBULE.maxZ;
      expect(inside, `spawn ${spawn.barrierId}`).toBe(false);
      const body = bodyBox(spawn.x, spawn.z, 0.45);
      for (const box of solids) expect(box.intersectsBox(body), `spawn ${spawn.barrierId}`).toBe(false);
      const barrier = STATION33_BARRIERS.find((candidate) => candidate.id === spawn.barrierId)!;
      const side = (x: number, z: number): number => (x - barrier.x) * barrier.outwardX + (z - barrier.z) * barrier.outwardZ;
      expect(side(spawn.approachX!, spawn.approachZ!)).toBeGreaterThan(0.4);
      expect(side(spawn.breachX!, spawn.breachZ!)).toBeLessThan(-0.4);
    }
  });

  it.each(STATION33_BARRIERS.map((barrier) => barrier.id))('gives the %s entrance a walkable route to the player spawn', (id) => {
    const arena = makeArena();
    openBarrier(arena, id);
    const spawn = arena.spawnPoints.find((point) => (point as ZombieSpawnPoint).barrierId === id) as ZombieSpawnPoint;
    const { hit } = chaseUntilHit(arena, spawn, STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.z, 40);
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
    const player = new PlayerController(1);
    player.setWallColliders(arena.wallColliders);
    player.teleport(0, EYE_HEIGHT, 2.5, 0, arena.playerBounds);
    const forward = { ...idleInput, isDown: (code: string) => code === 'KeyW' } as unknown as Input;
    for (let frame = 0; frame < 180; frame++) player.update(DT, forward, weaponStub);
    expect(player.rig.position.z).toBeGreaterThan(VESTIBULE.minZ + 0.3);
  });

  it('keeps wall buys on the walls within reach, at the mansion prices', () => {
    expect(STATION33_WALL_BUYS.map((wallBuy) => [wallBuy.weaponId, wallBuy.price])).toEqual([['m1911', 500], ['ak47', 1750]]);
    for (const wallBuy of STATION33_WALL_BUYS) {
      const { x, z } = wallBuy.position;
      const toWall = Math.min(x - VESTIBULE.minX, VESTIBULE.maxX - x, z - VESTIBULE.minZ, VESTIBULE.maxZ - z);
      expect(Math.abs(toWall - 0.02)).toBeLessThan(0.005);
      const standX = THREE.MathUtils.clamp(x, STATION33_PLAYER_BOUNDS.minX, STATION33_PLAYER_BOUNDS.maxX);
      const standZ = THREE.MathUtils.clamp(z, STATION33_PLAYER_BOUNDS.minZ, STATION33_PLAYER_BOUNDS.maxZ);
      expect(Math.hypot(standX - x, standZ - z)).toBeLessThan(1);
    }
  });

  it('keeps the Mystery Box clear of walls and furniture with room to use it', () => {
    const arena = makeArena();
    const footprint = mysteryBoxFootprint(STATION33_BOX_PLACEMENT);
    const others = solidBoxes(arena).filter((box) => !box.equals(footprint));
    for (const box of others) expect(box.intersectsBox(footprint)).toBe(false);
    const front = bodyBox(STATION33_BOX_PLACEMENT.position.x, STATION33_BOX_PLACEMENT.position.z + 1.3, 0.35);
    for (const box of solidBoxes(arena)) expect(box.intersectsBox(front)).toBe(false);
  });
});

describe('Station 33 lights and ambience', () => {
  it.each(['low', 'medium', 'high'] as const)('keeps a fixed %s-quality point-light budget through flicker and blackouts', (quality: QualityLevel) => {
    const arena = makeArena({ ...TEST_PROFILE, quality });
    const visibleLights = (): number => {
      let count = 0;
      arena.group.traverse((object) => { if (object instanceof THREE.PointLight && object.visible) count++; });
      return count;
    };
    expect(arena.pointLightCount).toBe(POINT_LIGHT_BUDGET[quality]);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
    for (let step = 0; step < 600; step++) arena.update(0.5);
    expect(visibleLights()).toBe(POINT_LIGHT_BUDGET[quality]);
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
    expect(arena.ambience.musicTrack).toBe('background_music_theme');
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
