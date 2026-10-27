import * as THREE from 'three';
import type { Zombie } from '../zombies/Zombie';
import { KNIFE_RANGE } from './Knife';

/** The slash covers a wide horizontal arc, with less assistance above/below it. */
export const KNIFE_HALF_ARC = THREE.MathUtils.degToRad(50);
export const KNIFE_HALF_VERTICAL_ARC = THREE.MathUtils.degToRad(35);

/**
 * One visible contact per slash. Aim wins when it intersects a body; otherwise
 * nearby hitboxes in the sweep compete by alignment and distance. Every
 * candidate uses an actual raycast, so neither walls nor a nearer body can
 * be skipped by the wider arc. Used by local combat and host claim validation.
 */
export class KnifeCombat {
  private readonly raycaster = new THREE.Raycaster();
  private readonly intersections: THREE.Intersection[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly center = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  public findImpact(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    floor: number,
    colliders: THREE.Object3D[],
    claimedZombie?: Zombie,
  ): THREE.Intersection | null {
    if (forward.lengthSq() < 1e-8) return null;
    this.forward.copy(forward).normalize();
    this.raycaster.near = 0;
    this.raycaster.far = KNIFE_RANGE;

    const aimed = this.cast(origin, this.forward, floor, colliders, claimedZombie);
    if (aimed) return aimed;

    const forwardYaw = Math.atan2(this.forward.x, -this.forward.z);
    const forwardPitch = Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));
    let best: THREE.Intersection | null = null;
    let bestScore = Infinity;
    for (const collider of colliders) {
      const zombie = collider.userData.zombie as Zombie | undefined;
      if (!zombie?.isAlive || zombie.floor !== floor || (claimedZombie && zombie !== claimedZombie)) continue;
      if (!(collider instanceof THREE.Mesh)) continue;
      const geometry = collider.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      this.bounds.copy(geometry.boundingBox!).applyMatrix4(collider.matrixWorld);
      if (this.bounds.distanceToPoint(origin) > KNIFE_RANGE) continue;
      this.bounds.getCenter(this.center);

      // Aim at the height of the cut within the animated hitbox, rather than
      // forcing an eye-level slash down to the centre of a tall torso.
      const horizontalDistance = Math.hypot(this.center.x - origin.x, this.center.z - origin.z);
      const inset = (this.bounds.max.y - this.bounds.min.y) * 0.15;
      const cutHeight = origin.y + Math.tan(forwardPitch) * horizontalDistance;
      this.center.y = THREE.MathUtils.clamp(cutHeight, this.bounds.min.y + inset, this.bounds.max.y - inset);
      this.direction.subVectors(this.center, origin);
      const distance = this.direction.length();
      if (distance < 1e-6) continue;
      this.direction.divideScalar(distance);
      const yaw = Math.atan2(this.direction.x, -this.direction.z);
      const yawDifference = Math.abs(Math.atan2(Math.sin(yaw - forwardYaw), Math.cos(yaw - forwardYaw)));
      const pitch = Math.asin(THREE.MathUtils.clamp(this.direction.y, -1, 1));
      if (yawDifference > KNIFE_HALF_ARC || Math.abs(pitch - forwardPitch) > KNIFE_HALF_VERTICAL_ARC) continue;

      const impact = this.cast(origin, this.direction, floor, colliders, claimedZombie);
      if (!impact) continue;
      const score = 1 - this.forward.dot(this.direction) + (impact.distance / KNIFE_RANGE) * 0.12;
      if (score < bestScore) {
        best = impact;
        bestScore = score;
      }
    }
    return best;
  }

  private cast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    floor: number,
    colliders: THREE.Object3D[],
    claimedZombie: Zombie | undefined,
  ): THREE.Intersection | null {
    this.raycaster.set(origin, direction);
    this.intersections.length = 0;
    this.raycaster.intersectObjects(colliders, false, this.intersections);
    const impact = this.intersections[0];
    const zombie = impact?.object.userData.zombie as Zombie | undefined;
    return zombie?.isAlive && zombie.floor === floor && (!claimedZombie || zombie === claimedZombie) ? impact : null;
  }
}
