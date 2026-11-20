import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Input } from '../src/player/Input';
import { EYE_HEIGHT, PlayerController, stairRampGroundAt } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import { DIE_KATHEDRALE_SPAWNS } from '../src/zombies/maps/DieKathedraleConfig';
import { bellTowerTransitions } from '../src/zombies/maps/dieKathedrale/upper/BellTowerStair';
import { BELL_STAIR, DOUBLE_TAP_SITE, UPPER_FLOOR, UPPER_FLOOR_Y } from '../src/zombies/maps/dieKathedrale/upper/UpperCathedralConfig';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const twoPi = Math.PI * 2;
const { centerX, centerZ, radius, sweep } = BELL_STAIR;
const [ascending, descending] = bellTowerTransitions({ minX: -26, maxX: 30, minZ: -65, maxZ: 17 });
const ramp = ascending.ramp!;
const dt = 1 / 60;
const crossing = { x: -12.8, y: 0, z: centerZ };
const chamber = { x: -19.8, y: UPPER_FLOOR_Y, z: -52.2 };
const shrineApproach = { ...DOUBLE_TAP_SITE, z: DOUBLE_TAP_SITE.z - 1.5 };
const weapon = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0, absorbCompensation: () => undefined },
} as unknown as Weapon;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function pointAt(angle: number): THREE.Vector3 {
  return new THREE.Vector3(centerX + Math.cos(angle) * radius, angle / sweep * UPPER_FLOOR_Y, centerZ + Math.sin(angle) * radius);
}

function openTower(arena: DieKathedraleArena): void {
  for (const id of ['almoina-gate', 'ambulatory-gate', 'bell-tower-gate']) {
    const door = arena.doors.find((candidate) => candidate.id === id)!;
    expect(door.tryUnlock(() => true).success).toBe(true);
    expect(arena.activateDoor(id)).toBe(true);
  }
}

describe('Die Kathedrale bell stair', () => {
  it('samples overlapping flights from feet height and preserves both landings', () => {
    const lower = pointAt(0.5);
    const higher = pointAt(0.5 + twoPi * 2);
    expect(stairRampGroundAt(ramp, lower.x, lower.z, lower.y + 0.05)).toBeCloseTo(lower.y);
    expect(stairRampGroundAt(ramp, higher.x, higher.z, higher.y - 0.05)).toBeCloseTo(higher.y);
    expect(stairRampGroundAt(ramp, centerX, centerZ, lower.y)).toBeNull();
    expect(stairRampGroundAt(ramp, ramp.bottom.x, ramp.bottom.z, 0)).toBe(0);
    expect(stairRampGroundAt(ramp, ramp.top.x, ramp.top.z, UPPER_FLOOR_Y)).toBe(UPPER_FLOOR_Y);
    expect(ascending.sourceFloor).toBe(0);
    expect(ascending.targetFloor).toBe(UPPER_FLOOR);
    expect(ascending.targetY).toBe(UPPER_FLOOR_Y + EYE_HEIGHT);
    expect(descending.sourceFloor).toBe(UPPER_FLOOR);
    expect(descending.targetY).toBe(EYE_HEIGHT);
  });

  it('steers around the pier and through the appropriate landing in both directions', () => {
    const waypoint = new THREE.Vector3();
    for (const [start, finish] of [[ramp.bottom, ramp.top], [ramp.top, ramp.bottom]] as const) {
      const position = new THREE.Vector3(start.x, start.y, start.z);
      for (let step = 0; step < 600 && position.distanceTo(finish) > 0.08; step++) {
        ramp.curve!.waypoint(position.x, position.y, position.z, finish.x, finish.y, finish.z, waypoint);
        const distance = Math.hypot(waypoint.x - position.x, waypoint.z - position.z);
        const fraction = Math.min(1, 0.15 / distance);
        position.x += (waypoint.x - position.x) * fraction;
        position.z += (waypoint.z - position.z) * fraction;
        const height = stairRampGroundAt(ramp, position.x, position.z, position.y);
        expect(height).not.toBeNull();
        position.y = height!;
      }
      expect(position.distanceTo(finish)).toBeLessThan(0.08);
    }
  });

  it('walks the full stair with the actual player collision and switches floors on both landings', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    openTower(arena);
    const player = new PlayerController(1);
    player.setWallColliders(arena.wallColliders);
    player.setFloorTransitions(arena.floorTransitions);
    player.setMoveSpeedScale(0.66);
    const waypoint = new THREE.Vector3();
    const input = { isDown: () => false, wasPressed: () => false, mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0 };
    const { position } = player.rig;
    player.teleport(crossing.x, EYE_HEIGHT, crossing.z, 0, arena.playerBounds);
    for (const [target, floor] of [[chamber, UPPER_FLOOR], [crossing, 0]] as const) {
      let previousY = position.y;
      for (let frame = 0; frame < 1800 && player.floor !== floor; frame++) {
        ramp.curve!.waypoint(position.x, position.y - EYE_HEIGHT, position.z, target.x, target.y, target.z, waypoint);
        const dx = waypoint.x - position.x;
        const dz = waypoint.z - position.z;
        const length = Math.max(0.17, Math.hypot(dx, dz));
        input.moveAxisX = dx / length;
        input.moveAxisY = -dz / length;
        player.update(dt, input as unknown as Input, weapon);
        expect(Math.abs(position.y - previousY)).toBeLessThan(0.3);
        previousY = position.y;
      }
      expect(player.floor, `at ${position.toArray().join(', ')}`).toBe(floor);
      expect(position.y).toBeCloseTo(target.y + EYE_HEIGHT);
    }
  });

  it('routes live zombies over the spiral in both directions without recovery relocation', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    openTower(arena);
    for (const [source, sourceFloor, target, targetFloor] of [
      [crossing, 0, shrineApproach, UPPER_FLOOR], [chamber, UPPER_FLOOR, crossing, 0],
    ] as const) {
      const zombies = new ZombieManager(() => 0, {}, false, [], [], arena.floorTransitions, () => 1);
      zombies.setNavigationBounds(arena.navigationBounds);
      zombies.registerColliders([...arena.colliders]);
      expect(zombies.spawnAmbushZombie(roundConfig(6), source.x, source.z, 6, target.x, target.z, sourceFloor)).toBe(true);
      const [zombie] = zombies.actives;
      zombie.state = 'walk';
      let attacked = false;
      zombies.onPlayerAttack = () => { attacked = true; };
      for (let frame = 0; frame < 2600 && !attacked; frame++) {
        zombies.update(dt, target.x, target.z, targetFloor, target.y + EYE_HEIGHT);
      }
      expect(zombie.floor, zombie.position.toArray().join(', ')).toBe(targetFloor);
      expect(attacked, zombie.position.toArray().join(', ')).toBe(true);
      expect(zombies.stuckRecoveryCount).toBe(0);
      zombies.dispose();
    }
  });

  it('lets both upper spawn passages breach onto the terraces and reach the ring approach', () => {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    openTower(arena);
    for (const spawn of DIE_KATHEDRALE_SPAWNS.bellTower) {
      const barrier = arena.barriers.find((entry) => entry.id === spawn.barrierId)!;
      while (!barrier.isOpen) barrier.damage(barrier.boards[0].maxHp);
      const zombies = new ZombieManager(() => 0, {}, false, [spawn], arena.barriers, arena.floorTransitions, () => 1);
      zombies.setNavigationBounds(arena.navigationBounds);
      zombies.registerColliders([...arena.colliders]);
      expect(zombies.spawnZombie(roundConfig(6), shrineApproach.x, shrineApproach.z, 6, UPPER_FLOOR)).toBe(true);
      const [zombie] = zombies.actives;
      zombie.state = 'walk';
      let attacked = false;
      zombies.onPlayerAttack = () => { attacked = true; };
      for (let frame = 0; frame < 1700 && !attacked; frame++) {
        zombies.update(dt, shrineApproach.x, shrineApproach.z, UPPER_FLOOR, UPPER_FLOOR_Y + EYE_HEIGHT);
      }
      expect(attacked, `${spawn.barrierId}: ${zombie.position.toArray().join(', ')}`).toBe(true);
      expect(zombies.stuckRecoveryCount).toBe(0);
      zombies.dispose();
    }
  });
});
