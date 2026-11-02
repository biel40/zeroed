import * as THREE from 'three';
import type { ZombieBodyFrame } from './ZombieBodyFrame';
import type { AccessoryPart } from './ZombieSkinAccessories';
import type { ZombieSeveredLimb, ZombieSkinBurns } from './ZombieSkinCatalog';

/**
 * Fire damage a skin bakes into the walker: charred patches painted through
 * the vertex colors and forearms cut away with a stump closing the wound.
 * Deterministic: a skin always burns and loses the same parts.
 */

/** Patch size, body-frame meters: a few blotches per limb, not a speckle. */
const BURN_CELL = 0.11;
/** Width of the scorched fringe around a charred patch, in noise units. */
const BURN_EDGE = 0.12;
const SCORCH_COLOR = new THREE.Color(0x4a2c1c);
const CHAR_COLOR = new THREE.Color(0x120e0c);
/** Seared flesh closing a severed limb. */
const STUMP_COLOR = 0x3a120c;
/** The stump sits a bit proud of the cut so no gap shows while the arm swings. */
const STUMP_FIT = 1.25;
const STUMP_MIN_RADIUS = 0.03;

const SEVERED_BONES: Readonly<Record<ZombieSeveredLimb, { readonly lost: RegExp; readonly stump: string }>> = {
  leftForearm: { lost: /^Left(ForeArm|Hand)/, stump: 'LeftArm' },
  rightForearm: { lost: /^Right(ForeArm|Hand)/, stump: 'RightArm' },
};

/** Integer lattice hash in [0, 1). */
function latticeValue(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ Math.imul(iz, 0xcb1ab31f) ^ Math.imul(seed, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth 3D value noise in [0, 1). */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  let result = 0;
  for (let corner = 0; corner < 8; corner++) {
    const dx = corner & 1;
    const dy = (corner >> 1) & 1;
    const dz = (corner >> 2) & 1;
    const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    result += weight * latticeValue(ix + dx, iy + dy, iz + dz, seed);
  }
  return result;
}

/** 0 (untouched) .. 1 (fully charred) at a body-frame point, in meters. */
export function burnAt(point: THREE.Vector3, burns: ZombieSkinBurns): number {
  const x = point.x / BURN_CELL;
  const y = point.y / BURN_CELL;
  const z = point.z / BURN_CELL;
  // A finer octave breaks the round blobs into ragged burn edges.
  const noise = valueNoise(x, y, z, burns.seed) * 0.7 + valueNoise(x * 2.3, y * 2.3, z * 2.3, burns.seed + 1) * 0.3;
  const threshold = 1 - burns.coverage;
  return THREE.MathUtils.clamp((noise - threshold) / BURN_EDGE + 0.5, 0, 1);
}

/** `color` darkened by `burn`: brown scorch first, black char at the core. */
export function charColor(color: THREE.Color, burn: number): THREE.Color {
  if (burn <= 0) return color;
  color.lerp(SCORCH_COLOR, Math.min(1, burn * 2));
  return burn > 0.5 ? color.lerp(CHAR_COLOR, burn * 2 - 1) : color;
}

/** True when `bone` belongs to a limb the skin has lost. */
export function isSeveredBone(bone: string, limbs: readonly ZombieSeveredLimb[]): boolean {
  return limbs.some((limb) => SEVERED_BONES[limb].lost.test(bone));
}

/**
 * Per triangle of the body (non-indexed), 1 when it is cut away: any of its
 * vertices rides a lost bone, so the cut follows the elbow cleanly.
 */
export function severedTriangles(
  body: ZombieBodyFrame,
  boneNames: readonly string[],
  limbs: readonly ZombieSeveredLimb[],
): Uint8Array {
  const severed = new Uint8Array(body.vertexCount / 3);
  if (limbs.length === 0) return severed;
  const lostBones = new Set(boneNames.flatMap((name, index) => (isSeveredBone(name, limbs) ? [index] : [])));
  for (let triangle = 0; triangle < severed.length; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      if (lostBones.has(body.dominantBone(triangle * 3 + corner))) severed[triangle] = 1;
    }
  }
  return severed;
}

/**
 * One rounded stump per severed limb, centered on the rim the cut leaves
 * (the kept vertices of the removed triangles) and riding the upper arm.
 */
export function buildStumpParts(
  body: ZombieBodyFrame,
  boneNames: readonly string[],
  limbs: readonly ZombieSeveredLimb[],
  severed: Uint8Array,
): AccessoryPart[] {
  const parts: AccessoryPart[] = [];
  const point = new THREE.Vector3();
  for (const limb of limbs) {
    const { lost, stump } = SEVERED_BONES[limb];
    const rim: THREE.Vector3[] = [];
    for (let triangle = 0; triangle < severed.length; triangle++) {
      if (!severed[triangle]) continue;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = triangle * 3 + corner;
        const bone = boneNames[body.dominantBone(vertex)];
        // Rim of this limb only: the kept side of a cut on the same arm.
        if (lost.test(bone) || !bone.startsWith(stump)) continue;
        rim.push(body.bodyPoint(vertex, point).clone());
      }
    }
    if (rim.length === 0) continue;
    const center = rim.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(rim.length);
    const spread = rim.reduce((sum, p) => sum + p.distanceTo(center), 0) / rim.length;
    const radius = Math.max(STUMP_MIN_RADIUS, spread * STUMP_FIT);
    const geometry = new THREE.IcosahedronGeometry(radius, 1).toNonIndexed().translate(center.x, center.y, center.z);
    parts.push({ geometry, color: STUMP_COLOR, bone: stump, detachableHat: false });
  }
  return parts;
}
