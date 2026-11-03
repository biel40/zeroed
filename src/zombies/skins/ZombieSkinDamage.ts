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
 * Skeleton index each lost bone hands its weight to: the upper arm it was cut
 * from, so the kept elbow stops following a forearm that is no longer there
 * and the rim stays flush with its rigid cap.
 */
export function severedBoneRemap(boneNames: readonly string[], limbs: readonly ZombieSeveredLimb[]): Map<number, number> {
  const remap = new Map<number, number>();
  for (const limb of limbs) {
    const { lost, stump } = SEVERED_BONES[limb];
    const stumpIndex = boneNames.indexOf(stump);
    if (stumpIndex < 0) throw new Error(`Zombie rig has no bone "${stump}"`);
    boneNames.forEach((name, index) => {
      if (lost.test(name)) remap.set(index, stumpIndex);
    });
  }
  return remap;
}

/** Bind-pose position key, so seams split by the UVs still share their edges. */
function pointKey(body: ZombieBodyFrame, vertex: number, point: THREE.Vector3): string {
  body.bodyPoint(vertex, point);
  return `${Math.round(point.x * 1e4)},${Math.round(point.y * 1e4)},${Math.round(point.z * 1e4)}`;
}

/**
 * One flat cap per severed limb: a fan from the center of the cut over every
 * edge the removed triangles left open, facing the lost forearm, so the arm
 * simply ends where it was cut.
 */
export function buildStumpParts(
  body: ZombieBodyFrame,
  boneNames: readonly string[],
  limbs: readonly ZombieSeveredLimb[],
  severed: Uint8Array,
): AccessoryPart[] {
  const point = new THREE.Vector3();
  const limbOf = (triangle: number): ZombieSeveredLimb | undefined => limbs.find((limb) => {
    for (let corner = 0; corner < 3; corner++) {
      if (SEVERED_BONES[limb].lost.test(boneNames[body.dominantBone(triangle * 3 + corner)])) return true;
    }
    return false;
  });
  const keptEdges = new Map<string, readonly [number, number]>();
  const cutEdges = new Map<string, ZombieSeveredLimb>();
  for (let triangle = 0; triangle < severed.length; triangle++) {
    const limb = severed[triangle] ? limbOf(triangle) : undefined;
    if (severed[triangle] && !limb) continue;
    for (let corner = 0; corner < 3; corner++) {
      const a = triangle * 3 + corner;
      const b = triangle * 3 + ((corner + 1) % 3);
      const keyA = pointKey(body, a, point);
      const keyB = pointKey(body, b, point);
      const edge = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
      if (limb) cutEdges.set(edge, limb);
      else keptEdges.set(edge, [a, b]);
    }
  }

  const parts: AccessoryPart[] = [];
  for (const limb of limbs) {
    const rim = [...keptEdges].filter(([edge]) => cutEdges.get(edge) === limb).map(([, ends]) => ends);
    if (rim.length === 0) continue;
    const center = new THREE.Vector3();
    for (const [a, b] of rim) center.add(body.bodyPoint(a, point)).add(body.bodyPoint(b, point));
    center.divideScalar(rim.length * 2);
    // Outward is toward where the forearm used to be.
    const lostCenter = new THREE.Vector3();
    let lostCount = 0;
    for (let vertex = 0; vertex < body.vertexCount; vertex++) {
      if (!SEVERED_BONES[limb].lost.test(boneNames[body.dominantBone(vertex)])) continue;
      lostCenter.add(body.bodyPoint(vertex, point));
      lostCount++;
    }
    const outward = lostCenter.divideScalar(Math.max(1, lostCount)).sub(center);

    const positions = new Float32Array(rim.length * 9);
    const pointA = new THREE.Vector3();
    const pointB = new THREE.Vector3();
    const normal = new THREE.Vector3();
    rim.forEach(([a, b], index) => {
      body.bodyPoint(a, pointA);
      body.bodyPoint(b, pointB);
      normal.subVectors(pointA, center).cross(point.subVectors(pointB, center));
      const [first, second] = normal.dot(outward) >= 0 ? [pointA, pointB] : [pointB, pointA];
      center.toArray(positions, index * 9);
      first.toArray(positions, index * 9 + 3);
      second.toArray(positions, index * 9 + 6);
    });
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    parts.push({ geometry, color: STUMP_COLOR, bone: SEVERED_BONES[limb].stump, detachableHat: false });
  }
  return parts;
}
