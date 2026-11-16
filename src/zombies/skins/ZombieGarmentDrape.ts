import * as THREE from 'three';
import type { BodyMeasures } from './ZombieAccessoryGeometry';
import type { ZombieBodyFrame } from './ZombieBodyFrame';

/** Bones whose surface a draped garment follows above the hips. */
const TORSO_BONES: readonly string[] = ['Hips', 'Spine', 'Spine1', 'Spine2'];
/** Influences cloth never copies: a collar must not turn with the head. */
const HEAD_BONES: readonly string[] = ['Neck', 'Head'];
/**
 * Share of the weight the thighs take from the knee down; the hips keep the
 * rest, so a hem hangs from the waist instead of riding the legs like trousers.
 */
const LEG_PULL = 0.7;
/**
 * Width of the left-right blend across the skirt, in thigh offsets from the
 * midline: a wide blend spreads a stride over the whole ring of cloth, keeping
 * every triangle within the stretch the walker's own body shows.
 */
const SIDE_BLEND = 4;
/** Torso vertices blended for the weights of a point above the hips. */
const SURFACE_SAMPLES = 20;
/**
 * Weight of a height difference against a horizontal one when finding the torso
 * under a point: wide cloth (a cope, a cloak) far from the body must take the
 * weights of the spine at its own height, not of the hips that happen to be near.
 */
const HEIGHT_BIAS = 1.5;
/** Influences per vertex the walker's skinning supports. */
const INFLUENCES = 4;

type SkinAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/**
 * Skin weights of long cloth without cloth simulation. Above the hips a
 * point copies the weights of the nearest torso vertex, so the garment
 * bends with the spine like the shirt under it; below, part of the weight
 * moves onto both thighs by height and side, so a skirt or panel opens
 * between the legs while they stride instead of tearing along one leg.
 */
export class ZombieGarmentDrape {
  private readonly torsoVertices: number[] = [];
  private readonly headBones: ReadonlySet<number>;
  private readonly leftThigh: number;
  private readonly rightThigh: number;
  private readonly surfaceCache = new Map<string, ReadonlyMap<number, number>>();
  private readonly target = new THREE.Vector3();
  private readonly candidate = new THREE.Vector3();
  private readonly influence = new Map<number, number>();

  public constructor(
    private readonly body: ZombieBodyFrame,
    private readonly skinIndex: SkinAttribute,
    private readonly skinWeight: SkinAttribute,
    private readonly measures: Pick<BodyMeasures, 'hipBottomY' | 'kneeY' | 'legX'>,
  ) {
    const torso = new Set(TORSO_BONES.map((name) => body.boneIndex(name)));
    this.headBones = new Set(HEAD_BONES.map((name) => body.boneIndex(name)));
    for (let vertex = 0; vertex < body.vertexCount; vertex++) {
      if (torso.has(body.dominantBone(vertex))) this.torsoVertices.push(vertex);
    }
    this.leftThigh = body.boneIndex('LeftUpLeg');
    this.rightThigh = body.boneIndex('RightUpLeg');
  }

  /** Writes the four strongest influences at a body-frame point into slot `offset`, summing to 1. */
  public weightsAt(point: THREE.Vector3, indices: Uint16Array, weights: Float32Array, offset: number): void {
    const { hipBottomY, kneeY, legX } = this.measures;
    const legShare = LEG_PULL * THREE.MathUtils.smoothstep(hipBottomY - point.y, 0, hipBottomY - kneeY);
    const left = THREE.MathUtils.clamp(0.5 + point.x / (2 * legX * SIDE_BLEND), 0, 1);

    this.influence.clear();
    for (const [bone, weight] of this.torsoWeightsNear(point)) this.add(bone, weight * (1 - legShare));
    this.add(this.leftThigh, legShare * left);
    this.add(this.rightThigh, legShare * (1 - left));

    const strongest = [...this.influence.entries()].sort((a, b) => b[1] - a[1]).slice(0, INFLUENCES);
    const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
    for (let slot = 0; slot < INFLUENCES; slot++) {
      const entry = strongest[slot];
      indices[offset * INFLUENCES + slot] = entry ? entry[0] : 0;
      weights[offset * INFLUENCES + slot] = entry ? entry[1] / total : 0;
    }
  }

  private add(bone: number, weight: number): void {
    if (weight > 0) this.influence.set(bone, (this.influence.get(bone) ?? 0) + weight);
  }

  /**
   * Skin weights of the torso surface under the point (raised to the hips so
   * skirts take the hip weights): an inverse-distance blend of the nearest
   * torso vertices, smooth enough that neighboring cloth vertices agree.
   */
  private torsoWeightsNear(point: THREE.Vector3): ReadonlyMap<number, number> {
    const target = this.target.set(point.x, Math.max(point.y, this.measures.hipBottomY), point.z);
    const key = `${target.x.toFixed(3)},${target.y.toFixed(3)},${target.z.toFixed(3)}`;
    const cached = this.surfaceCache.get(key);
    if (cached) return cached;
    const nearest: Array<{ vertex: number; distance: number }> = [];
    for (const vertex of this.torsoVertices) {
      const surface = this.body.bodyPoint(vertex, this.candidate);
      const distance = Math.hypot(surface.x - target.x, (surface.y - target.y) * HEIGHT_BIAS, surface.z - target.z);
      if (nearest.length === SURFACE_SAMPLES && distance >= nearest[SURFACE_SAMPLES - 1].distance) continue;
      nearest.push({ vertex, distance });
      nearest.sort((a, b) => a.distance - b.distance);
      if (nearest.length > SURFACE_SAMPLES) nearest.pop();
    }
    const blend = new Map<number, number>();
    let total = 0;
    for (const { vertex, distance } of nearest) {
      const share = 1 / Math.max(distance, 1e-3);
      for (let slot = 0; slot < INFLUENCES; slot++) {
        const bone = this.skinIndex.getComponent(vertex, slot);
        const weight = this.skinWeight.getComponent(vertex, slot) * share;
        if (weight <= 0 || this.headBones.has(bone)) continue;
        blend.set(bone, (blend.get(bone) ?? 0) + weight);
        total += weight;
      }
    }
    for (const [bone, weight] of blend) blend.set(bone, weight / total);
    this.surfaceCache.set(key, blend);
    return blend;
  }
}
