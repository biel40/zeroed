import * as THREE from 'three';
import type { HitTarget } from './HitTarget';
import type { ProjectileConfig } from '../weapons/WeaponTypes';
import { stepTrajectory, type TrajectoryState } from './trajectory';

const MAX_PROJECTILES = 32;
const MAX_STEP_LENGTH = 3;
const TRACER_LENGTH = 2.5;
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
  tracer: THREE.Mesh;
}

/**
 * Simulates projectiles as points integrated over time, checking each
 * integration segment with a raycast. No rigid bodies, no per-shot scene
 * objects beyond a pooled tracer mesh.
 */
export class BallisticsSystem {
  onTargetHit:
    | ((
        target: HitTarget,
        distance: number,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        object: THREE.Object3D,
      ) => void)
    | null = null;
  onEnvironmentHit: ((point: THREE.Vector3, normal: THREE.Vector3, object: THREE.Object3D) => void) | null =
    null;

  private readonly projectiles: Projectile[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private readonly hitNormal = new THREE.Vector3();
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
        tracer,
      });
    }
  }

  spawn(origin: THREE.Vector3, direction: THREE.Vector3, config: ProjectileConfig): void {
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
    p.tracer.visible = true;
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
          // Head-priority resolution: see resolveSegmentHit.
          const hit = resolveSegmentHit(this.hits) ?? this.hits[0];
          p.active = false;
          p.tracer.visible = false;

          if (hit.face) {
            this.hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          } else {
            this.hitNormal.set(0, 1, 0);
          }

          const target = hit.object.userData.target as HitTarget | undefined;
          if (target) {
            target.onHit();
            this.onTargetHit?.(target, p.travelled + hit.distance, hit.point, this.hitNormal, hit.object);
          } else {
            this.onEnvironmentHit?.(hit.point, this.hitNormal, hit.object);
          }
        } else if (p.travelled >= p.config.maxDistance) {
          p.active = false;
          p.tracer.visible = false;
        }
      }

      if (p.active) {
        this.segmentDirection.set(p.vx, p.vy, p.vz).normalize();
        p.tracer.position.set(p.x, p.y, p.z);
        p.tracer.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
      }
    }
  }
}
