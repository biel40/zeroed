import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { EYE_HEIGHT, PLAYER_BODY_RADIUS } from '../src/player/PlayerController';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import { DIE_KATHEDRALE_DOORS, DIE_KATHEDRALE_PLAYER_SPAWN } from '../src/zombies/maps/DieKathedraleConfig';
import { DIE_KATHEDRALE_RING_SITES } from '../src/zombies/maps/dieKathedrale/DieKathedraleRingSites';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

const GROUND_RING_ROUTES = [
  ['resurrection', []],
  ['armor', ['almoina-gate']],
  ['sleightOfHand', ['mirador-gate', 'mirador-portal', 'courtyard-grille']],
  ['sleightOfHand', ['to-plaza', 'palau-postern', 'courtyard-grille']],
] as const;
const RING_ROUTE_COSTS = { resurrection: 0, armor: 1000, sleightOfHand: 2750, doubleTap: 3500 };
const STEP = 0.25;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function openDoors(arena: DieKathedraleArena, ids: readonly string[]): void {
  for (const id of ids) {
    const door = arena.doors.find((candidate) => candidate.id === id)!;
    expect(door.tryUnlock(() => true).success, id).toBe(true);
    expect(arena.activateDoor(id), id).toBe(true);
  }
}

/** Shortest cardinal route to each probe, through the actual player blockers. */
function groundDistances(arena: DieKathedraleArena): ReadonlyMap<string, number> {
  const { minX, maxX, minZ, maxZ } = arena.playerBounds;
  const walls = arena.wallColliders.filter((wall) => wall.max.y > 0.05 && wall.min.y < EYE_HEIGHT + 0.25);
  const body = new THREE.Box3();
  const free = (x: number, z: number): boolean => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    body.min.set(x - PLAYER_BODY_RADIUS, 0.05, z - PLAYER_BODY_RADIUS);
    body.max.set(x + PLAYER_BODY_RADIUS, EYE_HEIGHT + 0.25, z + PLAYER_BODY_RADIUS);
    return !walls.some((wall) => wall.intersectsBox(body));
  };
  const startX = Math.round(DIE_KATHEDRALE_PLAYER_SPAWN.x / STEP);
  const startZ = Math.round(DIE_KATHEDRALE_PLAYER_SPAWN.z / STEP);
  const distances = new Map([[`${startX}/${startZ}`, 0]]);
  const queue = [{ x: startX, z: startZ, distance: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const { x, z, distance } = queue[index];
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      const key = `${nx}/${nz}`;
      if (distances.has(key) || !free(nx * STEP, nz * STEP)) continue;
      distances.set(key, distance + STEP);
      queue.push({ x: nx, z: nz, distance: distance + STEP });
    }
  }
  return distances;
}

function routeCosts(): ReadonlyMap<string, number> {
  const costs = new Map<string, number>([['narthex', 0]]);
  for (let pass = 0; pass < DIE_KATHEDRALE_DOORS.length; pass++) {
    for (const { zones: [a, b], cost } of DIE_KATHEDRALE_DOORS) {
      const costA = costs.get(a) ?? Infinity;
      const costB = costs.get(b) ?? Infinity;
      costs.set(a, Math.min(costA, costB + cost));
      costs.set(b, Math.min(costB, costA + cost));
    }
  }
  return costs;
}

describe('Die Kathedrale expansion progression', () => {
  it('installs exactly one site per catalog ring and orders sites by door cost', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    const costs = routeCosts();
    expect(arena.ringMachines.map((machine) => machine.ringId).sort()).toEqual(Object.keys(RING_DEFINITIONS).sort());
    for (const site of DIE_KATHEDRALE_RING_SITES) {
      expect(costs.get(site.zone), site.ringId).toBe(RING_ROUTE_COSTS[site.ringId]);
    }
  });

  it.each(GROUND_RING_ROUTES)('can walk to %s through %j', (ringId, doors) => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    const site = DIE_KATHEDRALE_RING_SITES.find((candidate) => candidate.ringId === ringId)!;
    const approach = `${Math.round(site.approach.x / STEP)}/${Math.round(site.approach.z / STEP)}`;
    if (doors.length) expect(groundDistances(arena).has(approach)).toBe(false);
    openDoors(arena, doors);
    const distances = groundDistances(arena);
    const first = DIE_KATHEDRALE_RING_SITES[0].approach;
    const firstDistance = distances.get(`${Math.round(first.x / STEP)}/${Math.round(first.z / STEP)}`)!;
    expect(distances.has(approach), ringId).toBe(true);
    expect(firstDistance).toBeGreaterThan(0);
    if (ringId !== 'resurrection') expect(distances.get(approach)!).toBeGreaterThan(firstDistance);
    expect(distances.has(`${Math.round(40 / STEP)}/${Math.round(15 / STEP)}`)).toBe(false);
    if (doors.length) {
      arena.reset();
      expect(groundDistances(arena).has(approach)).toBe(false);
    }
  });

  it.each(Object.keys(RING_DEFINITIONS) as Array<keyof typeof RING_DEFINITIONS>)(
    'uses the existing price, floor, prompt and purchase feedback for %s', (ringId) => {
      const { ctx, player } = makeContext();
      const mode = new ZombiesMode('die-kathedrale');
      mode.init(ctx);
      const { arena, economy } = mode as unknown as { arena: DieKathedraleArena; economy: PlayerEconomy };
      const site = DIE_KATHEDRALE_RING_SITES.find((candidate) => candidate.ringId === ringId)!;
      const machine = arena.ringMachines.find((candidate) => candidate.ringId === ringId)!;
      const ring = RING_DEFINITIONS[ringId];
      const price = ring.prices[0];
      const faceShrine = (floor: number): void => {
        player.teleport(site.approach.x, site.floorY + EYE_HEIGHT, site.approach.z, floor);
        player.face(Math.atan2(site.approach.x - site.x, site.approach.z - site.z));
        player.rig.updateMatrixWorld(true);
      };
      faceShrine(machine.floor + 2);
      expect(mode.getInteractPrompt()).toBeNull();
      faceShrine(machine.floor);
      expect(mode.getInteractPrompt()).toContain(`${price}`);
      const initialBalance = economy.points;
      for (let earned = 0; earned < price; earned += 10) economy.awardRepair();
      mode.onInteract();
      expect(economy.points).toBe(initialBalance);
      expect(ctx.handRings.show).toHaveBeenCalledWith(ring.finger, 'charged', ring.glowColor);
      expect(ctx.audio.playRingPurchase).toHaveBeenCalledOnce();
      expect(mode.getInteractPrompt()).toBeNull();
      mode.onRestartRequested();
      faceShrine(machine.floor);
      expect(mode.getInteractPrompt()).toContain(`${price}`);
      mode.onExit();
    },
  );
});

describe('Die Kathedrale expansion presentation', () => {
  it('stays within the low-tier light budget and hides the new sectors underground', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), { ...TEST_PROFILE, quality: 'low', isMobile: true });
    const cathedral = arena.group.getObjectByName('die-kathedrale-cathedral')!;
    const catacombs = arena.group.getObjectByName('die-kathedrale-catacombs')!;
    const exterior = arena.group.getObjectByName('die-kathedrale-grounds')!;
    const upper = arena.group.getObjectByName('die-kathedrale-upper')!;
    const arenaLights: THREE.PointLight[] = [];
    arena.group.traverse((object) => { if (object instanceof THREE.PointLight) arenaLights.push(object); });
    expect(arenaLights).toHaveLength(POINT_LIGHT_BUDGET.low);
    expect(arenaLights.every((light) => !light.castShadow)).toBe(true);
    expect(exterior.visible).toBe(false);
    const colliders = arena.colliders;
    arena.update(1, new THREE.Vector3(24, EYE_HEIGHT, -20));
    expect(exterior.visible).toBe(true);
    openDoors(arena, ['rood-gate', 'choir-gate', 'crypt-gate']);
    const openedColliders = arena.colliders;
    expect(openedColliders).not.toBe(colliders);
    arena.update(1, new THREE.Vector3(-11, 15.2 + EYE_HEIGHT, -38));
    expect(upper.visible).toBe(true);
    expect(catacombs.visible).toBe(false);
    arena.update(1, new THREE.Vector3(-10, 15.2 + EYE_HEIGHT, -52));
    expect(catacombs.visible).toBe(false);
    arena.update(1, new THREE.Vector3(0, -4.28, -80));
    expect(cathedral.visible).toBe(false);
    expect(arena.colliders).toBe(openedColliders);
  });
});
