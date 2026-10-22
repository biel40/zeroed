import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { EYE_HEIGHT, PLAYER_BODY_RADIUS, PlayerController, type PlayerBodyCollider } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_TYPE_CONFIGS } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieReplica } from '../src/zombies/ZombieReplica';
import { installCanvasDocument, makeContext, makeMatch } from './coopHarness';

const DT = 1 / 60;
const BOUNDS = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const weapon = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0, recoil: { pitch: 0, yaw: 0 },
} as unknown as Weapon;

function input(...keys: string[]): Input {
  return {
    isDown: (key: string) => keys.includes(key), wasPressed: () => false,
    mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0,
  } as unknown as Input;
}

function advance(player: PlayerController, controls: Input, frames = 120): void {
  for (let i = 0; i < frames; i++) player.update(DT, controls, weapon);
}

function placePlayer(player = new PlayerController(1), x = 0, z = 4): PlayerController {
  player.setWallColliders([]);
  player.setFloorTransitions([]);
  player.teleport(x, EYE_HEIGHT, z, 0, BOUNDS);
  player.face(0);
  return player;
}

function body(radius = 0.42): PlayerBodyCollider {
  return { position: new THREE.Vector3(), bodyRadius: radius, bodyHeight: 1.78, isAlive: true };
}

describe('player movement against living bodies', () => {
  it.each(['normal', 'shiny', 'brute'] as const)('blocks the %s body radius', (type) => {
    const player = placePlayer();
    const obstacle = body(ZOMBIE_TYPE_CONFIGS[type].bodyRadius);
    player.setBodyColliders([obstacle]);
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeGreaterThanOrEqual(PLAYER_BODY_RADIUS + obstacle.bodyRadius);
    expect(player.rig.position.z).toBeLessThan(1);
  });

  it('sweeps the entire step so a long frame cannot cross a body', () => {
    const player = placePlayer();
    player.setBodyColliders([body()]);
    player.update(2, input('KeyW'), weapon);
    expect(player.rig.position.z).toBe(4);
  });

  it('can slide around a body without moving through it or through an adjacent wall', () => {
    const player = placePlayer(undefined, 0, 0.8);
    player.setBodyColliders([body()]);
    player.setWallColliders([new THREE.Box3(new THREE.Vector3(1.5, 0, -20), new THREE.Vector3(2, 3, 20))]);
    for (let i = 0; i < 120; i++) {
      player.update(DT, input('KeyW', 'KeyD'), weapon);
      expect(Math.hypot(player.rig.position.x, player.rig.position.z)).toBeGreaterThanOrEqual(0.77);
      expect(player.rig.position.x).toBeLessThan(1.5 - PLAYER_BODY_RADIUS);
    }
    expect(player.rig.position.x).toBeGreaterThan(1);
    expect(player.rig.position.z).toBeLessThan(-2);
  });

  it('allows retreat from an overlap without allowing movement deeper into it', () => {
    const player = placePlayer(undefined, 0, 0.4);
    player.setBodyColliders([body()]);
    advance(player, input('KeyW'), 10);
    expect(player.rig.position.z).toBe(0.4);
    advance(player, input('KeyS'), 60);
    expect(player.rig.position.z).toBeGreaterThan(2);
  });

  it('uses physical height so zombies below the player do not block movement', () => {
    const player = placePlayer();
    player.setBodyColliders([{ ...body(), position: new THREE.Vector3(0, -4, 0) }]);
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeLessThan(-3);
  });

  it('reads new positions, deaths and removals directly from the live population', () => {
    const player = placePlayer();
    const bodies = new Set<PlayerBodyCollider>();
    player.setBodyColliders(bodies);
    const obstacle = { ...body(), position: new THREE.Vector3(5, 0, 0) };
    bodies.add(obstacle);
    obstacle.position.x = 0;
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeGreaterThanOrEqual(0.77);
    obstacle.isAlive = false;
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeLessThan(-3);
    placePlayer(player);
    obstacle.isAlive = true;
    bodies.clear();
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeLessThan(-3);
  });
});

describe('zombie movement against player bodies', () => {
  it.each(['host', 'guest'] as const)('cannot cross the %s even when crowd movement pushes toward them', (target) => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -8]]);
    expect(manager.spawnZombie(roundConfig(1), 0, 0)).toBe(true);
    const zombie = [...manager.actives][0];
    zombie.state = 'walk';
    zombie.position.set(0, 0, -2);
    // Populate the manager's player positions without advancing navigation or combat.
    manager.update(0, target === 'host' ? 0 : 10, 0, 0, EYE_HEIGHT, 0, 0,
      target === 'guest' ? [{ id: 'guest', x: 0, y: EYE_HEIGHT, z: 0, floor: 0 }] : []);
    const movement = manager as unknown as { moveWithCollision(zombie: Zombie, dx: number, dz: number): boolean };
    movement.moveWithCollision(zombie, 0, 5);
    expect(zombie.position.z).toBeLessThanOrEqual(-PLAYER_BODY_RADIUS - zombie.bodyRadius);
    // It must remain free to retreat rather than becoming trapped at contact.
    movement.moveWithCollision(zombie, 0, -1);
    expect(zombie.position.z).toBeLessThan(-1.5);
  });
});

describe('mode collision wiring', () => {
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  it.each(['station-33', 'burned-mansion'] as const)('blocks new zombies in %s and clears them on restart', (map) => {
    const { ctx, player } = makeContext();
    const mode = new ZombiesMode(map);
    mode.init(ctx);
    const { zombies } = mode as unknown as { zombies: ZombieManager };
    expect(zombies.spawnZombie(roundConfig(1), player.rig.position.x, player.rig.position.z)).toBe(true);
    const zombie = [...zombies.actives][0];
    zombie.position.set(0, 0, 0);
    placePlayer(player);
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeGreaterThanOrEqual(PLAYER_BODY_RADIUS + zombie.bodyRadius);
    mode.onRestartRequested();
    placePlayer(player);
    advance(player, input('KeyW'));
    expect(player.rig.position.z).toBeLessThan(-3);
  });

  it('blocks host and guest against their own population and releases the guest on replicated death', () => {
    const match = makeMatch();
    const { zombies } = match.host as unknown as { zombies: ZombieManager };
    const { replica } = match.guest as unknown as { replica: ZombieReplica };
    expect(zombies.spawnZombie(roundConfig(1), 0, 0)).toBe(true);
    const zombie = [...zombies.actives][0];
    zombie.position.set(0, 0, 0);
    replica.spawn({ id: 1, type: 'normal', x: 0, y: 0, z: 0, yaw: 0, floor: 0, scale: 1, hp: 100, maxHp: 100, state: 'walk' });
    for (const side of [match.hostSide, match.guestSide]) {
      placePlayer(side.player);
      advance(side.player, input('KeyW'));
      expect(side.player.rig.position.z).toBeGreaterThanOrEqual(0.77);
      expect(side.player.rig.position.z).toBeLessThan(1);
    }
    replica.kill(1);
    advance(match.guestSide.player, input('KeyW'));
    expect(match.guestSide.player.rig.position.z).toBeLessThan(-3);
    match.host.onExit();
    match.guest.onExit();
  });
});
