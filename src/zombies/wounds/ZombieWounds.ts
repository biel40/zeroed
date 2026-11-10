import * as THREE from 'three';
import { woundGeometry, woundMaterial } from './WoundAssets';

/**
 * Lift off the skin along its normal, as a share of the decal half-size (at
 * least MIN_LIFT m): enough that a flat decal clears the curve of a low-poly
 * limb, small enough not to read as floating.
 */
const LIFT_SHARE = 0.18;
const MIN_LIFT = 0.003;
/** Golden-angle step of the small per-wound tilt, so neighbours never look stamped. */
const TILT_STEP = 2.39996;
/** Largest tilt (rad) of a wound's blood run away from straight down. */
const MAX_TILT = 0.3;

const DOWN = new THREE.Vector3(0, -1, 0);
const SIDEWAYS = new THREE.Vector3(1, 0, 0);

interface WoundSlot {
  bone: THREE.Object3D | null;
  /** Entry point, outward normal and decal "up" in the bone's space: the wound rides the animated bone. */
  readonly localPosition: THREE.Vector3;
  readonly localNormal: THREE.Vector3;
  readonly localUp: THREE.Vector3;
  radius: number;
}

/**
 * Entry wounds on one pooled zombie: a fixed ring of slots drawn in a single
 * instanced call that shares one geometry and material with every other
 * body. Each wound is stored in its bone's space, so it follows the skinned
 * animation instead of staying where the bullet met it in the world; its
 * blood runs downhill as the body stood when it was shot. The owner clears
 * the set whenever the body is recycled.
 */
export class ZombieWounds {
  private mesh: THREE.InstancedMesh | null = null;
  private readonly slots: WoundSlot[] = [];
  private cursor = 0;
  private active = 0;
  private placed = 0;
  private readonly tmpInverse = new THREE.Matrix4();
  private readonly tmpWorld = new THREE.Matrix4();
  private readonly tmpPosition = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();

  public constructor(private readonly parent: THREE.Object3D, private readonly limit: number) {
    for (let index = 0; index < limit; index++) {
      this.slots.push({
        bone: null, localPosition: new THREE.Vector3(), localNormal: new THREE.Vector3(), localUp: new THREE.Vector3(), radius: 0,
      });
    }
  }

  /** Wounds currently shown on the body. */
  public get count(): number {
    return this.active;
  }

  /**
   * Adds a wound at a world-space skin point with its outward normal; `radius`
   * is the decal half-size. Past the limit the oldest wound is reused.
   * `bone`'s world matrix must be current.
   */
  public add(bone: THREE.Object3D, worldPosition: THREE.Vector3, worldNormal: THREE.Vector3, radius: number): void {
    if (this.limit === 0) return;
    const slot = this.slots[this.cursor];
    this.tmpInverse.copy(bone.matrixWorld).invert();
    slot.bone = bone;
    slot.radius = radius;
    slot.localPosition.copy(worldPosition).applyMatrix4(this.tmpInverse);
    slot.localNormal.copy(worldNormal).transformDirection(this.tmpInverse);

    // Decal "up": against gravity within the skin's tangent plane, slightly tilted per wound.
    const up = this.tmpUp.copy(DOWN).negate().addScaledVector(worldNormal, -worldNormal.y);
    if (up.lengthSq() < 1e-4) up.copy(SIDEWAYS).addScaledVector(worldNormal, -worldNormal.x);
    up.normalize();
    const tilt = (((this.placed * TILT_STEP) % 2) - 1) * MAX_TILT;
    this.tmpRight.crossVectors(up, worldNormal).normalize();
    up.multiplyScalar(Math.cos(tilt)).addScaledVector(this.tmpRight, Math.sin(tilt));
    slot.localUp.copy(up).transformDirection(this.tmpInverse);

    this.placed++;
    this.cursor = (this.cursor + 1) % this.limit;
    this.active = Math.min(this.limit, this.active + 1);
    this.ensureMesh().count = this.active;
  }

  /**
   * Re-seats every wound on its bone after the body's pose changed this
   * frame. `fade` (0..1) shrinks them with the corpse's fade-out. Idle
   * when the body carries no wound.
   */
  public update(fade: number): void {
    const mesh = this.mesh;
    if (!mesh || this.active === 0) return;
    mesh.updateWorldMatrix(true, false);
    this.tmpInverse.copy(mesh.matrixWorld).invert();
    const size = Math.max(0, Math.min(1, fade)) * 2;
    for (let index = 0; index < this.active; index++) {
      const slot = this.slots[index];
      const bone = slot.bone!;
      bone.updateWorldMatrix(true, false);
      const normal = this.tmpNormal.copy(slot.localNormal).transformDirection(bone.matrixWorld);
      const up = this.tmpUp.copy(slot.localUp).transformDirection(bone.matrixWorld);
      up.addScaledVector(normal, -up.dot(normal)).normalize();
      const right = this.tmpRight.crossVectors(up, normal);
      const scale = slot.radius * size;
      this.tmpPosition.copy(slot.localPosition).applyMatrix4(bone.matrixWorld)
        .addScaledVector(normal, Math.max(MIN_LIFT, slot.radius * LIFT_SHARE));
      this.tmpWorld.makeBasis(right.multiplyScalar(scale), up.multiplyScalar(scale), normal.multiplyScalar(scale))
        .setPosition(this.tmpPosition);
      mesh.setMatrixAt(index, this.tmpWorld.premultiply(this.tmpInverse));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Removes every wound: a recycled or dissolved body never shows stale marks. */
  public clear(): void {
    this.active = 0;
    this.cursor = 0;
    this.placed = 0;
    for (const slot of this.slots) slot.bone = null;
    if (this.mesh) this.mesh.count = 0;
  }

  public dispose(): void {
    this.clear();
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh = null;
  }

  private ensureMesh(): THREE.InstancedMesh {
    if (this.mesh) return this.mesh;
    const mesh = new THREE.InstancedMesh(woundGeometry(), woundMaterial(), this.limit);
    mesh.name = 'zombie-wounds';
    mesh.count = 0;
    // Instances ride animated bones; a bounding volume from their first pose would cull them wrongly.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The zombie's subtree may be raycast; a wound is never a target.
    mesh.raycast = (): void => undefined;
    this.parent.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}
