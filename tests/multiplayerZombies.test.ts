import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZombieNetState } from '../src/network/Protocol';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { roundConfig, ZOMBIE_ATTACK_DAMAGE } from '../src/zombies/ZombieConfig';
import { ZombieManager, type ZombieTargetId } from '../src/zombies/ZombieManager';
import { ZombieReplica } from '../src/zombies/ZombieReplica';

function netState(overrides: Partial<ZombieNetState> = {}): ZombieNetState {
  return {
    id: 7, type: 'normal', x: 0, y: 0, z: -4, yaw: 0, floor: 0, scale: 1,
    hp: 100, maxHp: 100, state: 'walk', ...overrides,
  };
}

function landAttack(hostX: number, hostZ: number, hostAlive: boolean,
  guest: { x: number; z: number } | null, zombieAt: { x: number; z: number }): ZombieTargetId[] {
  const manager = new ZombieManager(() => 0, {}, false, [[0, -20]]);
  manager.registerColliders([]);
  expect(manager.spawnZombie(roundConfig(1), 0, 7)).toBe(true);
  const zombie = [...manager.actives][0];
  zombie.state = 'walk';
  zombie.position.set(zombieAt.x, 0, zombieAt.z);
  const targets: ZombieTargetId[] = [];
  manager.onPlayerAttack = (damage, target) => {
    expect(damage).toBe(ZOMBIE_ATTACK_DAMAGE);
    targets.push(target ?? 'host');
  };
  for (let i = 0; i < 120 && targets.length === 0; i++) {
    manager.update(1 / 60, hostX, hostZ, 0, EYE_HEIGHT, 0, -1,
      guest ? [{ id: 'guest', x: guest.x, y: EYE_HEIGHT, z: guest.z, floor: 0 }] : [], hostAlive);
  }
  return targets;
}

describe('co-op zombie authority', () => {
  it('targets whichever living player is nearest and damages only that player', () => {
    expect(landAttack(0, 7, true, { x: 2, z: 4 }, { x: 2.4, z: 4 })).toEqual(['guest']);
    expect(landAttack(2, 4, true, { x: 0, z: 12 }, { x: 2.4, z: 4 })).toEqual(['host']);
  });

  it('retargets away from a dead host and from a guest that is gone', () => {
    expect(landAttack(2, 4, false, { x: 2.3, z: 4.2 }, { x: 2.6, z: 4 })).toEqual(['guest']);
    expect(landAttack(2, 4, true, null, { x: 2.4, z: 4 })).toEqual(['host']);
  });

  it('gives every spawn a fresh network id even when a pool slot is reused', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]]);
    manager.registerColliders([]);
    const spawned: number[] = [];
    manager.onZombieSpawned = (zombie) => spawned.push(manager.networkIdOf(zombie));
    manager.spawnZombie(roundConfig(1), 0, 7);
    manager.reset();
    manager.spawnZombie(roundConfig(1), 0, 7);
    expect(spawned).toHaveLength(2);
    expect(spawned[0]).not.toBe(spawned[1]);
    expect(manager.findByNetworkId(spawned[0])).toBeNull();
  });
});

describe('zombie replica', () => {
  it('spawns from host events, registers hitboxes and never runs its own AI', () => {
    const colliders: THREE.Object3D[] = [];
    const replica = new ZombieReplica({}, false, colliders);
    replica.spawn(netState());
    expect(replica.aliveCount).toBe(1);
    expect(colliders).toHaveLength(2);
    const body = colliders[0].userData.zombie;
    replica.update(1);
    // Without host samples the body stays where the host put it.
    expect(body.position.z).toBeCloseTo(-4);
    expect(replica.networkIdOf(body)).toBe(7);
  });

  it('interpolates between host snapshots instead of snapping', () => {
    const colliders: THREE.Object3D[] = [];
    const replica = new ZombieReplica({}, false, colliders);
    replica.applyStates(10, [netState({ x: 0 })]);
    replica.applyStates(10.1, [netState({ x: 1 })]);
    const body = colliders[0].userData.zombie;
    replica.update(1 / 60);
    expect(body.position.x).toBeGreaterThanOrEqual(0);
    expect(body.position.x).toBeLessThanOrEqual(1);
  });

  it('plays the host death once, drops hitboxes and ignores later hits', () => {
    const colliders: THREE.Object3D[] = [];
    const replica = new ZombieReplica({}, false, colliders);
    replica.spawn(netState());
    const body = colliders[0].userData.zombie;
    replica.kill(7);
    replica.kill(7);
    replica.hit(7, true, 30, 0, 0);
    expect(body.state).toBe('death');
    expect(colliders).toHaveLength(0);
    expect(replica.aliveCount).toBe(0);
    expect(replica.networkIdOf(body)).toBeNull();
    for (let i = 0; i < 400; i++) replica.update(0.05);
    expect(body.group.visible).toBe(false);
  });

  it('despawns bodies the host no longer reports and never resurrects dead ids', () => {
    const colliders: THREE.Object3D[] = [];
    const replica = new ZombieReplica({}, false, colliders);
    replica.applyStates(1, [netState({ id: 1 }), netState({ id: 2 })]);
    expect(replica.aliveCount).toBe(2);
    replica.applyStates(1.1, [netState({ id: 2 }), netState({ id: 3, state: 'death' })]);
    expect(replica.aliveCount).toBe(1);
    expect(colliders).toHaveLength(2);
  });
});
