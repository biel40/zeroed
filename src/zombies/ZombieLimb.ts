import * as THREE from 'three';

/** Two-joint visual constraint. Cached bind lengths support both exported rigs;
 * targets/poles are in ZombieVisual.root space, never navigation coordinates. */
export class ZombieLimb {
  readonly rest = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly joint = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly desiredJoint = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly worldRotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly endRotation = new THREE.Quaternion();
  private readonly restRotation = new THREE.Quaternion();
  private readonly animatedTipLocal = new THREE.Quaternion();

  constructor(
    private readonly root: THREE.Object3D,
    readonly upper: THREE.Object3D,
    readonly lower: THREE.Object3D,
    readonly tip: THREE.Object3D,
  ) {
    tip.getWorldPosition(this.rest);
    root.worldToLocal(this.rest);
    root.getWorldQuaternion(this.parentRotation).invert();
    tip.getWorldQuaternion(this.restRotation).premultiply(this.parentRotation);
  }

  solve(x: number, y: number, z: number, poleX: number, poleY: number, poleZ: number, weight: number, plant = false, followForearm = false): void {
    if (weight <= 0) return;
    this.upper.getWorldPosition(this.start);
    this.lower.getWorldPosition(this.joint);
    this.tip.getWorldPosition(this.end);
    this.tip.getWorldQuaternion(this.endRotation);
    this.animatedTipLocal.copy(this.tip.quaternion);
    if (plant) {
      this.root.getWorldQuaternion(this.worldRotation).multiply(this.restRotation);
      this.endRotation.slerp(this.worldRotation, weight);
    }
    this.root.localToWorld(this.target.set(x, y, z));
    this.target.lerp(this.end, 1 - weight);
    this.root.localToWorld(this.pole.set(poleX, poleY, poleZ));
    const a = this.start.distanceTo(this.joint);
    const b = this.joint.distanceTo(this.end);
    if (a < 1e-5 || b < 1e-5) return;
    this.direction.subVectors(this.target, this.start);
    const distance = THREE.MathUtils.clamp(this.direction.length(), Math.abs(a - b) + 1e-4, (a + b) * 0.995);
    this.direction.normalize();
    this.target.copy(this.start).addScaledVector(this.direction, distance);
    this.bend.subVectors(this.pole, this.start);
    this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    this.desiredJoint.copy(this.start).addScaledVector(this.direction, along)
      .addScaledVector(this.bend, Math.sqrt(Math.max(0, a * a - along * along)));
    this.aim(this.upper, this.start, this.joint, this.desiredJoint);
    this.lower.getWorldPosition(this.joint);
    this.tip.getWorldPosition(this.end);
    this.aim(this.lower, this.joint, this.end, this.target);
    // Preserve the animated wrist/ankle orientation rather than hyperextending it.
    this.tip.parent!.getWorldQuaternion(this.parentRotation).invert();
    this.tip.quaternion.copy(this.parentRotation).multiply(this.endRotation).normalize();
    // Keep the animation's current local wrist pose while it follows the
    // solved forearm. Returning to the GLB bind rotation made hands snap and
    // visibly twist as soon as an attack reached full weight.
    if (followForearm) this.tip.quaternion.slerp(this.animatedTipLocal, weight);
  }

  private aim(bone: THREE.Object3D, origin: THREE.Vector3, end: THREE.Vector3, target: THREE.Vector3): void {
    this.from.subVectors(end, origin).normalize();
    this.to.subVectors(target, origin).normalize();
    this.rotation.setFromUnitVectors(this.from, this.to);
    bone.getWorldQuaternion(this.worldRotation).premultiply(this.rotation);
    bone.parent!.getWorldQuaternion(this.parentRotation).invert();
    bone.quaternion.copy(this.parentRotation).multiply(this.worldRotation).normalize();
  }
}
