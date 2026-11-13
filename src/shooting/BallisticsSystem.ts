import * as THREE from 'three';
import type { HitTarget } from './HitTarget';
import type { ProjectileConfig } from '../weapons/WeaponTypes';
import type { Weapon } from '../weapons/Weapon';
import { TracerStreak } from './TracerStreak';
import { stepTrajectory, type TrajectoryState } from './trajectory';

const MAX_PROJECTILES = 32;
const MAX_STEP_LENGTH = 3;
const TRACER_LENGTH = 2.5;
/** Cross-section of a tracer streak, metres: fine enough to read as a glint, never a beam. */
const STREAK_WIDTH = 0.012;
const STREAK_OPACITY = 0.85;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * How far behind the torso surface a head hitbox entry may lie and still
 * count as a headshot, meters. The generous torso capsule deliberately
 * overlaps the lower head sphere (otherwise the bobbing skull would open a
 * hittable gap at the neck in some animation phases). The price of that
 * overlap: whenever the walk cycle dips the head into the capsule
 * silhouette, the torso surface sits marginally closer to the muzzle and
 * the nearest-hit rule would report a torso hit for a shot at the visible
 * head — alternating with the pose, which read as "inconsistent hits".
 */
export const HEAD_PRIORITY_WINDOW = 0.15;

/**
 * Resolves which intersection of a segment actually takes the bullet.
 * Normally the nearest; but when the nearest is a zombie's torso AND the
 * segment also pierces THE SAME zombie's head within HEAD_PRIORITY_WINDOW,
 * the head wins — aim at the visible skull, get the headshot, at every
 * animation phase. Only same-zombie head hits qualify: a bullet never
 * upgrades by clipping a different zombie standing behind. Runs only when
 * a segment already hit something; no allocations, no new geometry.
 */
export function resolveSegmentHit(
  hits: readonly THREE.Intersection[],
): THREE.Intersection | null {
  const first = hits[0] ?? null;
  if (!first) return null;
  const firstData = first.object.userData;
  if (firstData.hitPart !== 'torso' || !firstData.zombie) return first;
  for (let i = 1; i < hits.length; i++) {
    const hit = hits[i];
    if (hit.distance - first.distance > HEAD_PRIORITY_WINDOW) break; // sorted ascending
    const data = hit.object.userData;
    if (data.zombie === firstData.zombie && data.hitPart === 'head') return hit;
  }
  return first;
}

interface Projectile extends TrajectoryState {
  active: boolean;
  config: ProjectileConfig | null;
  weapon: Weapon | null;
  tracer: THREE.Mesh;
  /** Muzzle streak of a round fired with a `ShotTracer`; it outlives the round by its fade. */
  readonly streak: TracerStreak;
  readonly streakMesh: THREE.Mesh;
  /** Zombies this round has already passed through; their hitboxes no longer stop it. */
  readonly pierced: unknown[];
}

/** A visible streak for a round: it leaves `muzzle` and slides onto the round's true path. */
export interface ShotTracer {
  readonly muzzle: THREE.Vector3Like;
  readonly color: number;
}

/**
 * Simulates projectiles as points integrated over time, checking each
 * integration segment with a raycast. No rigid bodies, no per-shot scene
 * objects beyond a pooled tracer mesh. A round fired with a `ShotTracer`
 * shows a pooled streak from the muzzle instead (one shared material per
 * colour); it is drawn only and never changes what the round hits.
 */
export class BallisticsSystem {
  onTargetHit:
    | ((
        target: HitTarget,
        distance: number,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        object: THREE.Object3D,
        weapon: Weapon | null,
      ) => void)
    | null = null;
  onEnvironmentHit: ((point: THREE.Vector3, normal: THREE.Vector3, object: THREE.Object3D) => void) | null =
    null;

  private readonly projectiles: Projectile[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  /** Segment hits minus the zombies the round already pierced. */
  private readonly openHits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private readonly hitNormal = new THREE.Vector3();
  private readonly streakGeometry = new THREE.BoxGeometry(STREAK_WIDTH, STREAK_WIDTH, 1);
  private readonly streakMaterials = new Map<number, THREE.MeshBasicMaterial>();
  private cursor = 0;

  constructor(
    private readonly colliders: THREE.Object3D[],
    tracerParent: THREE.Object3D,
  ) {
    const tracerGeometry = new THREE.BoxGeometry(0.015, 0.015, TRACER_LENGTH);
    const tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe2a0,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
      tracer.visible = false;
      tracer.frustumCulled = false;
      tracerParent.add(tracer);
      const streakMesh = new THREE.Mesh(this.streakGeometry);
      streakMesh.name = 'tracer-streak';
      streakMesh.visible = false;
      streakMesh.frustumCulled = false;
      tracerParent.add(streakMesh);
      this.projectiles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        travelled: 0,
        config: null,
        weapon: null,
        tracer,
        streak: new TracerStreak(),
        streakMesh,
        pierced: [],
      });
    }
  }

  spawn(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    config: ProjectileConfig,
    weapon: Weapon | null = null,
    tracer: ShotTracer | null = null,
  ): void {
    const p = this.projectiles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PROJECTILES;

    p.active = true;
    p.x = origin.x;
    p.y = origin.y;
    p.z = origin.z;
    p.vx = direction.x * config.muzzleVelocity;
    p.vy = direction.y * config.muzzleVelocity;
    p.vz = direction.z * config.muzzleVelocity;
    p.travelled = 0;
    p.config = config;
    p.weapon = weapon;
    p.pierced.length = 0;
    p.tracer.visible = tracer === null;
    if (tracer) {
      p.streak.begin(tracer.muzzle, origin);
      p.streakMesh.material = this.streakMaterial(tracer.color);
    } else {
      p.streak.cancel();
    }
    p.streakMesh.visible = false;
  }

  update(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active || !p.config) continue;

      let remaining = dt;
      while (remaining > 1e-6 && p.active) {
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        const stepDt = Math.min(remaining, MAX_STEP_LENGTH / speed);
        remaining -= stepDt;

        const prevX = p.x;
        const prevY = p.y;
        const prevZ = p.z;
        stepTrajectory(p, stepDt, p.config.gravity, p.config.drag);

        const dx = p.x - prevX;
        const dy = p.y - prevY;
        const dz = p.z - prevZ;
        const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (segmentLength < 1e-6) continue;

        this.segmentOrigin.set(prevX, prevY, prevZ);
        this.segmentDirection.set(dx / segmentLength, dy / segmentLength, dz / segmentLength);
        this.raycaster.set(this.segmentOrigin, this.segmentDirection);
        this.raycaster.near = 0;
        this.raycaster.far = segmentLength + 1e-4;

        this.hits.length = 0;
        this.raycaster.intersectObjects(this.colliders, false, this.hits);

        if (this.hits.length > 0) {
          this.resolveImpacts(p);
        } else if (p.travelled >= p.config.maxDistance) {
          p.active = false;
          p.tracer.visible = false;
          p.streak.fadeOut();
        }
      }

      if (p.active) {
        this.segmentDirection.set(p.vx, p.vy, p.vz).normalize();
        p.tracer.position.set(p.x, p.y, p.z);
        p.tracer.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
        p.streak.follow(p.x, p.y, p.z, p.travelled);
      }
    }
    for (const p of this.projectiles) this.drawStreak(p, dt);
  }

  /** One shared material per streak colour, made the first time that colour fires. */
  private streakMaterial(color: number): THREE.MeshBasicMaterial {
    let material = this.streakMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: STREAK_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.streakMaterials.set(color, material);
    }
    return material;
  }

  /** Stretches the streak's box from its tail to its head, or hides it once it is gone. */
  private drawStreak(p: Projectile, dt: number): void {
    const mesh = p.streakMesh;
    const length = p.streak.update(dt) ? p.streak.length : 0;
    mesh.visible = length > 1e-4;
    if (!mesh.visible) return;
    const { head, tail } = p.streak;
    mesh.position.addVectors(head, tail).multiplyScalar(0.5);
    this.segmentDirection.subVectors(head, tail).divideScalar(length);
    mesh.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
    mesh.scale.set(1, 1, length);
  }

  /**
   * Reports this segment's impacts nearest first. A round with
   * `maxTargets` keeps going through zombies (each one once) until it has
   * hit that many; anything else, or the last zombie, stops it.
   */
  private resolveImpacts(p: Projectile): void {
    const maxTargets = p.config?.maxTargets ?? 1;
    while (p.active) {
      this.openHits.length = 0;
      for (const hit of this.hits) {
        if (!p.pierced.includes(hit.object.userData.zombie)) this.openHits.push(hit);
      }
      if (this.openHits.length === 0) return;

      // Head-priority resolution: see resolveSegmentHit.
      const hit = resolveSegmentHit(this.openHits) ?? this.openHits[0];
      const zombie: unknown = hit.object.userData.zombie;
      if (zombie) p.pierced.push(zombie);
      if (!zombie || p.pierced.length >= maxTargets) {
        p.active = false;
        p.tracer.visible = false;
        p.streak.land(hit.point.x, hit.point.y, hit.point.z);
      }

      if (hit.face) {
        this.hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      } else {
        this.hitNormal.set(0, 1, 0);
      }

      const target = hit.object.userData.target as HitTarget | undefined;
      if (target) {
        target.onHit();
        this.onTargetHit?.(target, p.travelled + hit.distance, hit.point, this.hitNormal, hit.object, p.weapon);
      } else {
        this.onEnvironmentHit?.(hit.point, this.hitNormal, hit.object);
      }
    }
  }
}
