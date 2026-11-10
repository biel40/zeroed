import * as THREE from 'three';

/** Upper bound of surface points tested per hit; denser meshes are strided down to it. */
export const MAX_SURFACE_SAMPLES = 2048;
/** A ray passing farther than this (m) from every surface point missed the visible body. */
export const MAX_SURFACE_SNAP = 0.06;
/** Points this much (m) farther from the ray than the closest still count as "on the ray"; the nearest to the shooter wins. */
const FRONT_SLACK = 0.03;
/** Quantization (m) that merges the split vertices of one surface point. */
const WELD_STEP = 0.001;

/** Bind-pose surface points of one skinned geometry, welded and strided once per geometry. */
interface SurfaceSamples {
  readonly count: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly dominantBones: Uint16Array;
}

/** Where a ray meets the animated skin: world point, outward world normal and the bone that carries it. */
export interface SkinSurfaceHit {
  bone: THREE.Bone | null;
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
}

const samplesByGeometry = new WeakMap<THREE.BufferGeometry, SurfaceSamples>();

/**
 * Welds coincident vertices (UV and normal seams split them) and keeps at
 * most MAX_SURFACE_SAMPLES evenly strided points with their averaged normal
 * and skin binding. Shared by every pooled body that uses the geometry.
 */
function surfaceSamples(geometry: THREE.BufferGeometry): SurfaceSamples {
  const cached = samplesByGeometry.get(geometry);
  if (cached) return cached;

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const welded = new Map<string, number>();
  const firstVertex: number[] = [];
  const normalSums: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = `${Math.round(position.getX(vertex) / WELD_STEP)},${Math.round(position.getY(vertex) / WELD_STEP)},${Math.round(position.getZ(vertex) / WELD_STEP)}`;
    let point = welded.get(key);
    if (point === undefined) {
      point = firstVertex.length;
      welded.set(key, point);
      firstVertex.push(vertex);
      normalSums.push(0, 0, 0);
    }
    if (normal) {
      normalSums[point * 3] += normal.getX(vertex);
      normalSums[point * 3 + 1] += normal.getY(vertex);
      normalSums[point * 3 + 2] += normal.getZ(vertex);
    }
  }

  const stride = Math.max(1, Math.ceil(firstVertex.length / MAX_SURFACE_SAMPLES));
  const count = Math.ceil(firstVertex.length / stride);
  const samples: SurfaceSamples = {
    count,
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    skinIndices: new Uint16Array(count * 4),
    skinWeights: new Float32Array(count * 4),
    dominantBones: new Uint16Array(count),
  };
  const averaged = new THREE.Vector3();
  for (let sample = 0; sample < count; sample++) {
    const point = sample * stride;
    const vertex = firstVertex[point];
    samples.positions[sample * 3] = position.getX(vertex);
    samples.positions[sample * 3 + 1] = position.getY(vertex);
    samples.positions[sample * 3 + 2] = position.getZ(vertex);
    averaged.fromArray(normalSums, point * 3);
    if (averaged.lengthSq() > 0) averaged.normalize();
    averaged.toArray(samples.normals, sample * 3);
    let heaviest = 0;
    for (let influence = 0; influence < 4; influence++) {
      const weight = skinWeight.getComponent(vertex, influence);
      samples.skinIndices[sample * 4 + influence] = skinIndex.getComponent(vertex, influence);
      samples.skinWeights[sample * 4 + influence] = weight;
      if (weight > samples.skinWeights[sample * 4 + heaviest]) heaviest = influence;
    }
    samples.dominantBones[sample] = samples.skinIndices[sample * 4 + heaviest];
  }
  samplesByGeometry.set(geometry, samples);
  return samples;
}

/**
 * Welds and samples `mesh`'s geometry ahead of time (once per geometry,
 * shared by every body using it), so the first bullet never pays for it.
 */
export function prepareSkinSurface(mesh: THREE.SkinnedMesh): void {
  surfaceSamples(mesh.geometry);
}

/**
 * Finds where a confirmed shot meets the visible skin of an animated body
 * without a full skinned raycast: a bounded set of surface points is
 * skinned on the CPU (one matrix per bone, then a weighted sum per point)
 * and the point nearest to the ray, front-most, wins. The caller must have
 * refreshed the body's world matrices this frame.
 */
export class SkinSurfaceSampler {
  private readonly samples: SurfaceSamples;
  private readonly boneMatrices: THREE.Matrix4[];
  private readonly skinned: Float32Array;
  private readonly distances: Float32Array;
  private readonly depths: Float32Array;
  private readonly tmpPoint = new THREE.Vector3();
  private readonly tmpWeighted = new THREE.Vector3();
  private readonly tmpOffset = new THREE.Vector3();

  public constructor(private readonly mesh: THREE.SkinnedMesh) {
    this.samples = surfaceSamples(mesh.geometry);
    this.boneMatrices = mesh.skeleton.bones.map(() => new THREE.Matrix4());
    this.skinned = new Float32Array(this.samples.count * 3);
    this.distances = new Float32Array(this.samples.count);
    this.depths = new Float32Array(this.samples.count);
  }

  /** False when the ray (unit `direction`) passes the skin farther than MAX_SURFACE_SNAP: no plausible entry point. */
  public locate(origin: THREE.Vector3, direction: THREE.Vector3, out: SkinSurfaceHit): boolean {
    const { samples, skinned, distances, depths } = this;
    if (samples.count === 0) return false;
    this.updateBoneMatrices();

    let closest = Infinity;
    for (let sample = 0; sample < samples.count; sample++) {
      this.skinSample(sample, this.tmpPoint);
      this.tmpPoint.toArray(skinned, sample * 3);
      const depth = this.tmpOffset.subVectors(this.tmpPoint, origin).dot(direction);
      const distance = depth > 0
        ? this.tmpOffset.addScaledVector(direction, -depth).length()
        : Infinity;
      depths[sample] = depth;
      distances[sample] = distance;
      if (distance < closest) closest = distance;
    }
    if (closest > MAX_SURFACE_SNAP) return false;

    let chosen = -1;
    for (let sample = 0; sample < samples.count; sample++) {
      if (distances[sample] > closest + FRONT_SLACK) continue;
      if (chosen < 0 || depths[sample] < depths[chosen]) chosen = sample;
    }

    const bone = samples.dominantBones[chosen];
    out.bone = this.mesh.skeleton.bones[bone] ?? null;
    out.normal.fromArray(samples.normals, chosen * 3).transformDirection(this.boneMatrices[bone]);
    // Seams and sparse points can leave a back-facing normal: face the shooter instead.
    if (out.normal.lengthSq() === 0 || out.normal.dot(direction) > 0) out.normal.copy(direction).negate();
    // Slide the point within its tangent plane onto the ray: the exact entry
    // spot laterally, still seated on the sampled skin.
    const point = out.position.fromArray(skinned, chosen * 3);
    const depth = this.tmpOffset.subVectors(point, origin).dot(direction);
    this.tmpOffset.copy(origin).addScaledVector(direction, depth).sub(point);
    this.tmpOffset.addScaledVector(out.normal, -this.tmpOffset.dot(out.normal));
    point.add(this.tmpOffset);
    return true;
  }

  /** World matrix per bone that maps a bind-pose vertex to its animated world position. */
  private updateBoneMatrices(): void {
    const { mesh } = this;
    const { bones, boneInverses } = mesh.skeleton;
    for (let bone = 0; bone < bones.length; bone++) {
      this.boneMatrices[bone]
        .multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
        .multiply(bones[bone].matrixWorld)
        .multiply(boneInverses[bone])
        .multiply(mesh.bindMatrix);
    }
  }

  private skinSample(sample: number, target: THREE.Vector3): void {
    const { samples } = this;
    target.set(0, 0, 0);
    for (let influence = 0; influence < 4; influence++) {
      const weight = samples.skinWeights[sample * 4 + influence];
      if (weight === 0) continue;
      const matrix = this.boneMatrices[samples.skinIndices[sample * 4 + influence]];
      target.addScaledVector(this.tmpWeighted.fromArray(samples.positions, sample * 3).applyMatrix4(matrix), weight);
    }
  }
}
