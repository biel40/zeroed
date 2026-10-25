import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARM_FOREARM_LENGTH, ARM_UPPER_LENGTH, ELBOW, SHOULDER, THUMB, WRIST, bindFrames, boneBinds, fingerBone } from './ArmRig';
import type { ArmSide } from './ArmRig';
import { digitRingSeat, handGeometries } from './HandModel';
import type { DigitSection, HandDetail } from './HandModel';
import { FINGERS, HAND_POSES } from './HandPoses';
import type { HandPose } from './HandPoses';
import { skinMaterial } from './HandSkinTexture';
import { skinnedLoft } from './SkinnedLoft';
import type { RingFinger } from '../game/rings/RingCatalog';

/** Geometry density of one arm; the skeleton is identical in every tier. */
export interface ArmDetail extends HandDetail {
  /** Points around and rings along the sleeve. */
  readonly radial: number;
  readonly rings: number;
  /** Texels per side of the baked skin. */
  readonly skinTexture: number;
}

export const ARM_DETAIL = {
  desktop: { radial: 16, rings: 14, handRadial: 20, digitRadial: 10, jointRings: 3, tipRings: 2, nailGrid: [4, 3], sparsePalm: false, skinTexture: 512 },
  mobile: { radial: 10, rings: 11, handRadial: 14, digitRadial: 7, jointRings: 2, tipRings: 1, nailGrid: [2, 2], sparsePalm: true, skinTexture: 256 },
  lowMemory: { radial: 10, rings: 10, handRadial: 12, digitRadial: 6, jointRings: 2, tipRings: 1, nailGrid: [2, 1], sparsePalm: true, skinTexture: 256 },
} as const satisfies Record<string, ArmDetail>;

export function armDetailFor(profile: { readonly isMobile: boolean; readonly isLowMemory: boolean }): ArmDetail {
  if (profile.isLowMemory) return ARM_DETAIL.lowMemory;
  return profile.isMobile ? ARM_DETAIL.mobile : ARM_DETAIL.desktop;
}

/**
 * Share of the forearm that turns from the hand's own line toward the
 * shoulder: a relaxed wrist gives a little, it never folds.
 */
const WRIST_GIVE = 0.2;
/**
 * Widest angle between the forearm and the way to its shoulder: a hand
 * turned further away (a hook on a charging handle) bends the wrist instead
 * of swinging the arm in from the wrong side.
 */
const ARM_CONE = THREE.MathUtils.degToRad(50);
/** First-person forearms always drop from the hand toward an elbow below it. */
const MAX_FOREARM_RISE = -0.3;

// Pose vector: 4 fingers x (3 curls + spread), thumb base xyz + 2 curls, grip xyz.
const THUMB_SLOT = 16;
const GRIP_SLOT = 21;
const POSE_SIZE = 24;

function writePose(pose: HandPose, out: Float32Array): void {
  FINGERS.forEach((name, finger) => {
    const { curl, spread } = pose[name];
    out.set([curl[0], curl[1], curl[2], spread], finger * 4);
  });
  out.set([...pose.thumb.base, ...pose.thumb.curl], THUMB_SLOT);
  out.set(pose.grip, GRIP_SLOT);
}

// --- Materials (shared by both arms) -------------------------------------

let sleeveMaterials: THREE.MeshStandardMaterial[] | null = null;

/** Field jacket of the co-op soldier.glb over bare skin. */
function armMaterials(detail: ArmDetail): THREE.MeshStandardMaterial[] {
  sleeveMaterials ??= [
    new THREE.MeshStandardMaterial({ name: 'arm-sleeve', color: 0x464a3f, roughness: 0.97, metalness: 0 }),
    // Double-sided: the open cuff shows its dark lining around the wrist.
    new THREE.MeshStandardMaterial({ name: 'arm-sleeve-shade', color: 0x30362f, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  ];
  return [...sleeveMaterials, skinMaterial(detail.skinTexture)];
}

// --- Sleeve ----------------------------------------------------------------

/** Rigidly skins a primitive to one bone, placed by `matrix` in bind space. */
function rigid(geometry: THREE.BufferGeometry, bone: number, matrix: THREE.Matrix4): THREE.BufferGeometry {
  geometry.applyMatrix4(matrix);
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex++) {
    indices[vertex * 4] = bone;
    weights[vertex * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  return geometry;
}

const frameX = new THREE.Vector3();
const frameY = new THREE.Vector3();
const frameBasis = new THREE.Matrix4();

/**
 * Rotation of a bone whose +Z runs along the unit vector `back` (bones point
 * -Z, toward their child) and whose +X stays as close to `side` as it can.
 */
function boneFrame(back: THREE.Vector3, side: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  frameX.copy(side).addScaledVector(back, -side.dot(back));
  if (frameX.lengthSq() < 1e-8) frameX.set(back.z, 0, -back.x);
  if (frameX.lengthSq() < 1e-8) frameX.set(1, 0, 0);
  frameX.normalize();
  frameY.crossVectors(back, frameX);
  return out.setFromRotationMatrix(frameBasis.makeBasis(frameX, frameY, back));
}

const placement = new THREE.Matrix4();
const placementRotation = new THREE.Quaternion();
const placementScale = new THREE.Vector3();

function place(
  origin: THREE.Vector3,
  x: number,
  y: number,
  z: number,
  rotation = new THREE.Euler(),
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.Matrix4 {
  return placement.compose(
    new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z),
    placementRotation.setFromEuler(rotation),
    placementScale.set(...scale),
  );
}

/** Sleeve radius along the arm (distance from the shoulder). */
const SLEEVE_PROFILE: readonly (readonly [number, number])[] = [
  [-0.03, 0.053], [0, 0.056], [0.18, 0.055], [0.3, 0.052], [0.36, 0.05], [0.46, 0.045], [0.57, 0.041],
];

function sleeveRadius(distance: number): number {
  for (let index = 1; index < SLEEVE_PROFILE.length; index++) {
    const [d1, r1] = SLEEVE_PROFILE[index];
    if (distance <= d1 || index === SLEEVE_PROFILE.length - 1) {
      const [d0, r0] = SLEEVE_PROFILE[index - 1];
      return THREE.MathUtils.lerp(r0, r1, THREE.MathUtils.clamp((distance - d0) / (d1 - d0), 0, 1));
    }
  }
  return SLEEVE_PROFILE[0][1];
}

/** Continuous sleeve, blended between the shoulder and elbow bones. */
function sleeveTube(detail: ArmDetail): THREE.BufferGeometry {
  const start = -0.03;
  const end = ARM_UPPER_LENGTH + ARM_FOREARM_LENGTH - 0.058;
  return skinnedLoft({
    stations: Array.from({ length: detail.rings + 1 }, (_, ring) => THREE.MathUtils.lerp(start, end, ring / detail.rings)),
    radial: detail.radial,
    point: (distance, around, out) => {
      const radius = sleeveRadius(distance);
      out.set(Math.sin(around * Math.PI * 2) * radius, -Math.cos(around * Math.PI * 2) * radius * 0.93, -distance);
    },
    skin: (distance, _around, _point, out) => {
      const weight = THREE.MathUtils.smoothstep(distance, ARM_UPPER_LENGTH - 0.05, ARM_UPPER_LENGTH + 0.05);
      out.add(SHOULDER, 1 - weight).add(ELBOW, weight);
    },
    uv: (distance, around) => [around, distance],
  });
}

/**
 * One merged, skinned arm with three material groups (three draw calls), in
 * the right-hand convention with `side`'s thumb rest.
 */
function buildArmGeometry(detail: ArmDetail, side: ArmSide): THREE.BufferGeometry {
  const at = bindFrames(boneBinds(side)).map(({ position }) => position);
  const sleeve: THREE.BufferGeometry[] = [sleeveTube(detail)];
  const shade: THREE.BufferGeometry[] = [];
  const ring = (radius: number, tube: number) => new THREE.TorusGeometry(radius, tube, 4, detail.radial);

  // Elbow cloth bunching hides the skinning pinch on a hard bend.
  sleeve.push(rigid(new THREE.SphereGeometry(0.053, Math.round(detail.radial * 0.75), Math.max(6, detail.radial / 2)), ELBOW,
    place(at[ELBOW], 0, 0, 0.004, undefined, [1, 0.93, 1.08])));
  // Fabric fold below the elbow, then the cuff around the bare wrist.
  shade.push(rigid(ring(0.051, 0.0055), ELBOW, place(at[ELBOW], 0, 0, -0.075, undefined, [1, 0.93, 1])));
  shade.push(rigid(new THREE.CylinderGeometry(0.045, 0.043, 0.05, detail.radial, 1, true), ELBOW,
    place(at[ELBOW], 0, 0, -(ARM_FOREARM_LENGTH - 0.07), new THREE.Euler(-Math.PI / 2, 0, 0), [1, 1, 0.93])));
  shade.push(rigid(ring(0.044, 0.005), ELBOW, place(at[ELBOW], 0, 0, -(ARM_FOREARM_LENGTH - 0.046), undefined, [1, 0.93, 1])));

  const groups = [sleeve, shade, handGeometries(detail, side)].map((parts) => {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error('Arm geometry parts are incompatible');
    return merged;
  });
  const geometry = mergeGeometries(groups, true);
  for (const group of groups) group.dispose();
  if (!geometry) throw new Error('Arm material groups are incompatible');
  return geometry;
}

/** Left arm: X mirror with the triangle winding flipped back to front faces. */
function mirrorGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  geometry.scale(-1, 1, 1);
  const index = geometry.index as THREE.BufferAttribute;
  for (let face = 0; face < index.count; face += 3) {
    const b = index.getX(face + 1);
    index.setX(face + 1, index.getX(face + 2));
    index.setX(face + 2, b);
  }
  return geometry;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function armGeometry(side: ArmSide, detail: ArmDetail): THREE.BufferGeometry {
  const key = `${side}:${JSON.stringify(detail)}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = side === 'right' ? buildArmGeometry(detail, side) : mirrorGeometry(buildArmGeometry(detail, side));
    geometry.computeBoundingSphere();
    geometryCache.set(key, geometry);
  }
  return geometry;
}

/**
 * Where a ring is worn: a child of `bone`, `along` its length, around a
 * finger section whose back faces +X on the right hand (-X on the mirrored
 * left one).
 */
export interface RingSeat extends DigitSection {
  readonly bone: THREE.Bone;
  readonly along: number;
}

/**
 * Procedural first-person arm: field-jacket sleeve and a bare hand with
 * articulated fingers, skinned to one skeleton so the whole arm costs three
 * draw calls. Pure presentation: owners decide where the hand goes.
 */
export class FirstPersonArm {
  /** Shoulder pivot; reachGrip() places it in its parent's (camera) space. */
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private readonly bones: THREE.Bone[];
  private readonly sign: 1 | -1;
  private readonly pose = new Float32Array(POSE_SIZE);
  private readonly targetPose = new Float32Array(POSE_SIZE);
  private readonly offset = new THREE.Vector3();
  private readonly wrist = new THREE.Vector3();
  private readonly elbowTarget = new THREE.Vector3();
  private readonly shoulderTarget = new THREE.Vector3();
  private readonly forearm = new THREE.Vector3();
  private readonly upper = new THREE.Vector3();
  private readonly sideAxis = new THREE.Vector3();
  private readonly handRotation = new THREE.Quaternion();
  private readonly forearmRotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();

  constructor(readonly side: ArmSide, detail: ArmDetail = ARM_DETAIL.desktop) {
    this.sign = side === 'right' ? 1 : -1;
    this.root.name = `view-arm-${side}`;
    const binds = boneBinds(side);
    this.bones = binds.map(({ offset, rest }, index) => {
      const bone = new THREE.Bone();
      bone.name = `view-arm-${side}-bone-${index}`;
      bone.position.set(offset.x * this.sign, offset.y, offset.z);
      // Mirroring X flips the Y and Z rotations, as in applyFingers().
      bone.rotation.set(rest[0], rest[1] * this.sign, rest[2] * this.sign);
      return bone;
    });
    binds.forEach(({ parent }, index) => {
      (parent < 0 ? this.root : this.bones[parent]).add(this.bones[index]);
    });
    this.mesh = new THREE.SkinnedMesh(armGeometry(side, detail), armMaterials(detail));
    this.mesh.name = `view-arm-${side}-mesh`;
    // Bones sweep far outside the bind-pose bounds; two meshes never pay for culling.
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    writePose(HAND_POSES.relaxed, this.targetPose);
    this.pose.set(this.targetPose);
    this.applyFingers();
  }

  /** Moves the fingers toward `pose`; `blend` 1 snaps, small values ease. */
  setHandPose(pose: HandPose, blend: number): void {
    writePose(pose, this.targetPose);
    const t = THREE.MathUtils.clamp(blend, 0, 1);
    for (let slot = 0; slot < POSE_SIZE; slot++) {
      this.pose[slot] += (this.targetPose[slot] - this.pose[slot]) * t;
    }
    this.applyFingers();
  }

  /** Current finger pose values (read-only view for tests and tooling). */
  get poseValues(): Readonly<Float32Array> {
    return this.pose;
  }

  /**
   * Places the hand so its grip point sits on `grip` with the hand rotation
   * `rotation`, all in world space. The forearm continues the hand (the
   * wrist only gives a little toward `shoulder`, never letting the forearm
   * rise toward the eye) and the upper arm reaches back from that elbow
   * toward `shoulder`, below and behind the screen: the shoulder follows the
   * hand instead of folding the wrist. `elbow` overrides the forearm by
   * `elbowWeight` for authored chains (the knife).
   */
  reachGrip(
    grip: THREE.Vector3,
    rotation: THREE.Quaternion,
    shoulder: THREE.Vector3,
    elbow: THREE.Vector3 | null = null,
    elbowWeight = 0,
  ): void {
    const [upperBone, forearmBone, wristBone] = this.bones;
    // Everything in the parent (camera) space, where the root is placed.
    const parent = this.root.parent;
    parent?.updateWorldMatrix(true, false);
    const toParent = (point: THREE.Vector3) => (parent ? parent.worldToLocal(point) : point);
    this.handRotation.copy(rotation);
    if (parent) this.handRotation.premultiply(parent.getWorldQuaternion(this.parentRotation).invert());
    this.gripOffset(this.offset).applyQuaternion(this.handRotation);
    toParent(this.wrist.copy(grip)).sub(this.offset);
    toParent(this.shoulderTarget.copy(shoulder));

    // Forearm: behind the knuckles, eased toward the shoulder and kept
    // within its cone.
    this.forearm.set(0, 0, 1).applyQuaternion(this.handRotation);
    this.offset.subVectors(this.shoulderTarget, this.wrist).normalize();
    this.forearm.lerp(this.offset, WRIST_GIVE).normalize();
    if (this.forearm.angleTo(this.offset) > ARM_CONE) {
      this.sideAxis.copy(this.forearm).addScaledVector(this.offset, -this.forearm.dot(this.offset));
      if (this.sideAxis.lengthSq() < 1e-8) this.forearm.copy(this.offset);
      else this.forearm.copy(this.offset).multiplyScalar(Math.cos(ARM_CONE)).addScaledVector(this.sideAxis.normalize(), Math.sin(ARM_CONE));
    }
    this.forearm.y = Math.min(this.forearm.y, MAX_FOREARM_RISE);
    this.forearm.normalize();
    if (elbow && elbowWeight > 0) {
      this.offset.subVectors(toParent(this.elbowTarget.copy(elbow)), this.wrist).normalize();
      this.forearm.lerp(this.offset, THREE.MathUtils.clamp(elbowWeight, 0, 1)).normalize();
    }
    this.elbowTarget.copy(this.wrist).addScaledVector(this.forearm, ARM_FOREARM_LENGTH);
    this.upper.subVectors(this.shoulderTarget, this.elbowTarget);
    if (this.upper.lengthSq() < 1e-8) this.upper.set(0, -1, 0);
    this.upper.normalize();
    this.root.position.copy(this.elbowTarget).addScaledVector(this.upper, ARM_UPPER_LENGTH);
    this.root.quaternion.identity();

    // Bones from the elbow out carry the hand's roll, so the wrist only
    // flexes: the forearm turns (as a real one pronates), never the hand.
    this.sideAxis.set(1, 0, 0).applyQuaternion(this.handRotation);
    boneFrame(this.forearm, this.sideAxis, this.forearmRotation);
    this.sideAxis.set(1, 0, 0).applyQuaternion(this.forearmRotation);
    boneFrame(this.upper, this.sideAxis, upperBone.quaternion);
    forearmBone.quaternion.copy(upperBone.quaternion).invert().multiply(this.forearmRotation);
    wristBone.quaternion.copy(this.forearmRotation).invert().multiply(this.handRotation);
    this.root.updateMatrixWorld(true);
  }

  /** World position of the point the hand is currently holding. */
  getGripWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const wrist = this.bones[WRIST];
    wrist.updateWorldMatrix(true, false);
    return wrist.localToWorld(this.gripOffset(out));
  }

  getElbowWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.bones[ELBOW].getWorldPosition(out);
  }

  getShoulderWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.bones[SHOULDER].getWorldPosition(out);
  }

  getWristWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.bones[WRIST].getWorldPosition(out);
  }

  /** Where a ring sits on `finger`; every detail tier keeps that bone articulated. */
  ringSeat(finger: RingFinger): RingSeat {
    const { bone, ...seat } = digitRingSeat(finger, this.side);
    return { ...seat, bone: this.bones[bone] };
  }

  /** Grip point in the wrist frame for the current (eased) pose. */
  private gripOffset(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pose[GRIP_SLOT] * this.sign, this.pose[GRIP_SLOT + 1], this.pose[GRIP_SLOT + 2]);
  }

  private applyFingers(): void {
    const s = this.sign;
    for (let finger = 0; finger < FINGERS.length; finger++) {
      const slot = finger * 4;
      this.bones[fingerBone(finger, 0)].rotation.set(this.pose[slot + 3], this.pose[slot] * s, 0);
      this.bones[fingerBone(finger, 1)].rotation.set(0, this.pose[slot + 1] * s, 0);
      this.bones[fingerBone(finger, 2)].rotation.set(0, this.pose[slot + 2] * s, 0);
    }
    const thumb = THUMB_SLOT;
    this.bones[THUMB].rotation.set(this.pose[thumb], this.pose[thumb + 1] * s, this.pose[thumb + 2] * s);
    this.bones[THUMB + 1].rotation.set(0, this.pose[thumb + 3] * s, 0);
    this.bones[THUMB + 2].rotation.set(0, this.pose[thumb + 4] * s, 0);
  }
}
