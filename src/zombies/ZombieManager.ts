import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone } from '../player/PlayerController';
import type { WindowBarrier } from './barriers/WindowBarrier';
import type { ZombieNavigationBounds } from './maps/ZombieArena';
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
import { MIN_PLAYER_DISTANCE, ZombieSpawner } from './ZombieSpawner';
import type { ZombieSpawnDefinition, ZombieSpawnPoint } from './ZombieSpawner';
import {
  ZombieVisual,
  ZOMBIE_VARIANTS,
  type ZombieModelSource,
  type ZombieVariantId,
} from './ZombieVisual';
import { selectChainTargets } from './ZombieConfig';

const SEPARATION_PUSH = 2.2;
const MAX_SEPARATION_SPEED_FACTOR = 0.65;
const MAX_MOVE_SPEED_FACTOR = 1.15;

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
const STUCK_MIN_PROGRESS = 0.2;
const STUCK_NUDGE_AFTER = 4.5;
const STUCK_RELOCATE_AFTER = 9;
const RECOVERY_GRID_SIZE = 0.7;
const RECOVERY_GRID_MARGIN = 6;
const RECOVERY_GRID_MAX_CELLS = 6000;
const RECOVERY_WAYPOINT_EPSILON = 0.3;
const MOVEMENT_SUBSTEP = ZOMBIE_BODY_RADIUS * 0.45;
/** Surfaces solid enough to stop a walking body (targets are steel/paper). */
const BLOCKING_SURFACES: ReadonlySet<string> = new Set(['concrete', 'wood', 'metal']);
/** A collider blocks movement only if it is tall enough to matter. */
const MIN_OBSTACLE_HEIGHT = 0.5;
/** Ground/berm-scale boxes are walkable scenery, never obstacles. */
const MAX_OBSTACLE_FOOTPRINT = 20;
const GRID_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

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
  objectiveKey: string;
  objectiveX: number;
  objectiveZ: number;
  x: number;
  z: number;
  elapsed: number;
  travelled: number;
  lastDistance: number;
  stuckFor: number;
  recoveries: number;
  nudged: boolean;
  pathFailed: boolean;
}

interface NavigationObjective {
  readonly key: string;
  readonly kind: 'approach' | 'breach' | 'barrier' | 'portal' | 'player' | 'unreachable-player';
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly trigger?: THREE.Box3;
}

interface RecoveryWaypoint {
  readonly x: number;
  readonly z: number;
}

interface RecoveryPath {
  readonly objectiveKey: string;
  readonly points: readonly RecoveryWaypoint[];
  index: number;
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
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpIntersection = new THREE.Vector3();
  /**
   * Per-zombie obstacle-rounding state, keyed by the zombie (pool slots are
   * reused; spawn() leaves a stale, harmless entry). `rounding` is the
   * perpendicular side (±1 rotated from the to-player direction) the zombie
   * committed to when it hit a wall; null while it walks straight.
   */
  private readonly roundState = new Map<Zombie, { x: number; z: number }>();
  private readonly entryRoutes = new Map<Zombie, EntryRoute>();
  private readonly stuckState = new Map<Zombie, StuckState>();
  private readonly recoveryPaths = new Map<Zombie, RecoveryPath>();
  private readonly zombieIds = new Map<Zombie, number>();
  private nextZombieId = 1;
  private recoveryCount = 0;
  private navigationDebug = false;
  private navigationBounds: ReadonlyArray<ZombieNavigationBounds> = [];
  /**
   * Latest player snapshot, refreshed every update(). The attack callback
   * fires ~0.6 s after steer() started the wind-up, so it must validate
   * against where the player IS at the hit moment — not where they WERE
   * when the animation began.
   */
  private lastPlayerX = 0;
  private lastPlayerZ = 0;
  private lastPlayerFloor = 0;

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
      this.zombieIds.set(zombie, this.nextZombieId++);
      zombie.onDeathFinished = () => this.finishDeath(zombie);
      this.group.add(zombie.group);
      return zombie;
    });
  }

  /** The mutable collider array shared with ballistics (range + zombies). */
  registerColliders(colliders: THREE.Object3D[]): void {
    this.colliders = colliders;
    this.rebuildObstacles();
    // Door/map topology changed: discard decisions made against old solids.
    this.roundState.clear();
    this.recoveryPaths.clear();
    this.stuckState.clear();
  }

  /** Replace spawn points when a new zone is unlocked. */
  setSpawnPoints(spawnPoints: ReadonlyArray<ZombieSpawnDefinition>): void {
    this.spawner = new ZombieSpawner(this.rng, spawnPoints);
  }

  public setNavigationBounds(bounds: ReadonlyArray<ZombieNavigationBounds>): void {
    this.navigationBounds = bounds;
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

  /** Event-only navigation diagnostics. Disabled by default for production. */
  setNavigationDebug(enabled: boolean): void {
    this.navigationDebug = enabled;
  }

  /** Spawns one zombie for the round; false when the pool is exhausted. */
  spawnZombie(config: RoundConfig, playerX: number, playerZ: number): boolean {
    const zombie = this.pool.acquire();
    if (!zombie) return false;
    const spawn = this.pickValidSpawn(playerX, playerZ);
    if (!spawn) {
      this.pool.release(zombie);
      this.debugNavigation(zombie, 'spawn-rejected', null, 0, 0, 'no-valid-spawn');
      return false;
    }
    this.roundState.delete(zombie);
    this.stuckState.delete(zombie);
    this.recoveryPaths.delete(zombie);
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
    this.assignSpawnRoute(zombie, spawn);
    this.colliders.push(zombie.torsoHitbox, zombie.headHitbox);
    return true;
  }

  private assignSpawnRoute(zombie: Zombie, spawn: ZombieSpawnPoint): void {
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
  }

  private pickValidSpawn(playerX: number, playerZ: number): ZombieSpawnPoint | null {
    const preferred = this.spawner.pickSpawn(playerX, playerZ);
    if (!this.hitsObstacle(preferred.x, preferred.z, 0)) return preferred;
    let farthest: ZombieSpawnPoint | null = null;
    let farthestDistance = -1;
    for (const spawn of this.spawner.points) {
      if (this.hitsObstacle(spawn.x, spawn.z, 0)) continue;
      const distance = Math.hypot(spawn.x - playerX, spawn.z - playerZ);
      if (distance >= MIN_PLAYER_DISTANCE) return spawn;
      if (distance > farthestDistance) {
        farthest = spawn;
        farthestDistance = distance;
      }
    }
    return farthest;
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

  update(
    dt: number,
    playerX: number,
    playerZ: number,
    playerFloor = 0,
    playerY = EYE_HEIGHT,
    playerFacingX = 0,
    playerFacingZ = 0,
  ): void {
    this.lastPlayerX = playerX;
    this.lastPlayerZ = playerZ;
    this.lastPlayerFloor = playerFloor;
    for (const zombie of this.pool.actives) {
      if (zombie.isAlive) {
        if (
          this.isOutsideNavigationBounds(zombie) &&
          this.relocateZombie(
            zombie,
            playerX,
            playerZ,
            playerFloor,
            playerY,
            playerFacingX,
            playerFacingZ,
          )
        ) {
          zombie.resumePursuit();
          this.roundState.delete(zombie);
          this.stuckState.delete(zombie);
          this.recoveryPaths.delete(zombie);
          this.recoveryCount++;
          this.debugNavigation(zombie, 'out-of-bounds-relocated', null, 0, 0, 'valid-placement');
        }
        this.steer(zombie, dt, playerX, playerZ, playerFloor);
        this.applyFloorTransition(zombie);
        this.updateStuckRecovery(
          zombie,
          dt,
          playerX,
          playerZ,
          playerFloor,
          playerY,
          playerFacingX,
          playerFacingZ,
        );
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
    this.recoveryPaths.clear();
    this.recoveryCount = 0;
  }

  private updateStuckRecovery(
    zombie: Zombie,
    dt: number,
    playerX: number,
    playerZ: number,
    playerFloor: number,
    playerY: number,
    playerFacingX: number,
    playerFacingZ: number,
  ): void {
    if (zombie.state !== 'walk') {
      return;
    }

    const objective = this.resolveObjective(zombie, playerX, playerZ, playerFloor);
    if (!objective) return;
    const distance = Math.hypot(objective.x - zombie.position.x, objective.z - zombie.position.z);
    if (this.objectiveReached(zombie, objective, distance)) {
      this.stuckState.delete(zombie);
      this.recoveryPaths.delete(zombie);
      return;
    }

    let state = this.stuckState.get(zombie);
    if (!state || state.objectiveKey !== objective.key) {
      const id = this.zombieIds.get(zombie) ?? 0;
      state = {
        objectiveKey: objective.key,
        objectiveX: objective.x,
        objectiveZ: objective.z,
        x: zombie.position.x,
        z: zombie.position.z,
        elapsed: -(id / MAX_ALIVE) * STUCK_CHECK_INTERVAL,
        travelled: 0,
        lastDistance: distance,
        stuckFor: 0,
        recoveries: 0,
        nudged: false,
        pathFailed: false,
      };
      this.stuckState.set(zombie, state);
      this.recoveryPaths.delete(zombie);
    }
    if (Math.hypot(objective.x - state.objectiveX, objective.z - state.objectiveZ) > 1.5) {
      state.objectiveX = objective.x;
      state.objectiveZ = objective.z;
      state.lastDistance = distance;
      state.stuckFor = 0;
      state.recoveries = 0;
      state.nudged = false;
      state.pathFailed = false;
      state.travelled = 0;
      state.elapsed = 0;
      this.roundState.delete(zombie);
      this.recoveryPaths.delete(zombie);
      return;
    }
    state.travelled += Math.hypot(zombie.position.x - state.x, zombie.position.z - state.z);
    state.x = zombie.position.x;
    state.z = zombie.position.z;
    state.elapsed += dt;
    if (state.elapsed < STUCK_CHECK_INTERVAL) return;

    state.elapsed -= STUCK_CHECK_INTERVAL;
    const improved = state.lastDistance - distance >= STUCK_MIN_PROGRESS;
    const practicallyImmobile = state.travelled < STUCK_MIN_PROGRESS;
    state.lastDistance = distance;
    if (improved) {
      state.stuckFor = state.nudged
        ? Math.max(0, state.stuckFor - STUCK_CHECK_INTERVAL * 0.25)
        : 0;
      state.recoveries = 0;
      state.nudged = false;
      state.travelled = 0;
      return;
    }

    // Sideways wall-following is legitimate. It escalates much more slowly
    // than an actually motionless body, but still cannot orbit forever.
    state.stuckFor += practicallyImmobile || state.pathFailed
      ? STUCK_CHECK_INTERVAL
      : STUCK_CHECK_INTERVAL * 0.25;
    state.recoveries++;
    this.recoveryCount++;
    this.roundState.delete(zombie);

    const existingPath = this.recoveryPaths.get(zombie);
    let pathResult = existingPath ? `${existingPath.points.length - existingPath.index}-waypoints-active` : 'not-needed';
    if (objective.kind === 'unreachable-player') {
      state.pathFailed = true;
      pathResult = 'no-floor-route';
    }
    if (
      !existingPath &&
      !state.pathFailed &&
      (practicallyImmobile || state.stuckFor >= STUCK_NUDGE_AFTER)
    ) {
      const path = this.buildRecoveryPath(zombie, objective);
      if (path.length > 0) {
        this.recoveryPaths.set(zombie, { objectiveKey: objective.key, points: path, index: 0 });
        pathResult = `${path.length}-waypoints`;
      } else {
        state.pathFailed = true;
        pathResult = 'no-path';
      }
    }
    this.debugNavigation(
      zombie,
      'path-recalculated',
      objective,
      state.travelled,
      state.stuckFor,
      pathResult,
    );
    state.travelled = 0;

    if (
      objective.kind !== 'unreachable-player' &&
      state.stuckFor >= STUCK_NUDGE_AFTER &&
      this.nudgeToNearbyClearPoint(zombie, objective)
    ) {
      state.nudged = true;
      this.debugNavigation(zombie, 'local-nudge', objective, 0, state.stuckFor, 'moved');
    }
    if (
      state.stuckFor >= STUCK_RELOCATE_AFTER &&
      this.relocateZombie(
        zombie,
        playerX,
        playerZ,
        playerFloor,
        playerY,
        playerFacingX,
        playerFacingZ,
      )
    ) {
      this.debugNavigation(zombie, 'relocated', objective, 0, state.stuckFor, 'valid-placement');
      this.stuckState.delete(zombie);
      this.recoveryPaths.delete(zombie);
    }
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
      const portal = this.findNextFloorTransition(zombie.floor, playerFloor);
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

    if (
      distance <= ZOMBIE_ATTACK_RANGE &&
      this.attackLineClear(zombie.position.x, zombie.position.z, playerX, playerZ, zombie.position.y)
    ) {
      if (zombie.tryAttack()) {
        // The wind-up only SCHEDULES the bite: whether it connects is decided
        // at the hit moment, against the player's current position. A player
        // who retreats out of range during the wind-up dodges the hit while
        // the zombie finishes its swing; each attack lands at most once.
        zombie.onAttackLanded = () => {
          if (this.attackStillConnects(zombie)) {
            this.onPlayerAttack?.(ZOMBIE_ATTACK_DAMAGE);
          }
        };
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
    const recovery = this.recoveryPaths.get(zombie);
    if (recovery) {
      while (recovery.index < recovery.points.length) {
        const waypoint = recovery.points[recovery.index];
        if (
          Math.hypot(waypoint.x - zombie.position.x, waypoint.z - zombie.position.z) >
          RECOVERY_WAYPOINT_EPSILON
        ) {
          targetX = waypoint.x;
          targetZ = waypoint.z;
          toTarget.set(targetX - zombie.position.x, 0, targetZ - zombie.position.z).normalize();
          break;
        }
        recovery.index++;
      }
      if (recovery.index >= recovery.points.length) this.recoveryPaths.delete(zombie);
    }

    // Soft neighbor separation so the horde never stacks into one body.
    const separation = this.tmpSeparation.set(0, 0, 0);
    for (const other of this.pool.actives) {
      if (other === zombie || !other.isAlive || other.floor !== zombie.floor) continue;
      const delta = this.tmpDelta.copy(zombie.position).sub(other.position);
      delta.y = 0;
      const distSq = delta.lengthSq();
      if (distSq > ZOMBIE_SEPARATION_RADIUS * ZOMBIE_SEPARATION_RADIUS) continue;
      if (distSq < 1e-6) {
        const zombieId = this.zombieIds.get(zombie) ?? 0;
        const otherId = this.zombieIds.get(other) ?? 0;
        const angle = ((zombieId < otherId ? zombieId : otherId) * 2.399963) % (Math.PI * 2);
        const sign = zombieId < otherId ? 1 : -1;
        separation.x += Math.cos(angle) * ZOMBIE_SEPARATION_RADIUS * sign;
        separation.z += Math.sin(angle) * ZOMBIE_SEPARATION_RADIUS * sign;
        continue;
      }
      const dist = Math.sqrt(distSq);
      separation.addScaledVector(delta.multiplyScalar(1 / dist), ZOMBIE_SEPARATION_RADIUS - dist);
    }

    const maxSeparation = (zombie.speed * MAX_SEPARATION_SPEED_FACTOR) / SEPARATION_PUSH;
    if (separation.lengthSq() > maxSeparation * maxSeparation) separation.setLength(maxSeparation);

    const pos = zombie.position;
    const distance = Math.hypot(targetX - pos.x, targetZ - pos.z);
    let seekX = toTarget.x * zombie.speed + separation.x * SEPARATION_PUSH;
    let seekZ = toTarget.z * zombie.speed + separation.z * SEPARATION_PUSH;
    const seekSpeed = Math.hypot(seekX, seekZ);
    const maxMoveSpeed = zombie.speed * MAX_MOVE_SPEED_FACTOR;
    if (seekSpeed > maxMoveSpeed) {
      seekX = (seekX / seekSpeed) * maxMoveSpeed;
      seekZ = (seekZ / seekSpeed) * maxMoveSpeed;
    }

    let rounding = this.roundState.get(zombie) ?? null;

    if (rounding === null) {
      // Walking straight: only a wall right ahead triggers rounding.
      const probeX = pos.x + toTarget.x * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      const probeZ = pos.z + toTarget.z * ZOMBIE_BODY_RADIUS * FRONT_PROBE;
      const obstacle = this.findObstacle(probeX, probeZ, zombie.position.y);
      if (obstacle) {
        const tanX = -toTarget.z;
        const tanZ = toTarget.x;
        const positiveScore = this.roundDirectionScore(
          zombie,
          tanX,
          tanZ,
          targetX,
          targetZ,
        );
        const negativeScore = this.roundDirectionScore(
          zombie,
          -tanX,
          -tanZ,
          targetX,
          targetZ,
        );
        const sign = positiveScore === negativeScore
          ? ((this.zombieIds.get(zombie) ?? 0) % 2 === 0 ? 1 : -1)
          : (positiveScore < negativeScore ? 1 : -1);
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
    return this.lineOfSightClearFrom(pos.x, pos.z, targetX, targetZ, pos.y, distance);
  }

  private lineOfSightClearFrom(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    y: number,
    knownDistance?: number,
  ): boolean {
    const distance = knownDistance ?? Math.hypot(targetX - startX, targetZ - startZ);
    if (distance <= 1e-6) return true;
    const steps = Math.max(1, Math.ceil(distance / ZOMBIE_BODY_RADIUS));
    const stepX = (targetX - startX) / steps;
    const stepZ = (targetZ - startZ) / steps;
    for (let i = 1; i <= steps; i++) {
      if (this.hitsObstacle(startX + stepX * i, startZ + stepZ * i, y)) return false;
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
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MOVEMENT_SUBSTEP));
    const stepX = dx / steps;
    const stepZ = dz / steps;
    for (let step = 0; step < steps; step++) {
      if (stepX !== 0 && !this.hitsObstacle(pos.x + stepX, pos.z, pos.y)) {
        pos.x += stepX;
        moved = true;
      }
      if (stepZ !== 0 && !this.hitsObstacle(pos.x, pos.z + stepZ, pos.y)) {
        pos.z += stepZ;
        moved = true;
      }
    }
    return moved;
  }

  private resolveObjective(
    zombie: Zombie,
    playerX: number,
    playerZ: number,
    playerFloor: number,
  ): NavigationObjective | null {
    const route = this.entryRoutes.get(zombie);
    if (route) {
      const approach = route.stage === 'approach';
      return {
        key: `route:${route.barrierId}:${route.stage}`,
        kind: approach ? 'approach' : 'breach',
        x: approach ? route.approachX : route.breachX,
        z: approach ? route.approachZ : route.breachZ,
        radius: WAYPOINT_EPSILON,
      };
    }
    const barrier = zombie.barrierTarget;
    if (barrier && !barrier.isOpen) {
      return {
        key: `barrier:${barrier.id}`,
        kind: 'barrier',
        x: barrier.position.x,
        z: barrier.position.z,
        radius: ZOMBIE_BARRIER_ATTACK_RANGE,
      };
    }
    if (zombie.floor !== playerFloor) {
      const transition = this.findNextFloorTransition(zombie.floor, playerFloor);
      if (!transition) {
        return {
          key: `unreachable-player:${playerFloor}`,
          kind: 'unreachable-player',
          x: playerX,
          z: playerZ,
          radius: 0,
        };
      }
      const center = transition.box.getCenter(this.tmpDelta);
      return {
        key: `portal:${transition.sourceFloor}:${transition.targetFloor}`,
        kind: 'portal',
        x: center.x,
        z: center.z,
        radius: RECOVERY_GRID_SIZE,
        trigger: transition.box,
      };
    }
    return {
      key: `player:${playerFloor}`,
      kind: 'player',
      x: playerX,
      z: playerZ,
      radius: ZOMBIE_ATTACK_RANGE,
    };
  }

  private objectiveReached(
    zombie: Zombie,
    objective: NavigationObjective,
    distance: number,
  ): boolean {
    if (objective.kind === 'unreachable-player') return false;
    if (objective.trigger?.containsPoint(zombie.position)) return true;
    if (distance > objective.radius) return false;
    return objective.kind !== 'player' || this.attackLineClear(
      zombie.position.x,
      zombie.position.z,
      objective.x,
      objective.z,
      zombie.position.y,
    );
  }

  /**
   * Hit-window validation, run when the bite visually lands — never at
   * wind-up start. The attack connects only if the player is still on the
   * same floor, still inside ZOMBIE_ATTACK_RANGE and still reachable in a
   * straight line (the same predicates that allowed the wind-up to begin).
   * The zombie side is already guaranteed alive by the state machine: the
   * callback only fires from the attack state, and death leaves it.
   */
  private attackStillConnects(zombie: Zombie): boolean {
    if (zombie.floor !== this.lastPlayerFloor) return false;
    const dx = this.lastPlayerX - zombie.position.x;
    const dz = this.lastPlayerZ - zombie.position.z;
    if (dx * dx + dz * dz > ZOMBIE_ATTACK_RANGE * ZOMBIE_ATTACK_RANGE) return false;
    return this.attackLineClear(
      zombie.position.x,
      zombie.position.z,
      this.lastPlayerX,
      this.lastPlayerZ,
      zombie.position.y,
    );
  }

  /** Point-width occlusion check; movement clearance remains body-radius based. */
  private attackLineClear(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    y: number,
  ): boolean {
    const distance = Math.hypot(targetX - startX, targetZ - startZ);
    if (distance <= 1e-6) return true;
    this.tmpRay.origin.set(startX, y + 0.9, startZ);
    this.tmpRay.direction.set(targetX - startX, 0, targetZ - startZ).normalize();
    for (const box of this.obstacles) {
      const intersection = this.tmpRay.intersectBox(box, this.tmpIntersection);
      if (intersection && intersection.distanceTo(this.tmpRay.origin) < distance - 0.05) return false;
    }
    return true;
  }

  /** Finds the first portal in a floor chain; current maps resolve directly. */
  private findNextFloorTransition(
    sourceFloor: number,
    targetFloor: number,
  ): FloorTransitionZone | null {
    const direct = this.floorTransitions.find(
      (transition) => transition.sourceFloor === sourceFloor && transition.targetFloor === targetFloor,
    );
    if (direct) return direct;

    const queue: number[] = [sourceFloor];
    const visited = new Set<number>(queue);
    const firstStep = new Map<number, FloorTransitionZone>();
    for (let index = 0; index < queue.length; index++) {
      const floor = queue[index];
      for (const transition of this.floorTransitions) {
        if (transition.sourceFloor !== floor || visited.has(transition.targetFloor)) continue;
        visited.add(transition.targetFloor);
        const first = floor === sourceFloor ? transition : firstStep.get(floor);
        if (!first) continue;
        firstStep.set(transition.targetFloor, first);
        if (transition.targetFloor === targetFloor) return first;
        queue.push(transition.targetFloor);
      }
    }
    return null;
  }

  /**
   * Bounded grid search used only after a progress check fails. Normal frames
   * retain the cheap local steering; this path is a recovery route, not a
   * per-zombie navmesh query.
   */
  private buildRecoveryPath(
    zombie: Zombie,
    objective: NavigationObjective,
  ): RecoveryWaypoint[] {
    const minX = Math.min(zombie.position.x, objective.x) - RECOVERY_GRID_MARGIN;
    const minZ = Math.min(zombie.position.z, objective.z) - RECOVERY_GRID_MARGIN;
    const width = Math.ceil((Math.abs(objective.x - zombie.position.x) + RECOVERY_GRID_MARGIN * 2) / RECOVERY_GRID_SIZE) + 1;
    const height = Math.ceil((Math.abs(objective.z - zombie.position.z) + RECOVERY_GRID_MARGIN * 2) / RECOVERY_GRID_SIZE) + 1;
    const total = width * height;
    if (total <= 0 || total > RECOVERY_GRID_MAX_CELLS) return [];

    const toIndex = (column: number, row: number): number => row * width + column;
    const startColumn = Math.max(0, Math.min(width - 1, Math.round((zombie.position.x - minX) / RECOVERY_GRID_SIZE)));
    const startRow = Math.max(0, Math.min(height - 1, Math.round((zombie.position.z - minZ) / RECOVERY_GRID_SIZE)));
    const start = toIndex(startColumn, startRow);
    const parents = new Int32Array(total);
    parents.fill(-2);
    parents[start] = -1;
    const queue = new Int32Array(total);
    queue[0] = start;
    let read = 0;
    let write = 1;
    let goal = -1;

    while (read < write) {
      const current = queue[read++];
      const column = current % width;
      const row = Math.floor(current / width);
      const x = minX + column * RECOVERY_GRID_SIZE;
      const z = minZ + row * RECOVERY_GRID_SIZE;
      const closeEnough = Math.hypot(objective.x - x, objective.z - z) <= Math.max(
        objective.radius,
        RECOVERY_GRID_SIZE * 0.8,
      );
      if (
        (objective.trigger && x >= objective.trigger.min.x && x <= objective.trigger.max.x &&
          z >= objective.trigger.min.z && z <= objective.trigger.max.z) ||
        (closeEnough && this.lineOfSightClearFrom(x, z, objective.x, objective.z, zombie.position.y))
      ) {
        goal = current;
        break;
      }

      for (const [columnStep, rowStep] of GRID_DIRECTIONS) {
        const nextColumn = column + columnStep;
        const nextRow = row + rowStep;
        if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= height) continue;
        const next = toIndex(nextColumn, nextRow);
        if (parents[next] !== -2) continue;
        const nextX = minX + nextColumn * RECOVERY_GRID_SIZE;
        const nextZ = minZ + nextRow * RECOVERY_GRID_SIZE;
        if (this.hitsObstacle(nextX, nextZ, zombie.position.y)) continue;
        if (
          columnStep !== 0 && rowStep !== 0 &&
          (this.hitsObstacle(minX + nextColumn * RECOVERY_GRID_SIZE, z, zombie.position.y) ||
            this.hitsObstacle(x, minZ + nextRow * RECOVERY_GRID_SIZE, zombie.position.y))
        ) continue;
        parents[next] = current;
        queue[write++] = next;
      }
    }

    if (goal < 0) return [];
    const reversed: RecoveryWaypoint[] = [];
    for (let current = goal; current !== start && current >= 0; current = parents[current]) {
      const column = current % width;
      const row = Math.floor(current / width);
      reversed.push({
        x: minX + column * RECOVERY_GRID_SIZE,
        z: minZ + row * RECOVERY_GRID_SIZE,
      });
    }
    reversed.reverse();
    return reversed;
  }

  private nudgeToNearbyClearPoint(zombie: Zombie, objective: NavigationObjective): boolean {
    const currentDistance = Math.hypot(objective.x - zombie.position.x, objective.z - zombie.position.z);
    let bestX = zombie.position.x;
    let bestZ = zombie.position.z;
    let bestDistance = currentDistance;
    for (const radius of [0.35, 0.7]) {
      for (let index = 0; index < 16; index++) {
        const angle = (index / 16) * Math.PI * 2;
        const x = zombie.position.x + Math.cos(angle) * radius;
        const z = zombie.position.z + Math.sin(angle) * radius;
        if (this.hitsObstacle(x, z, zombie.position.y)) continue;
        if (!this.lineOfSightClearFrom(zombie.position.x, zombie.position.z, x, z, zombie.position.y)) continue;
        const distance = Math.hypot(objective.x - x, objective.z - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = x;
          bestZ = z;
        }
      }
    }
    if (bestDistance >= currentDistance) return false;
    zombie.position.x = bestX;
    zombie.position.z = bestZ;
    this.roundState.delete(zombie);
    return true;
  }

  private relocateZombie(
    zombie: Zombie,
    playerX: number,
    playerZ: number,
    playerFloor: number,
    playerY: number,
    playerFacingX: number,
    playerFacingZ: number,
  ): boolean {
    let bestSpawn: ZombieSpawnPoint | null = null;
    let bestScore = -Infinity;
    const facingLength = Math.hypot(playerFacingX, playerFacingZ);
    for (const spawn of this.spawner.points) {
      if (!this.isWithinNavigationBounds(spawn.x, spawn.z, 0)) continue;
      if (this.hitsObstacle(spawn.x, spawn.z, 0)) continue;
      if (this.isOccupiedByZombie(spawn.x, spawn.z, 0, zombie)) continue;
      const dx = spawn.x - playerX;
      const dz = spawn.z - playerZ;
      const distance = Math.hypot(dx, dz);
      if (distance < 3) continue;
      const inView = facingLength > 0 && distance > 0 &&
        (dx * playerFacingX + dz * playerFacingZ) / (distance * facingLength) > 0.35 &&
        this.lineOfSightClearFrom(playerX, playerZ, spawn.x, spawn.z, 0);
      const score = (inView ? 0 : 1000) + distance;
      if (score > bestScore) {
        bestScore = score;
        bestSpawn = spawn;
      }
    }

    if (bestSpawn) {
      zombie.position.set(bestSpawn.x, 0, bestSpawn.z);
      zombie.floor = 0;
      zombie.barrierTarget = null;
      this.assignSpawnRoute(zombie, bestSpawn);
      this.roundState.delete(zombie);
      return true;
    }

    const feetY = playerY - EYE_HEIGHT;
    for (const radius of [6, 5, 4, 3]) {
      for (let index = 0; index < 16; index++) {
        const angle = (index / 16) * Math.PI * 2;
        const x = playerX + Math.cos(angle) * radius;
        const z = playerZ + Math.sin(angle) * radius;
        if (!this.isWithinNavigationBounds(x, z, playerFloor)) continue;
        if (this.hitsObstacle(x, z, feetY)) continue;
        if (this.isOccupiedByZombie(x, z, playerFloor, zombie)) continue;
        if (!this.lineOfSightClearFrom(x, z, playerX, playerZ, feetY)) continue;
        const inView = facingLength > 0 &&
          (Math.cos(angle) * playerFacingX + Math.sin(angle) * playerFacingZ) / facingLength > 0.35;
        if (inView) continue;
        zombie.position.set(x, feetY, z);
        zombie.floor = playerFloor;
        zombie.barrierTarget = null;
        this.entryRoutes.delete(zombie);
        this.roundState.delete(zombie);
        return true;
      }
    }
    return false;
  }

  private isOutsideNavigationBounds(zombie: Zombie): boolean {
    return !this.isWithinNavigationBounds(
      zombie.position.x,
      zombie.position.z,
      zombie.floor,
    );
  }

  private isWithinNavigationBounds(x: number, z: number, floor: number): boolean {
    if (this.navigationBounds.length === 0) return true;
    const bounds = this.navigationBounds.find((candidate) => candidate.floor === floor);
    if (!bounds) return false;
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  }

  private isOccupiedByZombie(x: number, z: number, floor: number, ignored: Zombie): boolean {
    const minimumDistance = ZOMBIE_BODY_RADIUS * 2;
    for (const other of this.pool.actives) {
      if (other === ignored || !other.isAlive || other.floor !== floor) continue;
      if (Math.hypot(other.position.x - x, other.position.z - z) < minimumDistance) return true;
    }
    return false;
  }

  private roundDirectionScore(
    zombie: Zombie,
    directionX: number,
    directionZ: number,
    targetX: number,
    targetZ: number,
  ): number {
    const probeDistance = ZOMBIE_BODY_RADIUS * 2.5;
    const probeX = zombie.position.x + directionX * probeDistance;
    const probeZ = zombie.position.z + directionZ * probeDistance;
    if (this.hitsObstacle(probeX, probeZ, zombie.position.y)) return Infinity;
    return Math.hypot(targetX - probeX, targetZ - probeZ);
  }

  private debugNavigation(
    zombie: Zombie,
    event: string,
    objective: NavigationObjective | null,
    travelled: number,
    stuckFor: number,
    result: string,
  ): void {
    if (!this.navigationDebug) return;
    console.debug('[ZombieNav]', {
      zombieId: this.zombieIds.get(zombie) ?? -1,
      event,
      state: zombie.state,
      position: { x: zombie.position.x, y: zombie.position.y, z: zombie.position.z },
      objective: objective ? { kind: objective.kind, x: objective.x, z: objective.z } : null,
      speed: zombie.speed,
      travelled,
      stuckFor,
      result,
    });
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
      if (box.max.y <= y + 0.05 || box.min.y >= y + 1.8) continue;
      const nearestX = Math.max(box.min.x, Math.min(box.max.x, x));
      const nearestZ = Math.max(box.min.z, Math.min(box.max.z, z));
      const dx = x - nearestX;
      const dz = z - nearestZ;
      if (dx * dx + dz * dz < ZOMBIE_BODY_RADIUS * ZOMBIE_BODY_RADIUS) return box;
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
      this.recoveryPaths.delete(zombie);
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
    this.recoveryPaths.delete(zombie);
    this.pool.release(zombie);
  }

  private removeColliders(zombie: Zombie): void {
    for (const hitbox of [zombie.torsoHitbox, zombie.headHitbox]) {
      const index = this.colliders.indexOf(hitbox);
      if (index >= 0) this.colliders.splice(index, 1);
    }
  }
}
