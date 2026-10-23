import * as THREE from 'three';

/** Up to four bone influences of one vertex; unused slots keep weight 0. */
export class SkinWeights {
  readonly bones = [0, 0, 0, 0];
  readonly weights = [0, 0, 0, 0];

  clear(): this {
    this.bones.fill(0);
    this.weights.fill(0);
    return this;
  }

  /** Adds `weight` to `bone`, merging with an existing slot for the same bone. */
  add(bone: number, weight: number): this {
    if (weight <= 0) return this;
    for (let slot = 0; slot < 4; slot++) {
      if (this.weights[slot] > 0 && this.bones[slot] === bone) {
        this.weights[slot] += weight;
        return this;
      }
    }
    const slot = this.weights.indexOf(0);
    if (slot < 0) throw new Error('A vertex takes at most four bones');
    this.bones[slot] = bone;
    this.weights[slot] = weight;
    return this;
  }
}

export interface LoftSpec {
  /** Ring parameters along the loft, in order. */
  readonly stations: readonly number[];
  /** Vertices around each ring (the seam column is duplicated for the UVs). */
  readonly radial: number;
  /**
   * Bind-space point of ring `station` at `around` (0..1, seam at 0). Faces
   * point along (d point / d station) x (d point / d around), so that cross
   * product must point out of the surface.
   */
  readonly point: (station: number, around: number, out: THREE.Vector3) => void;
  /** Bone influences of that point. */
  readonly skin: (station: number, around: number, point: THREE.Vector3, out: SkinWeights) => void;
  readonly uv: (station: number, around: number) => readonly [number, number];
  /** Collapses the last station into one apex vertex instead of an open ring. */
  readonly apex?: boolean;
}

/**
 * Skinned lofted surface: rings of `radial` points along `stations`,
 * smooth-shaded across the UV seam. Used for every organic part of the arm
 * (sleeve, hand, digits) so they bend at their joints instead of hinging.
 */
export function skinnedLoft(spec: LoftSpec): THREE.BufferGeometry {
  const { stations, radial } = spec;
  const rings = spec.apex ? stations.length - 1 : stations.length;
  const row = radial + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const weights = new SkinWeights();

  const pushVertex = (station: number, around: number) => {
    spec.point(station, around, point);
    spec.skin(station, around, point, weights.clear());
    const total = weights.weights.reduce((sum, weight) => sum + weight, 0);
    positions.push(point.x, point.y, point.z);
    uvs.push(...spec.uv(station, around));
    skinIndex.push(...weights.bones);
    skinWeight.push(...weights.weights.map((weight) => weight / total));
  };

  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment <= radial; segment++) pushVertex(stations[ring], segment / radial);
  }
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let segment = 0; segment < radial; segment++) {
      const a = ring * row + segment;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (spec.apex) {
    const apex = rings * row;
    pushVertex(stations[stations.length - 1], 0.5);
    const last = (rings - 1) * row;
    for (let segment = 0; segment < radial; segment++) indices.push(last + segment, apex, last + segment + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The duplicated seam columns share one smooth normal.
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const shared = new THREE.Vector3();
  for (let ring = 0; ring < rings; ring++) {
    const first = ring * row;
    const last = first + radial;
    shared.fromBufferAttribute(normal, first).add(point.fromBufferAttribute(normal, last)).normalize();
    normal.setXYZ(first, shared.x, shared.y, shared.z);
    normal.setXYZ(last, shared.x, shared.y, shared.z);
  }
  return geometry;
}
