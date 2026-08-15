import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone } from '../player/PlayerController';
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
import type { ZombieSpawnDefinition } from './ZombieSpawner';
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
const TURN_SPEED = 5.5;
const WAYPOINT_EPSILON = 0.16;
const STUCK_CHECK_INTERVAL = 1.5;
const STUCK_MIN_PROGRESS = 0.14;
/** Surfaces solid enough to stop a walking body (targets are steel/paper). */
const BLOCKING_SURFACES: ReadonlySet<string> = new Set(['concrete', 'wood', 'metal']);
/** A collider blocks movement only if it is tall enough to matter. */
const MIN_OBSTACLE_HEIGHT = 0.5;
/** Ground/berm-scale boxes are walkable scenery, never obstacles. */
const MAX_OBSTACLE_FOOTPRINT = 20;

/** GLB payloads per variant, keyed by variant id. Missing keys fall back. */
export type ZombieModelSources = Partial<Record<ZombieVariantId, ZombieModelSource | null>>;

interface EntryRoute {
  readonly barrierId: string;
  readonly approachX: number;
  readonly approachZ: number;
  readonly breachX: number;
  readonly breachZ: number;
  stage: 'approach' | 'breach';
}

interface StuckState {
  x: number;
  z: number;
  elapsed: number;
  recoveries: number;
}

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
  private readonly entryRoutes = new Map<Zombie, EntryRoute>();
  private readonly stuckState = new Map<Zombie, StuckState>();
  private recoveryCount = 0;

  constructor(
    rng: () => number = Math.random,
    sources: ZombieModelSources = {},
    castShadows = true,
    spawnPoints: ReadonlyArray<ZombieSpawnDefinition> | null = null,
    private barriers: ReadonlyArray<WindowBarrier> = [],
    private readonly floorTransitions: ReadonlyArray<FloorTransitionZone> = [],
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
  setSpawnPoints(spawnPoints: ReadonlyArray<ZombieSpawnDefinition>): void {
    this.spawner = new ZombieSpawner(this.rng, spawnPoints);
  }

  /** Replace the barriers eligible for newly spawned zombies after a zone unlock. */
  setBarriers(barriers: ReadonlyArray<WindowBarrier>): void {
    this.barriers = barriers;
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
      if (size.y < MIN_OBSTACLE_HEIGHT) continue;
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

  get stuckRecoveryCount(): number {
    return this.recoveryCount;
  }

  /** Spawns one zombie for the round; false when the pool is exhausted. */
  spawnZombie(config: RoundConfig, playerX: number, playerZ: number): boolean {
    const zombie = this.pool.acquire();
    if (!zombie) return false;
    const spawn = this.spawner.pickSpawn(playerX, playerZ);
    this.roundState.delete(zombie);
    this.stuckState.delete(zombie);
    // Cheap per-spawn variation: scale, ground speed and walk-cycle phase all
    // jitter so 24 zombies never read as synchronized clones.
    const jitter = (amount: number): number => 1 + (this.rng() * 2 - 1) * amount;
    zombie.group.scale.setScalar(jitter(ZOMBIE_SCALE_JITTER));
    zombie.visual.setWalkJitter(jitter(ZOMBIE_WALK_JITTER));
    zombie.spawn(
      spawn.x,
      spawn.z,
      Math.round(ZOMBIE_BASE_HP * config.healthMultiplier),
      ZOMBIE_BASE_SPEED * config.speedMultiplier * jitter(ZOMBIE_SPEED_JITTER),
    );
    const assignedBarrier = spawn.barrierId
      ? this.barriers.find((barrier) => barrier.id === spawn.barrierId) ?? null
      : null;
    zombie.barrierTarget = assignedBarrier && !assignedBarrier.isOpen
      ? assignedBarrier
      : this.pickBarrierTarget(zombie.floor);
    if (
      spawn.barrierId &&
      spawn.approachX !== undefined &&
      spawn.approachZ !== undefined &&
      spawn.breachX !== undefined &&
      spawn.breachZ !== undefined
    ) {
      this.entryRoutes.set(zombie, {
        barrierId: spawn.barrierId,
        approachX: spawn.approachX,
        approachZ: spawn.approachZ,
        breachX: spawn.breachX,
        breachZ: spawn.breachZ,
        stage: 'approach',
      });
    } else {
      this.entryRoutes.delete(zombie);
    }
    this.colliders.push(zombie.torsoHitbox, zombie.headHitbox);
    return true;
  }

  private pickBarrierTarget(floor: number): WindowBarrier | null {
    const candidates = this.barriers.filter((barrier) => !barrier.isOpen && barrier.floor === floor);
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
      if (z.floor !== impact.floor) continue;
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
      if (Math.abs(zombie.position.y - center.y) > 2) continue;
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

  update(dt: number, playerX: number, playerZ: number, playerFloor = 0): void {
    for (const zombie of this.pool.actives) {
      if (zombie.isAlive) {
        this.steer(zombie, dt, playerX, playerZ, playerFloor);
        this.applyFloorTransition(zombie);
        this.updateStuckRecovery(zombie, dt, playerX, playerZ, playerFloor);
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
    this.roundState.clear();
    this.entryRoutes.clear();
    this.stuckState.clear();
    this.recoveryCount = 0;
  }

  private updateStuckRecovery(
    zombie: Zombie,
    dt: number,
    playerX: number,
    playerZ: number,
    playerFloor: number,
  ): void {
    if (zombie.state !== 'walk') {
      this.stuckState.delete(zombie);
      return;
    }

    let targetX = playerX;
    let targetZ = playerZ;
    const route = this.entryRoutes.get(zombie);
    if (route) {
      targetX = route.stage === 'approach' ? route.approachX : route.breachX;
      targetZ = route.stage === 'approach' ? route.approachZ : route.breachZ;
    } else if (zombie.barrierTarget && !zombie.barrierTarget.isOpen) {
      targetX = zombie.barrierTarget.position.x;
      targetZ = zombie.barrierTarget.position.z;
    } else if (zombie.floor !== playerFloor) {
      const portal = this.floorTransitions.find(
        (transition) => transition.sourceFloor === zombie.floor && transition.targetFloor === playerFloor,
      );
      if (!portal) return;
      const center = portal.box.getCenter(this.tmpDelta);
      targetX = center.x;
      targetZ = center.z;
    }

    if (Math.hypot(targetX - zombie.position.x, targetZ - zombie.position.z) <= ZOMBIE_ATTACK_RANGE) {
      this.stuckState.delete(zombie);
      return;
    }

    let state = this.stuckState.get(zombie);
    if (!state) {
      state = { x: zombie.position.x, z: zombie.position.z, elapsed: 0, recoveries: 0 };
      this.stuckState.set(zombie, state);
    }
    state.elapsed += dt;
    if (state.elapsed < STUCK_CHECK_INTERVAL) return;

    const progress = Math.hypot(zombie.position.x - state.x, zombie.position.z - state.z);
    state.x = zombie.position.x;
    state.z = zombie.position.z;
    state.elapsed = 0;
    if (progress >= STUCK_MIN_PROGRESS) {
      state.recoveries = 0;
      return;
    }

    const dx = targetX - zombie.position.x;
    const dz = targetZ - zombie.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = state.recoveries % 2 === 0 ? 1 : -1;
    this.roundState.set(zombie, { x: (-dz / length) * side, z: (dx / length) * side });
    state.recoveries++;
    this.recoveryCount++;
  }

  private steer(zombie: Zombie, dt: number, playerX: number, playerZ: number, playerFloor: number): void {
    if (this.followEntryRoute(zombie, dt)) return;
    const target = zombie.barrierTarget;
    if (target && target.isOpen) zombie.barrierTarget = null;

    if (target) {
      zombie.faceTowards(target.position.x, target.position.z, TURN_SPEED * dt);
    } else {
      zombie.faceTowards(playerX, playerZ, TURN_SPEED * dt);
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

    if (zombie.floor !== playerFloor) {
      const portal = this.floorTransitions.find(
        (transition) => transition.sourceFloor === zombie.floor && transition.targetFloor === playerFloor,
      );
      if (portal) {
        const center = portal.box.getCenter(this.tmpToPlayer);
        zombie.faceTowards(center.x, center.z, TURN_SPEED * dt);
        const toPortal = this.tmpToPlayer.set(center.x - zombie.position.x, 0, center.z - zombie.position.z);
        if (toPortal.lengthSq() > 0.01) {
          toPortal.normalize();
          this.seek(zombie, dt, toPortal, center.x, center.z);
        }
      }
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
      if (other === zombie || !other.isAlive || other.floor !== zombie.floor) continue;
      const delta = this.tmpDelta.copy(zombie.position).sub(other.position);
      delta.y = 0;
      const distSq = delta.lengthSq();
      if (distSq < 1e-6 || distSq > ZOMBIE_SEPARATION_RADIUS * ZOMBIE_SEPARATION_RADIUS) continue;
      const dist = Math.sqrt(distSq);
      separation.addScaledVector(delta.multiplyScalar(1 / dist), ZOMBIE_SEPARATION_RADIUS - dist);
    }

    const pos = zombie.position;
    const distance = Math.hypot(targetX - pos.x, targetZ - pos.z);
    const seekX = toTarget.x * zombie.speed + separation.x * SEPARATION_PUSH;
    const seekZ = toTarget.z * zombie.speed + separation.z * SEPARATION_PUSH;

    let rounding = this.roundState.get(zombie) ?? null;

    if (rounding === null) {
      // Walking straight: only a wall right ahead triggers rounding.
      const probeX = pos.x + toTarget.x * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      const probeZ = pos.z + toTarget.z * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      const obstacle = this.findObstacle(probeX, probeZ, zombie.position.y);
      if (obstacle) {
        const tanX = -toTarget.z;
        const tanZ = toTarget.x;
        const sign = tanX * (targetX - pos.x) + tanZ * (targetZ - pos.z) >= 0 ? 1 : -1;
        rounding = { x: tanX * sign, z: tanZ * sign };
        this.roundState.set(zombie, rounding);
      }
    } else if (this.lineOfSightClear(zombie, targetX, targetZ, distance)) {
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
    zombie: Zombie,
    targetX: number,
    targetZ: number,
    distance: number,
  ): boolean {
    const pos = zombie.position;
    const steps = Math.max(1, Math.ceil(distance / ZOMBIE_BODY_RADIUS));
    const stepX = ((targetX - pos.x) / distance) * (distance / steps);
    const stepZ = ((targetZ - pos.z) / distance) * (distance / steps);
    for (let i = 1; i <= steps; i++) {
      if (this.hitsObstacle(pos.x + stepX * i, pos.z + stepZ * i, pos.y)) return false;
    }
    return true;
  }

  /**
   * Axis-separated integration: each axis is applied only if its target
   * spot is clear, so a blocked axis slides along the wall instead of
   * stopping the zombie dead. The position never enters an obstacle, which
   * means no tunneling, no corner cutting and no push-out vibration.
   */
  private moveWithCollision(zombie: Zombie, dx: number, dz: number): boolean {
    const pos = zombie.position;
    let moved = false;
    if (dx !== 0 && !this.hitsObstacle(pos.x + dx, pos.z, pos.y)) {
      pos.x += dx;
      moved = true;
    }
    if (dz !== 0 && !this.hitsObstacle(pos.x, pos.z + dz, pos.y)) {
      pos.z += dz;
      moved = true;
    }
    return moved;
  }

  private followEntryRoute(zombie: Zombie, dt: number): boolean {
    const route = this.entryRoutes.get(zombie);
    if (!route) return false;
    const barrier = this.barriers.find((candidate) => candidate.id === route.barrierId) ?? null;

    if (route.stage === 'approach') {
      const dx = route.approachX - zombie.position.x;
      const dz = route.approachZ - zombie.position.z;
      if (dx * dx + dz * dz > WAYPOINT_EPSILON * WAYPOINT_EPSILON) {
        zombie.faceTowards(route.approachX, route.approachZ, TURN_SPEED * dt);
        if (zombie.state === 'walk') {
          const direction = this.tmpToPlayer.set(dx, 0, dz).normalize();
          this.seek(zombie, dt, direction, route.approachX, route.approachZ);
        }
        return true;
      }

      if (barrier && !barrier.isOpen) {
        zombie.faceTowards(barrier.position.x, barrier.position.z, TURN_SPEED * dt);
        if (zombie.state === 'walk' && zombie.tryBarrierAttack()) {
          zombie.onAttackLanded = () => barrier.damage(ZOMBIE_BARRIER_ATTACK_DAMAGE);
        }
        return true;
      }
      route.stage = 'breach';
      zombie.barrierTarget = null;
      this.roundState.delete(zombie);
    }

    const dx = route.breachX - zombie.position.x;
    const dz = route.breachZ - zombie.position.z;
    if (dx * dx + dz * dz <= WAYPOINT_EPSILON * WAYPOINT_EPSILON) {
      this.entryRoutes.delete(zombie);
      this.roundState.delete(zombie);
      return false;
    }
    zombie.faceTowards(route.breachX, route.breachZ, TURN_SPEED * dt);
    if (zombie.state === 'walk') {
      const direction = this.tmpToPlayer.set(dx, 0, dz).normalize();
      this.seek(zombie, dt, direction, route.breachX, route.breachZ);
    }
    return true;
  }

  /** Circle-vs-AABB test in XZ, with the body radius folded into the box. */
  private hitsObstacle(x: number, z: number, y: number): boolean {
    return this.findObstacle(x, z, y) !== null;
  }

  private findObstacle(x: number, z: number, y: number): THREE.Box3 | null {
    for (const box of this.obstacles) {
      if (
        box.max.y > y + 0.05 &&
        box.min.y < y + 1.8 &&
        x > box.min.x - ZOMBIE_BODY_RADIUS &&
        x < box.max.x + ZOMBIE_BODY_RADIUS &&
        z > box.min.z - ZOMBIE_BODY_RADIUS &&
        z < box.max.z + ZOMBIE_BODY_RADIUS
      ) {
        return box;
      }
    }
    return null;
  }

  private applyFloorTransition(zombie: Zombie): void {
    for (const transition of this.floorTransitions) {
      if (transition.sourceFloor !== zombie.floor || !transition.box.containsPoint(zombie.position)) continue;
      zombie.floor = transition.targetFloor;
      zombie.position.y = transition.targetY - EYE_HEIGHT;
      if (transition.targetX !== undefined) zombie.position.x = transition.targetX;
      if (transition.targetZ !== undefined) zombie.position.z = transition.targetZ;
      this.roundState.delete(zombie);
      return;
    }
  }

  private kill(zombie: Zombie, headshot: boolean): void {
    // The falling body must stop blocking bullets immediately.
    this.removeColliders(zombie);
    this.onZombieKilled?.(zombie, headshot);
  }

  private finishDeath(zombie: Zombie): void {
    this.entryRoutes.delete(zombie);
    this.roundState.delete(zombie);
    this.stuckState.delete(zombie);
    this.pool.release(zombie);
  }

  private removeColliders(zombie: Zombie): void {
    for (const hitbox of [zombie.torsoHitbox, zombie.headHitbox]) {
      const index = this.colliders.indexOf(hitbox);
      if (index >= 0) this.colliders.splice(index, 1);
    }
  }
}
