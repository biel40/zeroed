import * as THREE from 'three';
import type { RoundConfig, ZombieHitPart } from './ZombieConfig';
import {
  computeDamage,
  MAX_ALIVE,
  splashDamageAt,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_ATTACK_RANGE,
  ZOMBIE_BASE_HP,
  ZOMBIE_BASE_SPEED,
  ZOMBIE_SEPARATION_RADIUS,
} from './ZombieConfig';
import { Zombie } from './Zombie';
import { ZombiePool } from './ZombiePool';
import { ZombieSpawner } from './ZombieSpawner';

const SEPARATION_PUSH = 2.2;

/**
 * Owns the zombie population: pooling, spawning, steering (seek + soft
 * neighbor separation), attacks and damage. The shared collider array is
 * mutated on spawn/death so the existing BallisticsSystem and the Ray Gun
 * projectiles hit zombies with zero changes to the shooting layer.
 */
export class ZombieManager {
  readonly group = new THREE.Group();

  onZombieKilled: ((zombie: Zombie, headshot: boolean) => void) | null = null;
  onPlayerAttack: ((damage: number) => void) | null = null;

  private readonly pool: ZombiePool;
  private readonly spawner: ZombieSpawner;
  private colliders: THREE.Object3D[] = [];

  // Reused temporaries: no allocations in the per-frame steering loop.
  private readonly tmpToPlayer = new THREE.Vector3();
  private readonly tmpSeparation = new THREE.Vector3();
  private readonly tmpDelta = new THREE.Vector3();

  constructor(rng: () => number = Math.random) {
    this.spawner = new ZombieSpawner(rng);
    this.pool = new ZombiePool(MAX_ALIVE, () => {
      const zombie = new Zombie();
      zombie.onDeathFinished = () => this.finishDeath(zombie);
      this.group.add(zombie.group);
      return zombie;
    });
  }

  /** The mutable collider array shared with ballistics (range + zombies). */
  registerColliders(colliders: THREE.Object3D[]): void {
    this.colliders = colliders;
  }

  get aliveCount(): number {
    let count = 0;
    for (const zombie of this.pool.actives) if (zombie.isAlive) count++;
    return count;
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** Spawns one zombie for the round; false when the pool is exhausted. */
  spawnZombie(config: RoundConfig, playerX: number, playerZ: number): boolean {
    const zombie = this.pool.acquire();
    if (!zombie) return false;
    const [x, z] = this.spawner.pick(playerX, playerZ);
    zombie.spawn(
      x,
      z,
      Math.round(ZOMBIE_BASE_HP * config.healthMultiplier),
      ZOMBIE_BASE_SPEED * config.speedMultiplier,
    );
    this.colliders.push(zombie.torsoHitbox, zombie.headHitbox);
    return true;
  }

  /** Bullet damage routed from the ballistics hit callback. */
  damageZombie(
    zombie: Zombie,
    part: ZombieHitPart,
    baseDamage: number,
    headshotMultiplier: number,
  ): void {
    const damage = computeDamage(baseDamage, part, headshotMultiplier);
    if (zombie.applyDamage(damage)) this.kill(zombie, part === 'head');
  }

  /** Ray Gun splash: linear falloff around the impact point, XZ distance. */
  applySplash(center: THREE.Vector3, radius: number, splashDamage: number): void {
    for (const zombie of this.pool.actives) {
      if (!zombie.isAlive) continue;
      // Horizontal distance only: arcade splash should not punish zombies
      // for the impact happening at torso height instead of at their feet.
      const dx = zombie.position.x - center.x;
      const dz = zombie.position.z - center.z;
      const damage = splashDamageAt(splashDamage, Math.hypot(dx, dz), radius);
      if (damage <= 0) continue;
      // applyDamage already triggers the red hit flash.
      if (zombie.applyDamage(damage)) this.kill(zombie, false);
    }
  }

  update(dt: number, playerX: number, playerZ: number): void {
    for (const zombie of this.pool.actives) {
      if (zombie.isAlive) {
        this.steer(zombie, dt, playerX, playerZ);
      }
      zombie.update(dt);
    }
  }

  /** Game over / restart: every zombie vanishes back into the pool. */
  reset(): void {
    for (const zombie of this.pool.actives) {
      zombie.group.visible = false;
      zombie.state = 'death'; // not alive; prevents stale attack callbacks
      this.removeColliders(zombie);
    }
    this.pool.releaseAll();
  }

  private steer(zombie: Zombie, dt: number, playerX: number, playerZ: number): void {
    zombie.faceTowards(playerX, playerZ);
    if (zombie.state !== 'walk') return;

    const toPlayer = this.tmpToPlayer.set(
      playerX - zombie.position.x,
      0,
      playerZ - zombie.position.z,
    );
    const distance = toPlayer.length();

    if (distance <= ZOMBIE_ATTACK_RANGE) {
      if (zombie.tryAttack()) {
        zombie.onAttackLanded = () => this.onPlayerAttack?.(ZOMBIE_ATTACK_DAMAGE);
      }
      return;
    }

    toPlayer.normalize().multiplyScalar(zombie.speed);

    // Soft neighbor separation so the horde never stacks into one body.
    const separation = this.tmpSeparation.set(0, 0, 0);
    for (const other of this.pool.actives) {
      if (other === zombie || !other.isAlive) continue;
      const delta = this.tmpDelta.copy(zombie.position).sub(other.position);
      delta.y = 0;
      const distSq = delta.lengthSq();
      if (distSq < 1e-6 || distSq > ZOMBIE_SEPARATION_RADIUS * ZOMBIE_SEPARATION_RADIUS) continue;
      const dist = Math.sqrt(distSq);
      separation.addScaledVector(delta.multiplyScalar(1 / dist), ZOMBIE_SEPARATION_RADIUS - dist);
    }

    zombie.position.x += (toPlayer.x + separation.x * SEPARATION_PUSH) * dt;
    zombie.position.z += (toPlayer.z + separation.z * SEPARATION_PUSH) * dt;
  }

  private kill(zombie: Zombie, headshot: boolean): void {
    // The falling body must stop blocking bullets immediately.
    this.removeColliders(zombie);
    this.onZombieKilled?.(zombie, headshot);
  }

  private finishDeath(zombie: Zombie): void {
    this.pool.release(zombie);
  }

  private removeColliders(zombie: Zombie): void {
    for (const hitbox of [zombie.torsoHitbox, zombie.headHitbox]) {
      const index = this.colliders.indexOf(hitbox);
      if (index >= 0) this.colliders.splice(index, 1);
    }
  }
}
