import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZOMBIE_MAPS, type ZombieMapId } from '../src/config/zombieMaps';
import { getDeviceProfile, QUALITY_LEVELS } from '../src/core/DeviceProfile';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';
import type { PlayerBounds, ZombieArena } from '../src/zombies/maps/ZombieArena';
import type { ZombieSpawnDefinition } from '../src/zombies/ZombieSpawner';
import { measureArena } from './arenaMetrics';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const NAV_CELL_SIZE = 0.35;
const FIXED_DELTA = 1 / 60;
const REPORT_PERFORMANCE = process.env.ZEROED_PERF === '1';

type ArenaMetrics = ReturnType<typeof measureArena>;
type BudgetMetric = 'drawables' | 'visibleDrawables' | 'triangles' | 'visibleTriangles' |
  'geometryMiB' | 'materials' | 'colliders' | 'wallBoxes' | 'navCells';

// Regression ceilings for today's maps, shared across quality and door states.
const ARENA_BUDGETS: Record<ZombieMapId, Pick<ArenaMetrics, BudgetMetric>> = {
  'burned-mansion': {
    drawables: 710, visibleDrawables: 430, triangles: 91_000, visibleTriangles: 60_000,
    geometryMiB: 6, materials: 215, colliders: 100, wallBoxes: 85, navCells: 15_000,
  },
  'station-33': {
    drawables: 1_025, visibleDrawables: 780, triangles: 200_000, visibleTriangles: 185_000,
    geometryMiB: 17, materials: 250, colliders: 300, wallBoxes: 215, navCells: 52_000,
  },
};

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function spawnXZ(spawn: ZombieSpawnDefinition): { x: number; z: number } {
  return Array.isArray(spawn) ? { x: spawn[0], z: spawn[1] } : spawn as { x: number; z: number };
}

function contains(bounds: PlayerBounds, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function expectUniqueIds(items: ReadonlyArray<{ readonly id: string }>): void {
  const ids = items.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
}

/** Opens every door so spawns and barriers of locked zones are checked too. */
function openEveryDoor(arena: ZombieArena): void {
  for (const door of arena.doors) {
    door.tryUnlock(() => true);
    arena.activateDoor(door.id);
  }
  arena.update(5);
  arena.refreshSpawnPoints();
}

function expectSpawnsInsideNavigation(arena: ZombieArena): void {
  for (const spawn of arena.spawnPoints) {
    const { x, z } = spawnXZ(spawn);
    expect(arena.navigationBounds.some((bounds) => contains(bounds, x, z)), `spawn (${x}, ${z})`).toBe(true);
  }
}

function checkSceneBudget(mapId: ZombieMapId, metrics: ArenaMetrics, phase: string): void {
  const budget = ARENA_BUDGETS[mapId];
  for (const metric of Object.keys(budget) as BudgetMetric[]) {
    expect(metrics[metric], `${mapId} ${phase}: ${metric}`).toBeLessThanOrEqual(budget[metric]);
  }
}

function timeArenaUpdate(arena: ZombieArena, observer: THREE.Vector3): number {
  for (let frame = 0; frame < 30; frame++) arena.update(FIXED_DELTA, observer);
  const start = performance.now();
  for (let frame = 0; frame < 120; frame++) arena.update(FIXED_DELTA, observer);
  return (performance.now() - start) / 120;
}

describe.each(Object.values(ZOMBIE_MAPS))('ZombieArena contract: $id', (map) => {
  function makeArena(): ZombieArena {
    const arena = map.createArena(new THREE.Scene(), TEST_PROFILE);
    arena.init();
    return arena;
  }

  it.each(QUALITY_LEVELS)('stays within the %s scene budget with doors closed and unlocked', (quality) => {
    const mapIndex = Object.keys(ZOMBIE_MAPS).indexOf(map.id);
    const seed = 20261110 + mapIndex * QUALITY_LEVELS.length + QUALITY_LEVELS.indexOf(quality);
    const random = vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
    try {
      const scene = new THREE.Scene();
      const profile = getDeviceProfile({}, quality);
      const buildStart = performance.now();
      const arena = map.createArena(scene, profile);
      arena.init();
      const buildMs = performance.now() - buildStart;
      const { x, y, z } = arena.playerSpawn;
      const observer = new THREE.Vector3(x, y, z);
      arena.update(FIXED_DELTA, observer);
      const closed = measureArena(arena, NAV_CELL_SIZE);
      checkSceneBudget(map.id, closed, 'closed');

      openEveryDoor(arena);
      arena.update(FIXED_DELTA, observer);
      const unlocked = measureArena(arena, NAV_CELL_SIZE);
      checkSceneBudget(map.id, unlocked, 'unlocked');

      if (REPORT_PERFORMANCE) {
        const updateMs = timeArenaUpdate(arena, observer);
        const refreshStart = performance.now();
        for (let sample = 0; sample < 30; sample++) {
          arena.refreshColliders();
          arena.refreshSpawnPoints();
        }
        const refreshMs = (performance.now() - refreshStart) / 30;
        console.log(JSON.stringify({ map: map.id, quality, closed, unlocked, buildMs, updateMs, refreshMs }));
      }
    } finally {
      random.mockRestore();
    }
  });

  it('builds the arena registered under its id', () => {
    expect(makeArena().id).toBe(map.id);
  });

  it('spawns the player inside the player bounds', () => {
    const { playerSpawn: spawn, playerBounds: bounds } = makeArena();
    expect(contains(bounds, spawn.x, spawn.z)).toBe(true);
    if (bounds.minY !== undefined) expect(spawn.y).toBeGreaterThanOrEqual(bounds.minY);
    if (bounds.maxY !== undefined) expect(spawn.y).toBeLessThanOrEqual(bounds.maxY);
  });

  it('uses unique ids for doors, barriers and wall buys', () => {
    const arena = makeArena();
    expectUniqueIds(arena.doors);
    expectUniqueIds(arena.wallBuys);
    expectUniqueIds(arena.barriers);
    openEveryDoor(arena);
    expectUniqueIds(arena.barriers);
  });

  it('keeps every zombie spawn inside some navigation bounds', () => {
    const arena = makeArena();
    expect(arena.spawnPoints.length).toBeGreaterThan(0);
    expectSpawnsInsideNavigation(arena);
    openEveryDoor(arena);
    expectSpawnsInsideNavigation(arena);
  });
});
