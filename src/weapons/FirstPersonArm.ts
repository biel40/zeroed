import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FINGER_LAYOUT, FINGERS, HAND_POSES, PHALANX_TAPER } from './HandPoses';
import type { HandPose } from './HandPoses';
import type { RingFinger } from '../game/rings/RingCatalog';

export type ArmSide = 'left' | 'right';

/** Shoulder-to-elbow and elbow-to-wrist lengths shared with the knife FK chain. */
export const ARM_UPPER_LENGTH = 0.32;
export const ARM_FOREARM_LENGTH = 0.3;

/** Geometry density of one arm; the skeleton is identical in every tier. */
export interface ArmDetail {
  readonly radial: number;
  readonly rings: number;
  readonly fingerRadial: number;
  readonly capSegments: number;
  /** Bakes each distal phalanx into the middle one at a fixed bend. */
  readonly fuseDistal: boolean;
}

export const ARM_DETAIL = {
  desktop: { radial: 16, rings: 14, fingerRadial: 10, capSegments: 2, fuseDistal: false },
  mobile: { radial: 10, rings: 11, fingerRadial: 6, capSegments: 1, fuseDistal: false },
  lowMemory: { radial: 10, rings: 11, fingerRadial: 6, capSegments: 1, fuseDistal: true },
} as const satisfies Record<string, ArmDetail>;

export function armDetailFor(profile: { readonly isMobile: boolean; readonly isLowMemory: boolean }): ArmDetail {
  if (profile.isLowMemory) return ARM_DETAIL.lowMemory;
  return profile.isMobile ? ARM_DETAIL.mobile : ARM_DETAIL.desktop;
}

// --- Skeleton (right hand, bind pose: everything points -Z, no rotation) ---

const THUMB_BASE = [-0.012, 0.03, -0.024] as const;
const THUMB_LENGTHS = [0.043, 0.033, 0.027] as const;
const THUMB_RADIUS = 0.0128;
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
/** Fixed distal bend baked into the low-memory fingers. */
const FUSED_DISTAL_BEND = 0.6;

const SHOULDER = 0;
const ELBOW = 1;
const WRIST = 2;
const fingerBone = (finger: number, segment: number): number => 3 + finger * 3 + segment;
const THUMB = 15;

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

let sharedMaterials: THREE.MeshStandardMaterial[] | null = null;

/** Field jacket of the co-op soldier.glb; coyote gloves stay readable on dark weapons. */
function armMaterials(): THREE.MeshStandardMaterial[] {
  sharedMaterials ??= [
    new THREE.MeshStandardMaterial({ name: 'arm-sleeve', color: 0x464a3f, roughness: 0.97, metalness: 0 }),
    new THREE.MeshStandardMaterial({ name: 'arm-sleeve-shade', color: 0x30362f, roughness: 1, metalness: 0 }),
    new THREE.MeshStandardMaterial({ name: 'arm-glove', color: 0x8d7a5c, roughness: 0.86, metalness: 0 }),
    new THREE.MeshStandardMaterial({ name: 'arm-glove-armor', color: 0x4f4637, roughness: 0.9, metalness: 0 }),
  ];
  return sharedMaterials;
}

// --- Geometry ------------------------------------------------------------

interface BoneBind {
  readonly parent: number;
  readonly offset: THREE.Vector3;
}

/** Bind offsets of every bone relative to its parent (right side). */
function boneBinds(): BoneBind[] {
  const binds: BoneBind[] = [
    { parent: -1, offset: new THREE.Vector3() },
    { parent: SHOULDER, offset: new THREE.Vector3(0, 0, -ARM_UPPER_LENGTH) },
    { parent: ELBOW, offset: new THREE.Vector3(0, 0, -ARM_FOREARM_LENGTH) },
  ];
  FINGERS.forEach((name, finger) => {
    const { base, lengths } = FINGER_LAYOUT[name];
    binds[fingerBone(finger, 0)] = { parent: WRIST, offset: new THREE.Vector3(...base) };
    binds[fingerBone(finger, 1)] = { parent: fingerBone(finger, 0), offset: new THREE.Vector3(0, 0, -lengths[0]) };
    binds[fingerBone(finger, 2)] = { parent: fingerBone(finger, 1), offset: new THREE.Vector3(0, 0, -lengths[1]) };
  });
  binds[THUMB] = { parent: WRIST, offset: new THREE.Vector3(...THUMB_BASE) };
  binds[THUMB + 1] = { parent: THUMB, offset: new THREE.Vector3(0, 0, -THUMB_LENGTHS[0]) };
  binds[THUMB + 2] = { parent: THUMB + 1, offset: new THREE.Vector3(0, 0, -THUMB_LENGTHS[1]) };
  return binds;
}

function bindPositions(binds: readonly BoneBind[]): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  binds.forEach(({ parent, offset }, index) => {
    positions[index] = parent < 0 ? offset.clone() : positions[parent].clone().add(offset);
  });
  return positions;
}

/** Rigidly skins a primitive to one bone, placed by `matrix` in bind space. */
function rigid(geometry: THREE.BufferGeometry, bone: number, matrix: THREE.Matrix4): THREE.BufferGeometry {
  geometry.deleteAttribute('uv');
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

/** Superellipsoid: a sphere pushed toward a box, for padded glove parts. */
function paddedBlock(width: number, height: number, depth: number, segments: number, squareness = 0.5): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(4, Math.round(segments * 0.7)));
  const position = geometry.attributes.position;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const shape = (value: number) => Math.sign(value) * Math.abs(value) ** squareness;
    position.setXYZ(
      vertex,
      shape(position.getX(vertex)) * width / 2,
      shape(position.getY(vertex)) * height / 2,
      shape(position.getZ(vertex)) * depth / 2,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Capsule from a joint along -Z, overlapping the next joint slightly. */
function phalanx(length: number, radius: number, detail: ArmDetail): THREE.BufferGeometry {
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.002, length - radius * 1.1), detail.capSegments, detail.fingerRadial);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -length / 2);
  return geometry;
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

interface TubeSpec {
  readonly start: number;
  readonly end: number;
  readonly rings: number;
  readonly radial: number;
  /** Half extents [x, y] of the cross-section at bind depth z. */
  readonly section: (z: number) => readonly [number, number];
  readonly bones: readonly [number, number];
  /** Weight of the second bone at bind depth z. */
  readonly weight: (z: number) => number;
}

/** Open tube along -Z, skinned across a joint so it bends instead of kinking. */
function skinnedTube(spec: TubeSpec): THREE.BufferGeometry {
  const { radial, rings } = spec;
  const positions: number[] = [];
  const normals: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const z = THREE.MathUtils.lerp(spec.start, spec.end, ring / rings);
    const [rx, ry] = spec.section(z);
    const weight = spec.weight(z);
    for (let segment = 0; segment <= radial; segment++) {
      const angle = (segment / radial) * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      positions.push(x * rx, y * ry, z);
      const normal = new THREE.Vector3(x / rx, y / ry, 0).normalize();
      normals.push(normal.x, normal.y, 0);
      skinIndex.push(spec.bones[0], spec.bones[1], 0, 0);
      skinWeight.push(1 - weight, weight, 0, 0);
    }
  }
  const row = radial + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < radial; segment++) {
      const a = ring * row + segment;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  return geometry;
}

/** Continuous sleeve, blended between the shoulder and elbow bones. */
function sleeveTube(detail: ArmDetail): THREE.BufferGeometry {
  return skinnedTube({
    start: 0.03,
    end: -(ARM_UPPER_LENGTH + ARM_FOREARM_LENGTH - 0.058),
    rings: detail.rings,
    radial: detail.radial,
    section: (z) => [sleeveRadius(-z), sleeveRadius(-z) * 0.93],
    bones: [SHOULDER, ELBOW],
    weight: (z) => THREE.MathUtils.smoothstep(-z, ARM_UPPER_LENGTH - 0.05, ARM_UPPER_LENGTH + 0.05),
  });
}

/**
 * Gloved wrist: flatter than deep, shared by forearm and hand so a bent
 * wrist curves like a real one instead of hinging two rigid cylinders.
 */
function wristTube(detail: ArmDetail): THREE.BufferGeometry {
  const wrist = -(ARM_UPPER_LENGTH + ARM_FOREARM_LENGTH);
  return skinnedTube({
    start: wrist + 0.05,
    end: wrist - 0.04,
    rings: Math.max(4, Math.round(detail.rings / 2)),
    radial: detail.radial,
    section: (z) => {
      const t = THREE.MathUtils.clamp((wrist + 0.05 - z) / 0.09, 0, 1);
      return [THREE.MathUtils.lerp(0.03, 0.02, t), THREE.MathUtils.lerp(0.037, 0.039, t)];
    },
    bones: [ELBOW, WRIST],
    weight: (z) => THREE.MathUtils.smoothstep(wrist + 0.018 - z, 0, 0.04),
  });
}

/** Skins every vertex between two bones by its bind position. */
function blendSkin(geometry: THREE.BufferGeometry, boneA: number, boneB: number, weightOf: (position: THREE.Vector3) => number): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  const index = geometry.attributes.skinIndex as THREE.BufferAttribute;
  const weight = geometry.attributes.skinWeight as THREE.BufferAttribute;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const w = THREE.MathUtils.clamp(weightOf(point.fromBufferAttribute(position, vertex)), 0, 1);
    index.setXYZW(vertex, boneA, boneB, 0, 0);
    weight.setXYZW(vertex, 1 - w, w, 0, 0);
  }
  return geometry;
}

/** Back of the hand: narrow at the wrist, broad and slightly domed at the knuckles. */
function palmBlock(detail: ArmDetail): THREE.BufferGeometry {
  const depth = 0.1;
  const geometry = paddedBlock(0.036, 0.092, depth, Math.round(detail.radial * 0.75), 0.55);
  const position = geometry.attributes.position;
  for (let vertex = 0; vertex < position.count; vertex++) {
    // 0 at the wrist end, 1 at the knuckle line.
    const t = THREE.MathUtils.clamp(0.5 - position.getZ(vertex) / depth, 0, 1);
    position.setX(vertex, position.getX(vertex) * THREE.MathUtils.lerp(0.78, 1, t));
    position.setY(vertex, position.getY(vertex) * THREE.MathUtils.lerp(0.8, 1, t));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** One merged, skinned arm with four material groups (four draw calls). */
function buildArmGeometry(detail: ArmDetail): THREE.BufferGeometry {
  const at = bindPositions(boneBinds());
  const sleeve: THREE.BufferGeometry[] = [sleeveTube(detail)];
  const shade: THREE.BufferGeometry[] = [];
  const glove: THREE.BufferGeometry[] = [];
  const armor: THREE.BufferGeometry[] = [];
  const ring = (radius: number, tube: number) => new THREE.TorusGeometry(radius, tube, 4, detail.radial);
  const pad = Math.max(5, Math.round(detail.fingerRadial * 0.6));

  // Elbow cloth bunching hides the skinning pinch on a hard bend.
  sleeve.push(rigid(new THREE.SphereGeometry(0.053, Math.round(detail.radial * 0.75), Math.max(6, detail.radial / 2)), ELBOW,
    place(at[ELBOW], 0, 0, 0.004, undefined, [1, 0.93, 1.08])));
  // Fabric fold below the elbow, then the cuff.
  shade.push(rigid(ring(0.051, 0.0055), ELBOW, place(at[ELBOW], 0, 0, -0.075, undefined, [1, 0.93, 1])));
  shade.push(rigid(new THREE.CylinderGeometry(0.045, 0.043, 0.05, detail.radial, 1, true), ELBOW,
    place(at[ELBOW], 0, 0, -(ARM_FOREARM_LENGTH - 0.07), new THREE.Euler(-Math.PI / 2, 0, 0), [1, 1, 0.93])));
  shade.push(rigid(ring(0.044, 0.005), ELBOW, place(at[ELBOW], 0, 0, -(ARM_FOREARM_LENGTH - 0.046), undefined, [1, 0.93, 1])));

  // Glove: elastic cuff band under the sleeve, a wrist that bends, a palm
  // tapering into it, the knuckle ridge the fingers grow from and a thenar
  // pad that follows the thumb.
  armor.push(rigid(new THREE.CylinderGeometry(0.038, 0.04, 0.03, detail.radial, 1, true), ELBOW,
    place(at[WRIST], 0, 0, 0.042, new THREE.Euler(-Math.PI / 2, 0, 0), [1, 1, 0.86])));
  glove.push(wristTube(detail));
  glove.push(rigid(palmBlock(detail), WRIST, place(at[WRIST], 0.001, 0, -0.052)));
  const ridge = new THREE.CapsuleGeometry(0.0128, 0.05, detail.capSegments, detail.fingerRadial);
  glove.push(rigid(ridge, WRIST, place(at[WRIST], 0.002, 0, -0.088, undefined, [1, 1, 0.92])));
  const thenar = rigid(paddedBlock(0.03, 0.036, 0.06, detail.fingerRadial, 0.75), WRIST,
    place(at[WRIST], -0.012, 0.021, -0.034, new THREE.Euler(0.15, 0.3, 0)));
  glove.push(blendSkin(thenar, WRIST, THUMB, (point) => 0.65 * THREE.MathUtils.smoothstep(at[WRIST].z - point.z, 0.015, 0.06)));
  FINGERS.forEach((name, finger) => {
    const { lengths, radius } = FINGER_LAYOUT[name];
    for (let segment = 0; segment < 3; segment++) {
      const bone = fingerBone(finger, segment);
      const r = radius * PHALANX_TAPER ** segment;
      if (segment === 2 && detail.fuseDistal) {
        // Low-memory tier: the fingertip rides the middle phalanx at a fixed bend.
        const tip = phalanx(lengths[2], r, detail);
        tip.rotateY(FUSED_DISTAL_BEND);
        tip.translate(0, 0, -lengths[1]);
        glove.push(rigid(tip, fingerBone(finger, 1), place(at[fingerBone(finger, 1)], 0, 0, 0)));
      } else {
        glove.push(rigid(phalanx(lengths[segment], r, detail), bone, place(at[bone], 0, 0, 0)));
      }
    }
    // Molded knuckle pad on the back of each proximal phalanx.
    armor.push(rigid(paddedBlock(0.006, radius * 1.5, lengths[0] * 0.5, pad, 0.6), fingerBone(finger, 0),
      place(at[fingerBone(finger, 0)], radius * 0.82, 0, -lengths[0] * 0.42)));
  });
  for (let segment = 0; segment < 3; segment++) {
    const bone = THUMB + segment;
    glove.push(rigid(phalanx(THUMB_LENGTHS[segment], THUMB_RADIUS * 0.94 ** segment, detail), bone, place(at[bone], 0, 0, 0)));
  }
  // Back-of-hand knuckle guard and the hook-and-loop wrist strap.
  armor.push(rigid(paddedBlock(0.011, 0.076, 0.03, pad + 2, 0.55), WRIST, place(at[WRIST], 0.019, 0.001, -0.084)));
  armor.push(rigid(paddedBlock(0.009, 0.05, 0.026, pad, 0.45), WRIST, place(at[WRIST], 0.02, 0.004, -0.04)));
  armor.push(rigid(paddedBlock(0.008, 0.052, 0.022, pad, 0.4), ELBOW, place(at[WRIST], 0.036, 0, 0.04)));

  const groups = [sleeve, shade, glove, armor].map((parts) => {
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
    geometry = side === 'right' ? buildArmGeometry(detail) : mirrorGeometry(armGeometry('right', detail));
    geometry.computeBoundingSphere();
    geometryCache.set(key, geometry);
  }
  return geometry;
}

export interface RingSeat {
  readonly bone: THREE.Bone;
  readonly length: number;
  readonly radius: number;
}

/**
 * Procedural first-person arm: field-jacket sleeve and a tactical glove with
 * articulated fingers, skinned to one skeleton so the whole arm costs four
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
    this.bones = boneBinds().map(({ offset }, index) => {
      const bone = new THREE.Bone();
      bone.name = `view-arm-${side}-bone-${index}`;
      bone.position.set(offset.x * this.sign, offset.y, offset.z);
      return bone;
    });
    boneBinds().forEach(({ parent }, index) => {
      (parent < 0 ? this.root : this.bones[parent]).add(this.bones[index]);
    });
    this.mesh = new THREE.SkinnedMesh(armGeometry(side, detail), armMaterials());
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
    // flexes: the forearm turns (as a real one pronates), never the glove cuff.
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

  /**
   * Proximal phalanx a ring is worn on, with its length and radius. In the
   * bone's frame the finger runs along -Z and its back faces +X on the
   * right glove (-X on the mirrored left one). Every detail tier keeps this
   * bone articulated.
   */
  ringSeat(finger: RingFinger): RingSeat {
    if (finger === 'thumb') return { bone: this.bones[THUMB + 1], length: THUMB_LENGTHS[1], radius: THUMB_RADIUS * 0.94 };
    const { lengths, radius } = FINGER_LAYOUT[finger];
    return { bone: this.bones[fingerBone(FINGERS.indexOf(finger), 0)], length: lengths[0], radius };
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
