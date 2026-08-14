import * as THREE from 'three';
import type { WindowBarrier } from './barriers/WindowBarrier';
import type { RoundConfig, ZombieHitPart } from './ZombieConfig';
import {
  computeDamage,
  MAX_ALIVE,
  splashDamageAt,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_ATTACK_RANGE,
  ZOMBIE_BARRIER_ATTACK_DAMAGE,
  ZOMBIE_BARRIER_ATTACK_RANGE,
  ZOMBIE_BASE_HP,
  ZOMBIE_BASE_SPEED,
  ZOMBIE_SCALE_JITTER,
  ZOMBIE_SEPARATION_RADIUS,
  ZOMBIE_SPEED_JITTER,
  ZOMBIE_WALK_JITTER,
} from './ZombieConfig';
import { Zombie } from './Zombie';
import { ZombiePool } from './ZombiePool';
import { ZombieSpawner } from './ZombieSpawner';
import {
  ZombieVisual,
  ZOMBIE_VARIANTS,
  type ZombieModelSource,
  type ZombieVariantId,
} from './ZombieVisual';
import { selectChainTargets } from './ZombieConfig';

const SEPARATION_PUSH = 2.2;

/** Horizontal body radius used for wall collision (torso capsule is 0.38). */
const ZOMBIE_BODY_RADIUS = 0.42;
/** How far ahead (as a fraction of the body radius) the front probe looks. */
const FRONT_PROBE = 1.3;
/**
 * While rounding an obstacle the zombie walks sideways along the wall at
 * this fraction of its speed — fast enough to clear corners promptly,
 * slow enough that the front probe can catch the corner before overshoot.
 */
const ROUND_SPEED_FACTOR = 0.85;
/** Surfaces solid enough to stop a walking body (targets are steel/paper). */
const BLOCKING_SURFACES: ReadonlySet<string> = new Set(['concrete', 'wood', 'metal']);
/** A collider blocks movement only if it is tall enough to matter… */
const MIN_OBSTACLE_HEIGHT = 0.5;
/** …and starts low enough (the roof at y≈3 must not block anyone). */
const MAX_OBSTACLE_BASE_Y = 1.2;
/** Ground/berm-scale boxes are walkable scenery, never obstacles. */
const MAX_OBSTACLE_FOOTPRINT = 20;

/** GLB payloads per variant, keyed by variant id. Missing keys fall back. */
export type ZombieModelSources = Partial<Record<ZombieVariantId, ZombieModelSource | null>>;

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
  private spawner: ZombieSpawner;
  private readonly rng: () => number;
  private colliders: THREE.Object3D[] = [];
  /** Static obstacle AABBs (walls, barriers, crates, posts) blocking movement. */
  private readonly obstacles: THREE.Box3[] = [];
  // Reused temporaries: no allocations in the per-frame steering loop.
  private readonly tmpToPlayer = new THREE.Vector3();
  private readonly tmpSeparation = new THREE.Vector3();
  private readonly tmpDelta = new THREE.Vector3();
  /**
   * Per-zombie obstacle-rounding state, keyed by the zombie (pool slots are
   * reused; spawn() leaves a stale, harmless entry). `rounding` is the
   * perpendicular side (±1 rotated from the to-player direction) the zombie
   * committed to when it hit a wall; null while it walks straight.
   */
  private readonly roundState = new Map<Zombie, { x: number; z: number }>();

  constructor(
    rng: () => number = Math.random,
    sources: ZombieModelSources = {},
    castShadows = true,
    spawnPoints: ReadonlyArray<readonly [number, number]> | null = null,
    private barriers: ReadonlyArray<WindowBarrier> = [],
  ) {
    this.rng = rng;
    this.spawner = new ZombieSpawner(rng, spawnPoints ?? undefined);
    this.pool = new ZombiePool(MAX_ALIVE, () => {
      // Every zombie is the small walker: the variant mix was dropped (no
      // large zombies), so the pool is 24 pre-cloned walker bodies with
      // zero runtime asset work when a round starts.
      const variant = ZOMBIE_VARIANTS.walker;
      const tint = variant.tints[Math.floor(rng() * variant.tints.length)];
      const zombie = new Zombie(
        new ZombieVisual('walker', sources.walker ?? null, tint, castShadows),
      );
      zombie.onDeathFinished = () => this.finishDeath(zombie);
      this.group.add(zombie.group);
      return zombie;
    });
  }

  /** The mutable collider array shared with ballistics (range + zombies). */
  registerColliders(colliders: THREE.Object3D[]): void {
    this.colliders = colliders;
    this.rebuildObstacles();
  }

  /** Replace spawn points when a new zone is unlocked. */
  setSpawnPoints(spawnPoints: ReadonlyArray<readonly [number, number]>): void {
    this.spawner = new ZombieSpawner(this.rng, spawnPoints);
  }

  /**
   * Snapshots the static obstacles out of the shared collider array. The
   * filters keep exactly the bulky, grounded, human-scale solids: walls,
   * barriers, crates and posts block; the ground, platform slab, bench top
   * and roof (wrong height/footprint), targets and zombie hitboxes (wrong
   * surface, and they join the array after this snapshot anyway) do not.
   */
  private rebuildObstacles(): void {
    this.obstacles.length = 0;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const object of this.colliders) {
      if (!BLOCKING_SURFACES.has(object.userData.surface as string)) continue;
      box.setFromObject(object);
      if (box.isEmpty()) continue;
      box.getSize(size);
      if (size.y < MIN_OBSTACLE_HEIGHT || box.min.y > MAX_OBSTACLE_BASE_Y) continue;
      if (size.x > MAX_OBSTACLE_FOOTPRINT || size.z > MAX_OBSTACLE_FOOTPRINT) continue;
      this.obstacles.push(box.clone());
    }
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
    // Cheap per-spawn variation: scale, ground speed and walk-cycle phase all
    // jitter so 24 zombies never read as synchronized clones.
    const jitter = (amount: number): number => 1 + (this.rng() * 2 - 1) * amount;
    zombie.group.scale.setScalar(jitter(ZOMBIE_SCALE_JITTER));
    zombie.visual.setWalkJitter(jitter(ZOMBIE_WALK_JITTER));
    zombie.spawn(
      x,
      z,
      Math.round(ZOMBIE_BASE_HP * config.healthMultiplier),
      ZOMBIE_BASE_SPEED * config.speedMultiplier * jitter(ZOMBIE_SPEED_JITTER),
    );
    zombie.barrierTarget = this.pickBarrierTarget();
    this.colliders.push(zombie.torsoHitbox, zombie.headHitbox);
    return true;
  }

  private pickBarrierTarget(): WindowBarrier | null {
    const candidates = this.barriers.filter((b) => !b.isOpen);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  /**
   * Bullet damage routed from the ballistics hit callback. Returns true when
   * the hit was LETHAL — the mode uses this to award the non-lethal hit
   * points only when the zombie survives, keeping hit and kill rewards
   * mutually exclusive for a single bullet.
   */
  damageZombie(
    zombie: Zombie,
    part: ZombieHitPart,
    baseDamage: number,
    headshotMultiplier: number,
  ): boolean {
    const damage = computeDamage(baseDamage, part, headshotMultiplier);
    if (zombie.applyDamage(damage, part === 'head')) {
      this.kill(zombie, part === 'head');
      return true;
    }
    return false;
  }

  /**
   * Tesla discharge: electrocutes the directly-hit zombie and chains the
   * charge to the nearest living zombies (selectChainTargets), never the
   * same one twice, at most CHAIN_MAX_TARGETS. Returns the electrocuted
   * zombies in arc order (impact first) so the view can draw the bolts.
   */
  applyChainLightning(impact: Zombie, damage: number): Zombie[] {
    // Snapshot living zombies once; the pure selection runs on plain data.
    const candidates: { id: number; x: number; z: number; alive: boolean }[] = [];
    const byId = new Map<number, Zombie>();
    let nextId = 0;
    for (const z of this.pool.actives) {
      if (!z.isAlive) continue;
      const id = nextId++;
      byId.set(id, z);
      candidates.push({ id, x: z.position.x, z: z.position.z, alive: true });
    }
    const impactId = [...byId.entries()].find(([, z]) => z === impact)?.[0];
    if (impactId === undefined) return [impact];
    const impactCandidate = candidates[impactId];

    const chainIds = selectChainTargets(impactCandidate, candidates);
    const chain: Zombie[] = [];
    for (const id of chainIds) {
      const zombie = byId.get(id);
      if (!zombie) continue;
      chain.push(zombie);
      if (zombie.applyDamage(damage)) this.kill(zombie, false);
    }
    return chain;
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
      zombie.visual.setOpacity(1);
      this.removeColliders(zombie);
    }
    this.pool.releaseAll();
  }

  private steer(zombie: Zombie, dt: number, playerX: number, playerZ: number): void {
    const target = zombie.barrierTarget;
    if (target && target.isOpen) zombie.barrierTarget = null;

    if (target) {
      zombie.faceTowards(target.position.x, target.position.z);
    } else {
      zombie.faceTowards(playerX, playerZ);
    }

    if (zombie.state !== 'walk') return;

    if (target) {
      const toBarrier = this.tmpToPlayer.set(
        target.position.x - zombie.position.x,
        0,
        target.position.z - zombie.position.z,
      );
      const barrierDistance = toBarrier.length();
      if (barrierDistance <= ZOMBIE_BARRIER_ATTACK_RANGE) {
        if (zombie.tryBarrierAttack()) {
          zombie.onAttackLanded = () => {
            target.damage(ZOMBIE_BARRIER_ATTACK_DAMAGE);
            if (target.isOpen) zombie.barrierTarget = null;
          };
        }
        return;
      }
      toBarrier.normalize();
      this.seek(zombie, dt, toBarrier, target.position.x, target.position.z);
      return;
    }

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

    toPlayer.normalize();
    this.seek(zombie, dt, toPlayer, playerX, playerZ);
  }

  private seek(
    zombie: Zombie,
    dt: number,
    toTarget: THREE.Vector3,
    targetX: number,
    targetZ: number,
  ): void {
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

    const pos = zombie.position;
    const distance = toTarget.length();
    const seekX = toTarget.x * zombie.speed + separation.x * SEPARATION_PUSH;
    const seekZ = toTarget.z * zombie.speed + separation.z * SEPARATION_PUSH;

    let rounding = this.roundState.get(zombie) ?? null;

    if (rounding === null) {
      // Walking straight: only a wall right ahead triggers rounding.
      const probeX = pos.x + toTarget.x * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      const probeZ = pos.z + toTarget.z * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      if (this.hitsObstacle(probeX, probeZ)) {
        // Commit to the wall TANGENT that shortens the path to the target.
        // The tangent is perpendicular to the approach direction; its sign
        // is chosen so walking it reduces the lateral gap to the target.
        const tanX = -toTarget.z;
        const tanZ = toTarget.x;
        const sign = tanX * (targetX - pos.x) + tanZ * (targetZ - pos.z) >= 0 ? 1 : -1;
        rounding = { x: tanX * sign, z: tanZ * sign };
        this.roundState.set(zombie, rounding);
      }
    } else if (this.lineOfSightClear(pos, targetX, targetZ, distance)) {
      // Rounding ends only when the straight path to the target is clear.
      // Checking the whole segment — not the immediate front — prevents
      // dropping the state at the corner's edge and re-entering it a meter
      // later, which read as jitter.
      this.roundState.delete(zombie);
      rounding = null;
    }

    if (rounding === null) {
      this.moveWithCollision(zombie, seekX * dt, seekZ * dt);
    } else {
      // Follow the wall tangent and nothing else: mixing the to-target
      // direction back in is what dragged zombies backwards off the wall on
      // diagonal approaches. The tangent is axis-aligned for the (axis-
      // aligned) range walls, so this slides cleanly along the face and
      // around the corner. Collision resolution still guarantees no entry.
      this.moveWithCollision(
        zombie,
        rounding.x * zombie.speed * ROUND_SPEED_FACTOR * dt,
        rounding.z * zombie.speed * ROUND_SPEED_FACTOR * dt,
      );
    }
  }

  /**
   * True when no obstacle intersects the straight segment from the zombie
   * to the player. Sampled at body-radius steps: cheap, and exact enough
   * for obstacles several times wider than the sample spacing.
   */
  private lineOfSightClear(
    pos: THREE.Vector3,
    targetX: number,
    targetZ: number,
    distance: number,
  ): boolean {
    const steps = Math.max(1, Math.ceil(distance / ZOMBIE_BODY_RADIUS));
    const stepX = ((targetX - pos.x) / distance) * (distance / steps);
    const stepZ = ((targetZ - pos.z) / distance) * (distance / steps);
    for (let i = 1; i <= steps; i++) {
      if (this.hitsObstacle(pos.x + stepX * i, pos.z + stepZ * i)) return false;
    }
    return true;
  }

  /**
   * Axis-separated integration: each axis is applied only if its target
   * spot is clear, so a blocked axis slides along the wall instead of
   * stopping the zombie dead. The position never enters an obstacle, which
   * means no tunneling, no corner cutting and no push-out vibration.
   */
  private moveWithCollision(zombie: Zombie, dx: number, dz: number): void {
    const pos = zombie.position;
    if (dx !== 0 && !this.hitsObstacle(pos.x + dx, pos.z)) pos.x += dx;
    if (dz !== 0 && !this.hitsObstacle(pos.x, pos.z + dz)) pos.z += dz;
  }

  /** Circle-vs-AABB test in XZ, with the body radius folded into the box. */
  private hitsObstacle(x: number, z: number): boolean {
    for (const box of this.obstacles) {
      if (
        x > box.min.x - ZOMBIE_BODY_RADIUS &&
        x < box.max.x + ZOMBIE_BODY_RADIUS &&
        z > box.min.z - ZOMBIE_BODY_RADIUS &&
        z < box.max.z + ZOMBIE_BODY_RADIUS
      ) {
        return true;
      }
    }
    return false;
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
