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

  it('does not damage a zombie on another floor at the same XZ position', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    zombie.floor = 1;
    zombie.position.set(0, 3.4, -20);

    manager.applySplash(new THREE.Vector3(0, 1, -20), 2.5, 100);

    expect(zombie.hp).toBe(ZOMBIE_BASE_HP);
  });
});

describe('ZombieManager wall collisions', () => {
  /** Solid box collider like the range walls (concrete by default). */
  function makeWall(
    x: number,
    z: number,
    width: number,
    depth: number,
    surface = 'concrete',
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.3, depth));
    mesh.position.set(x, 1.15, z);
    mesh.userData.surface = surface;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function onlyZombie(manager: ZombieManager): Zombie {
    return [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
  }

  it('walls are never penetrated, but a wide wall gets rounded', () => {
    const colliders: THREE.Object3D[] = [makeWall(0, -10, 10, 0.4)];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -14); // straight line to the player goes through the wall

    // Every frame: the body must NEVER enter the wall box (radius folded in).
    // The old contract asserted the zombie stayed pressed against the wall
    // forever — that frozen push IS the stuck bug this fixes. The new
    // contract: the zombie rounds the wall and reaches the player's side,
    // while never clipping through the geometry at any point.
    const frames = Math.round(8 / DT);
    for (let i = 0; i < frames; i++) {
      manager.update(DT, 0, 4);
      const inX = zombie.position.x > -5.21 && zombie.position.x < 5.21;
      const inZ = zombie.position.z > -10.41 && zombie.position.z < -9.59;
      expect(inX && inZ).toBe(false);
    }
    // Rounded: the straight-line distance to the player shrank far more
    // than the wall's depth alone could account for by pressing.
    expect(Math.hypot(zombie.position.x - 0, zombie.position.z - 4)).toBeLessThan(16);
  });

  it('slides along the wall and rounds the edge instead of getting stuck', () => {
    // Narrow wall covering x ∈ [0, 3]; player offset to the left so the
    // slide direction reaches the wall's left edge.
    const colliders: THREE.Object3D[] = [makeWall(1.5, -10, 3, 0.4)];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), -3, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(2.5, 0, -14);

    const frames = Math.round(20 / DT);
    for (let i = 0; i < frames; i++) {
      manager.update(DT, -3, 4);
      // Pressing against the wall face is legal; penetrating more than half
      // the body radius into the actual wall box (x ∈ [0,3], z ∈ [-10.2,-9.8])
      // is not: that would mean corner cutting or tunneling.
      const inX = zombie.position.x > -0.21 && zombie.position.x < 3.21;
      const inZ = zombie.position.z > -10.41 && zombie.position.z < -9.59;
      expect(inX && inZ).toBe(false);
    }
    // Rounded the edge and kept walking towards the player.
    expect(zombie.position.z).toBeGreaterThan(-9.5);
  });

  it('ignores non-blocking colliders (thin platforms, steel targets)', () => {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.16, 11));
    platform.position.set(0, 0.08, 3.5);
    platform.userData.surface = 'concrete';
    platform.updateMatrixWorld(true);
    const target = makeWall(0, -12, 1, 0.1, 'steel');
    const colliders: THREE.Object3D[] = [platform, target];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -16);

    step(manager, 6);

    // Walked straight through both: distance to the player shrank a lot.
    expect(zombie.position.z).toBeGreaterThan(-10);
  });
});
