import * as THREE from 'three';
import type { HitTarget } from './HitTarget';
import type { ProjectileConfig } from '../weapons/WeaponTypes';
import { stepTrajectory, type TrajectoryState } from './trajectory';

const MAX_PROJECTILES = 32;
const MAX_STEP_LENGTH = 3;
const TRACER_LENGTH = 2.5;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

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
          const hit = this.hits[0];
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
