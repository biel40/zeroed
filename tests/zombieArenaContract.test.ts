import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import type { PlayerBounds, ZombieArena } from '../src/zombies/maps/ZombieArena';
import type { ZombieSpawnDefinition } from '../src/zombies/ZombieSpawner';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

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

describe.each(Object.values(ZOMBIE_MAPS))('ZombieArena contract: $id', (map) => {
  function makeArena(): ZombieArena {
    const arena = map.createArena(new THREE.Scene(), TEST_PROFILE);
    arena.init();
    return arena;
  }

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
