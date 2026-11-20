import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Input } from '../src/player/Input';
import { EYE_HEIGHT, PLAYER_BODY_RADIUS } from '../src/player/PlayerController';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import { DIE_KATHEDRALE_PLAYER_SPAWN } from '../src/zombies/maps/DieKathedraleConfig';
import { EXTERIOR_ENTRANCES, PALAU_STEP, SLEIGHT_OF_HAND_SITE } from '../src/zombies/maps/DieKathedraleExteriorConfig';
import { NavigationGrid } from '../src/zombies/navigation/NavigationGrid';
import type { ZombieSpawnPoint } from '../src/zombies/ZombieSpawner';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

const ESPLANADE = { x: 26, z: -26 };
const RING_APPROACH = { x: SLEIGHT_OF_HAND_SITE.x, z: SLEIGHT_OF_HAND_SITE.z + 1.6 };

function unlock(arena: DieKathedraleArena, ids: ReadonlyArray<string>): void {
  for (const id of ids) {
    expect(arena.doors.find((door) => door.id === id)?.tryUnlock(() => true).success, id).toBe(true);
    expect(arena.activateDoor(id), id).toBe(true);
  }
}

function spawnOf(arena: DieKathedraleArena, id: string): ZombieSpawnPoint {
  const spawn = arena.spawnPoints.find((point) => 'barrierId' in point && point.barrierId === id);
  if (!spawn || !('x' in spawn)) throw new Error(`Missing active spawn for ${id}`);
  return spawn;
}

function grid(arena: DieKathedraleArena, forPlayer: boolean): NavigationGrid {
  const bounds = forPlayer ? arena.playerBounds : arena.navigationBounds.find(({ floor }) => floor === 0)!;
  const boxes = forPlayer
    ? arena.wallColliders
    : arena.colliders.filter((collider) => collider.userData.walkableSurface !== true)
      .map((collider) => new THREE.Box3().setFromObject(collider));
  const obstacles = boxes.filter((box) => box.max.y > 0.05 && box.min.y < 1.8).map(({ min, max }) => ({
    minX: min.x, minZ: min.z, maxX: max.x, maxZ: max.z,
  }));
  return new NavigationGrid(bounds, obstacles, 0.35, forPlayer ? PLAYER_BODY_RADIUS : 0.42);
}

describe('Die Kathedrale exterior', () => {
  it.each([
    ['the Mirador portal', ['mirador-gate', 'mirador-portal']],
    ['the Palau postern', ['to-plaza', 'palau-postern']],
  ] as const)('reaches the grounds and the courtyard through %s', (_label, doors) => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    const { x, z } = DIE_KATHEDRALE_PLAYER_SPAWN;
    expect(grid(arena, true).findPath(x, z, ESPLANADE.x, ESPLANADE.z)).toBeNull();
    unlock(arena, doors);
    const grounds = grid(arena, true);
    expect(grounds.findPath(x, z, ESPLANADE.x, ESPLANADE.z)).not.toBeNull();
    expect(grounds.findPath(x, z, RING_APPROACH.x, RING_APPROACH.z)).toBeNull();
    expect(arena.barriers.map(({ id }) => id)).toContain(EXTERIOR_ENTRANCES[0].id);
    expect(arena.barriers.map(({ id }) => id)).not.toContain(EXTERIOR_ENTRANCES[1].id);

    unlock(arena, ['courtyard-grille']);
    const player = grid(arena, true);
    expect(player.findPath(x, z, RING_APPROACH.x, RING_APPROACH.z)).not.toBeNull();
    expect(player.findPath(x, z, 36, -45)).toBeNull();
    expect(player.findPath(x, z, 31, 12)).toBeNull();
    const zombies = grid(arena, false);
    for (const entrance of EXTERIOR_ENTRANCES) {
      const spawn = spawnOf(arena, entrance.id);
      expect(zombies.isClearPoint(spawn.x, spawn.z), entrance.id).toBe(true);
      expect(zombies.findPath(spawn.x, spawn.z, x, z), entrance.id).not.toBeNull();
      if (player.contains(spawn.x, spawn.z)) expect(player.findPath(x, z, spawn.x, spawn.z), entrance.id).toBeNull();
    }
  });

  it('keeps the original closed campus perimeter solid where the ground bounds have expanded', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    unlock(arena, ['rood-gate', 'choir-gate', 'mirador-gate', 'mirador-portal', 'to-plaza', 'palau-postern', 'courtyard-grille']);
    const player = grid(arena, true);
    const { x, z } = DIE_KATHEDRALE_PLAYER_SPAWN;
    expect(player.findPath(x, z, 8, -54)).toBeNull();
    expect(player.findPath(x, z, 18.75, -24.5)).toBeNull();
    expect(player.findPath(x, z, 18.75, -3.5)).toBeNull();
    expect(player.findPath(x, z, 18.75, 6.5)).toBeNull();
  });

  it.each(EXTERIOR_ENTRANCES)('pursues the player from $id through the purchased gates', (entrance) => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    unlock(arena, ['mirador-gate', 'mirador-portal', 'courtyard-grille']);
    const spawn = spawnOf(arena, entrance.id);
    const barrier = arena.barriers.find(({ id }) => id === entrance.id)!;
    while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
    const manager = new ZombieManager(() => 0, {}, false, [spawn], arena.barriers, arena.floorTransitions, () => 1);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    const { x, z } = DIE_KATHEDRALE_PLAYER_SPAWN;
    expect(manager.spawnZombie(roundConfig(6), x, z, 6)).toBe(true);
    const [zombie] = manager.actives;
    zombie.state = 'walk';
    let hit = false;
    manager.onPlayerAttack = () => { hit = true; };
    for (let frame = 0; frame < 5400 && !hit; frame++) manager.update(1 / 60, x, z, 0);
    expect(hit).toBe(true);
  });

  it('takes the player and a pursuing zombie across the stone stairs without a floor change', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    const { player, weapon } = makeContext();
    const x = 22.1;
    const fromZ = PALAU_STEP.maxZ + 1.3;
    const targetZ = PALAU_STEP.minZ - 2.8;
    const dt = 1 / 60;
    const input = {
      isDown: (key: string) => key === 'KeyW', wasPressed: () => false,
      mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0,
    } as unknown as Input;
    player.teleport(x, EYE_HEIGHT, fromZ, 0, arena.playerBounds);
    player.setWallColliders(arena.wallColliders);
    player.setFloorTransitions(arena.floorTransitions);
    let peakEyeHeight = EYE_HEIGHT;
    for (let frame = 0; frame < 140; frame++) {
      player.update(dt, input, weapon);
      peakEyeHeight = Math.max(peakEyeHeight, player.rig.position.y);
    }
    expect(player.rig.position.z).toBeLessThan(targetZ);
    expect(peakEyeHeight).toBeCloseTo(EYE_HEIGHT + PALAU_STEP.rise);
    expect(player.rig.position.y).toBeCloseTo(EYE_HEIGHT);
    expect(player.floor).toBe(0);

    const manager = new ZombieManager(() => 0, {}, false, [{ x, z: fromZ, exterior: false }], [], arena.floorTransitions, () => 1);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    expect(manager.spawnZombie(roundConfig(6), x, targetZ, 6)).toBe(true);
    const [zombie] = manager.actives;
    zombie.state = 'walk';
    let hit = false;
    let peakFeetHeight = 0;
    manager.onPlayerAttack = () => { hit = true; };
    for (let frame = 0; frame < 1200 && !hit; frame++) {
      manager.update(dt, x, targetZ, 0);
      peakFeetHeight = Math.max(peakFeetHeight, zombie.position.y);
    }
    expect(hit).toBe(true);
    expect(peakFeetHeight).toBeCloseTo(PALAU_STEP.rise);
    expect(zombie.position.y).toBeCloseTo(0);
    expect(zombie.floor).toBe(0);
  });
});
