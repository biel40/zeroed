import * as THREE from 'three';
import type { ZombieSkinRemains } from './ZombieSkinCatalog';
import { burnAt, valueNoise } from './ZombieSkinDamage';
import type { WalkerPaletteBand } from './ZombieSkinRegions';

/**
 * What a skeletal skin (`ZombieSkinDefinition.remains`) bakes into the
 * walker: flesh drawn in towards each bone's axis, so limbs keep their
 * length and joints but lose their bulk, and every bare part painted as aged
 * bone with grime, scraps of dried tissue and empty sockets. Deterministic:
 * a skin always wastes and colors the same way.
 */

/**
 * Share of the flesh's distance from the bone axis that remains, by bone;
 * bones left out (hips, head) keep their shape, so the skull and the
 * pelvis the garments hang from stay where they were.
 */
const FLESH_KEPT: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(Left|Right)Hand.+/, 0.6],
  [/^(Left|Right)Hand$/, 0.66],
  [/^(Left|Right)(Arm|ForeArm)$/, 0.45],
  [/^(Left|Right)UpLeg$/, 0.5],
  [/^(Left|Right)Leg$/, 0.45],
  [/^(Left|Right)(Foot|Toe)/, 0.82],
  [/^(Left|Right)Shoulder$/, 0.8],
  [/^Spine1?$/, 0.62],
  [/^Spine2$/, 0.86],
  [/^Neck$/, 0.55],
];

/** Grime blotch size on the bone, body-frame meters. */
const GRIME_CELL = 0.06;
const GRIME_STRENGTH = 0.75;
const TISSUE_STRENGTH = 0.85;
const GRIME = new THREE.Color(0x3d3326);
const TISSUE = new THREE.Color(0x3b2118);
const SOCKET = new THREE.Color(0x0b0907);
const MOUTH = new THREE.Color(0x1a120d);
/** The asset's blood band has no green to retint: it can only darken to old gore. */
export const DRIED_BLOOD_TINT = new THREE.Color(0.3, 1, 0.3);

/** Eye sockets: fully dark within `core`, fading out at `edge` (meters); the nasal cavity, smaller, below them. */
const EYE_SOCKET = { core: 0.016, edge: 0.03 } as const;
const NASAL_CAVITY = { core: 0.01, edge: 0.019, drop: 0.035 } as const;

interface BoneAxis {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly kept: number;
}

/**
 * Bind-pose joints of a skinned rig in its raw geometry space, measured on
 * the skin itself: a bone's joint is the centre of the vertices its weight
 * shares with its parent's. (The walker's inverse bind matrices live in an
 * armature space of another scale, so they cannot be used directly.)
 */
export interface ZombieRigJoints {
  readonly positions: readonly THREE.Vector3[];
  /** False where a bone never blends with its parent (the root, unskinned tips); its position is then the origin. */
  readonly measured: readonly boolean[];
  /** Parent bone index of each bone; -1 at the root. */
  readonly parents: readonly number[];
}

export function rigJointsOf(mesh: THREE.SkinnedMesh): ZombieRigJoints {
  const { bones } = mesh.skeleton;
  const parents = bones.map((bone) => (bone.parent instanceof THREE.Bone ? bones.indexOf(bone.parent) : -1));
  const position = mesh.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  const positions = parents.map(() => new THREE.Vector3());
  const totals = new Float32Array(parents.length);
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    for (let slot = 0; slot < 4; slot++) {
      const weight = skinWeight.getComponent(vertex, slot);
      if (weight <= 0) continue;
      const bone = skinIndex.getComponent(vertex, slot);
      for (let other = 0; other < 4; other++) {
        const otherWeight = skinWeight.getComponent(vertex, other);
        if (other === slot || otherWeight <= 0 || skinIndex.getComponent(vertex, other) !== parents[bone]) continue;
        const shared = Math.min(weight, otherWeight);
        positions[bone].addScaledVector(point.fromBufferAttribute(position, vertex), shared);
        totals[bone] += shared;
      }
    }
  }
  positions.forEach((joint, bone) => { if (totals[bone] > 0) joint.divideScalar(totals[bone]); });
  return { positions, measured: Array.from(totals, (total) => total > 0), parents };
}

function fleshKept(bone: string): number {
  for (const [pattern, kept] of FLESH_KEPT) if (pattern.test(bone)) return kept;
  return 1;
}

/** The line each wasting bone draws its flesh to: from its joint towards its children's, or on past its parent's for a tip. */
function boneAxes(boneNames: readonly string[], joints: ZombieRigJoints): ReadonlyArray<BoneAxis | null> {
  const { positions, measured, parents } = joints;
  return boneNames.map((name, bone) => {
    const kept = fleshKept(name);
    if (kept >= 1 || !measured[bone]) return null;
    const origin = positions[bone];
    const end = new THREE.Vector3();
    let children = 0;
    parents.forEach((parent, child) => {
      if (parent !== bone || !measured[child]) return;
      end.add(positions[child]);
      children++;
    });
    const parent = parents[bone];
    if (children > 0) end.divideScalar(children);
    else if (parent >= 0 && measured[parent]) end.copy(origin).multiplyScalar(2).sub(positions[parent]);
    else return null;
    const direction = end.sub(origin);
    if (direction.lengthSq() < 1e-14) return null;
    return { origin, direction: direction.normalize(), kept };
  });
}

/**
 * Draws the first `count` vertices of `position` (raw geometry space)
 * towards the axes of the bones they are skinned to, blended by skin weight
 * so the body stays closed across every joint.
 */
export function wasteToBones(
  position: Float32Array,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
  count: number,
  boneNames: readonly string[],
  joints: ZombieRigJoints,
): void {
  const axes = boneAxes(boneNames, joints);
  const point = new THREE.Vector3();
  const onAxis = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (let vertex = 0; vertex < count; vertex++) {
    point.fromArray(position, vertex * 3);
    sum.set(0, 0, 0);
    let total = 0;
    for (let slot = 0; slot < 4; slot++) {
      const weight = skinWeight[vertex * 4 + slot];
      if (weight <= 0) continue;
      total += weight;
      const axis = axes[skinIndex[vertex * 4 + slot]];
      if (!axis) {
        sum.addScaledVector(point, weight);
        continue;
      }
      const along = onAxis.copy(point).sub(axis.origin).dot(axis.direction);
      onAxis.copy(axis.origin).addScaledVector(axis.direction, along);
      sum.addScaledVector(onAxis.lerp(point, axis.kept), weight);
    }
    if (total > 0) sum.divideScalar(total).toArray(position, vertex * 3);
  }
}

/** Bands a skeletal skin repaints; cloth and the dark band keep the skin's usual dressing. */
export function wearsRemains(band: WalkerPaletteBand): boolean {
  return band !== 'shirt' && band !== 'pants' && band !== 'dark';
}

/** Empty eye sockets and nasal cavity of a skull, placed on the asset's eyes (body-frame meters). */
export class SkullSockets {
  private readonly eyes: readonly THREE.Vector3[];
  private readonly nose: THREE.Vector3;

  /** `eyePoints`: body-frame points of the asset's eyes, both sides. */
  public constructor(eyePoints: readonly THREE.Vector3[]) {
    const center = (side: number): THREE.Vector3 => {
      const points = eyePoints.filter((point) => Math.sign(point.x) === side);
      return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
    };
    this.eyes = [center(1), center(-1)];
    this.nose = this.eyes[0].clone().add(this.eyes[1]).multiplyScalar(0.5);
    this.nose.y -= NASAL_CAVITY.drop;
  }

  /** 0 (bone) .. 1 (hollow) at a body-frame point of the skull. */
  public darknessAt(point: THREE.Vector3): number {
    let darkness = 1 - THREE.MathUtils.smoothstep(this.nose.distanceTo(point), NASAL_CAVITY.core, NASAL_CAVITY.edge);
    for (const eye of this.eyes) {
      darkness = Math.max(darkness, 1 - THREE.MathUtils.smoothstep(eye.distanceTo(point), EYE_SOCKET.core, EYE_SOCKET.edge));
    }
    return darkness;
  }
}

/**
 * Linear color of a bare part at a body-frame `point` riding `bone`, written
 * into `target`: hollow eyes and mouth, dried tissue in the belly wound,
 * otherwise aged bone with grime and clinging tissue. Not for the blood band
 * (see DRIED_BLOOD_TINT).
 */
export function remainsColor(
  band: WalkerPaletteBand,
  bone: string,
  point: THREE.Vector3,
  remains: ZombieSkinRemains,
  sockets: SkullSockets | null,
  target: THREE.Color,
): THREE.Color {
  if (band === 'eyes') return target.copy(SOCKET);
  if (band === 'mouth') return target.copy(MOUTH);
  if (band === 'wound' && /^(Spine|Hips)/.test(bone)) return target.copy(TISSUE);
  target.set(remains.bone);
  const grime = valueNoise(point.x / GRIME_CELL, point.y / GRIME_CELL, point.z / GRIME_CELL, remains.seed);
  target.lerp(GRIME, THREE.MathUtils.smoothstep(grime, 0.35, 0.9) * GRIME_STRENGTH);
  const tissue = burnAt(point, { coverage: remains.tissue, seed: remains.seed + 1 });
  if (tissue > 0) target.lerp(TISSUE, tissue * TISSUE_STRENGTH);
  if (bone === 'Head' && sockets) target.lerp(SOCKET, sockets.darknessAt(point));
  return target;
}
