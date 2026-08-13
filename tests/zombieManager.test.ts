import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_ALIVE,
  roundConfig,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_BASE_HP,
} from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { Zombie } from '../src/zombies/Zombie';

const DT = 1 / 60;

function makeManager(): { manager: ZombieManager; colliders: THREE.Object3D[] } {
  const manager = new ZombieManager(() => 0); // deterministic spawn picks
  const colliders: THREE.Object3D[] = [];
  manager.registerColliders(colliders);
  return { manager, colliders };
}

function step(manager: ZombieManager, seconds: number, px = 0, pz = 4): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) manager.update(DT, px, pz);
}

describe('ZombieManager spawning and pooling', () => {
  it('spawns a zombie, registers its hitboxes and scales stats by round', () => {
    const { manager, colliders } = makeManager();
    expect(manager.spawnZombie(roundConfig(1), 0, 4)).toBe(true);
    expect(manager.activeCount).toBe(1);
    expect(manager.aliveCount).toBe(1);
    expect(colliders).toHaveLength(2); // torso + head
  });

  it('never exceeds the alive cap even if asked to spawn more', () => {
    const { manager } = makeManager();
    let spawned = 0;
    for (let i = 0; i < MAX_ALIVE + 10; i++) {
      if (manager.spawnZombie(roundConfig(50), 0, 4)) spawned++;
    }
    expect(spawned).toBe(MAX_ALIVE);
    expect(manager.aliveCount).toBe(MAX_ALIVE);
  });

  it('reset releases every zombie and unregisters all hitboxes', () => {
    const { manager, colliders } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.reset();
    expect(manager.activeCount).toBe(0);
    expect(manager.aliveCount).toBe(0);
    expect(colliders).toHaveLength(0);
  });
});

describe('ZombieManager movement', () => {
  it('zombies walk towards the player', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    const initialDistance = Math.hypot(zombie.position.x - 0, zombie.position.z - 4);
    step(manager, 3);
    const finalDistance = Math.hypot(zombie.position.x - 0, zombie.position.z - 4);
    expect(finalDistance).toBeLessThan(initialDistance - 2);
  });

  it('neighboring zombies separate instead of stacking', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const actives = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives];
    // Force them nearly on top of each other, converging on the same player spot.
    actives[0].position.set(0.2, 0, -15);
    actives[1].position.set(-0.2, 0, -15);
    const before = actives[0].position.distanceTo(actives[1].position);
    expect(before).toBeCloseTo(0.4);
    step(manager, 3);
    const after = actives[0].position.distanceTo(actives[1].position);
    // Separation pushes them apart towards the separation radius (1.15 m)
    // even while both converge on the player.
    expect(after).toBeGreaterThan(0.9);
  });

  it('attacks the player when in range and deals damage at the hit moment', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    zombie.position.set(0.4, 0, 4); // inside attack range

    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };
    // Spawn rise (1.1 s) + wind-up (0.45 s) → exactly one hit in 2 seconds.
    step(manager, 2);
    expect(damage).toBe(ZOMBIE_ATTACK_DAMAGE);
  });
});

describe('ZombieManager damage', () => {
  it('applies torso and headshot damage through the shared math', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];

    manager.damageZombie(zombie, 'torso', 34, 2);
    expect(zombie.hp).toBe(ZOMBIE_BASE_HP - 34);
    manager.damageZombie(zombie, 'head', 34, 2);
    expect(zombie.hp).toBe(ZOMBIE_BASE_HP - 34 - 68);
  });

  it('kills unregister hitboxes and report the headshot flag', () => {
    const { manager, colliders } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];

    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);

    manager.damageZombie(zombie, 'head', 150, 3); // 450 >> 100 hp
    expect(kills).toEqual([true]);
    expect(colliders).toHaveLength(0);
    expect(manager.aliveCount).toBe(0);
    // Still active (playing the death sequence) until it finishes.
    expect(manager.activeCount).toBe(1);
    step(manager, 3.6);
    expect(manager.activeCount).toBe(0);
  });

  it('headshot flag is false for torso kills', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);
    manager.damageZombie(zombie, 'torso', 200, 2);
    expect(kills).toEqual([false]);
  });
});

describe('ZombieManager splash damage (Ray Gun)', () => {
  it('damages zombies inside the radius with falloff and spares the rest', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [a, b, c] = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives];
    const center = new THREE.Vector3(0, 1, -20);
    a.position.set(0, 0, -20); // epicenter: 100 dmg → dead
    b.position.set(1.25, 0, -20); // half radius: 50 dmg → survives
    c.position.set(10, 0, -20); // outside: untouched

    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);

    manager.applySplash(center, 2.5, 100);

    expect(a.isAlive).toBe(false);
    expect(b.hp).toBe(50);
    expect(c.hp).toBe(ZOMBIE_BASE_HP);
    expect(kills).toEqual([false]); // splash kills are not headshots
  });
});
