import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface PalmPatch {
  /** Inclusive rows and columns of the opening's border in the loft grid. */
  readonly rows: readonly [number, number];
  readonly columns: readonly [number, number];
  readonly radial: number;
}

const pointAt = (geometry: THREE.BufferGeometry, vertex: number): THREE.Vector3 =>
  new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex);

/** Fractions of the perimeter at each vertex, including the closing edge. */
function perimeter(points: readonly THREE.Vector3[]): number[] {
  const distances = [0];
  for (let vertex = 0; vertex < points.length; vertex++) {
    distances.push(distances[vertex] + points[vertex].distanceTo(points[(vertex + 1) % points.length]));
  }
  return distances.map((distance) => distance / distances[distances.length - 1]);
}

function sampleLoop(points: readonly THREE.Vector3[], fractions: readonly number[], t: number): THREE.Vector3 {
  let edge = 0;
  while (edge < points.length - 1 && fractions[edge + 1] < t) edge++;
  const share = (t - fractions[edge]) / (fractions[edge + 1] - fractions[edge]);
  return points[edge].clone().lerp(points[(edge + 1) % points.length], share);
}

/** Two closed loops, with their winding preserved even when their sizes differ. */
function stitch(
  first: readonly number[], firstFractions: readonly number[],
  second: readonly number[], secondFractions: readonly number[],
  indices: number[],
): void {
  let a = 0;
  let b = 0;
  while (a < first.length || b < second.length) {
    const atA = first[a % first.length];
    const atB = second[b % second.length];
    const nextA = a < first.length ? firstFractions[a + 1] : Infinity;
    const nextB = b < second.length ? secondFractions[b + 1] : Infinity;
    if (nextA <= nextB) {
      indices.push(atA, atB, first[(a + 1) % first.length]);
      a++;
    } else {
      indices.push(atA, atB, second[(b + 1) % second.length]);
      b++;
    }
  }
}

/**
 * Replaces a patch of the palm with the thumb's root. The root shares the
 * palm's border vertices and the thumb's first ring, so their positions and
 * skin weights remain identical in every pose. The two intermediate rings
 * turn out of the palm into the metacarpal rather than overlapping it.
 * Consumes the two input geometries.
 */
export function joinThumbRoot(
  palm: THREE.BufferGeometry,
  thumb: THREE.BufferGeometry,
  patch: PalmPatch,
  thumbRadial: number,
  thumbForward: THREE.Vector3,
): THREE.BufferGeometry {
  const rowWidth = patch.radial + 1;
  const [top, bottom] = patch.rows;
  const [left, right] = patch.columns;
  if (top < 0 || bottom <= top || left < 0 || right <= left || right >= patch.radial) {
    throw new Error('Thumb root needs a rectangular patch away from the palm UV seam');
  }
  const border: number[] = [];
  // Winding of the retained palm around the hole, matching a digit ring.
  for (let column = left; column < right; column++) border.push(top * rowWidth + column);
  for (let row = top; row < bottom; row++) border.push(row * rowWidth + right);
  for (let column = right; column > left; column--) border.push(bottom * rowWidth + column);
  for (let row = bottom; row > top; row--) border.push(row * rowWidth + left);

  const palmIndices = palm.index!;
  const kept: number[] = [];
  for (let quad = 0; quad < palmIndices.count / 6; quad++) {
    const row = Math.floor(quad / patch.radial);
    const column = quad % patch.radial;
    if (row >= top && row < bottom && column >= left && column < right) continue;
    for (let corner = 0; corner < 6; corner++) kept.push(palmIndices.getX(quad * 6 + corner));
  }
  palm.setIndex(kept);

  const palmCount = palm.attributes.position.count;
  const geometry = mergeGeometries([palm, thumb]);
  if (!geometry) throw new Error('Palm and thumb attributes are incompatible');
  const thumbBorder = Array.from({ length: thumbRadial }, (_, vertex) => palmCount + vertex);
  const borderPoints = border.map((vertex) => pointAt(geometry, vertex));
  const borderFractions = perimeter(borderPoints);

  // Align the loops with the least twisting of the web. Rotating the tube's
  // start vertex changes only the bridge, never the thumb's authored roll.
  let best: number[] = [];
  let bestFractions: number[] = [];
  let bestCost = Infinity;
  for (let offset = 0; offset < thumbRadial; offset++) {
    const candidate = thumbBorder.map((_, vertex) => thumbBorder[(vertex + offset) % thumbRadial]);
    const points = candidate.map((vertex) => pointAt(geometry, vertex));
    const fractions = perimeter(points);
    const cost = borderPoints.reduce((sum, point, vertex) =>
      sum + point.distanceToSquared(sampleLoop(points, fractions, borderFractions[vertex])), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
      bestFractions = fractions;
    }
  }

  const targetPoints = best.map((vertex) => pointAt(geometry, vertex));
  const targetAt = borderFractions.slice(0, -1).map((t) => sampleLoop(targetPoints, bestFractions, t));
  const center = borderPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(border.length);
  const positions = Array.from(geometry.attributes.position.array);
  const uvs = Array.from(geometry.attributes.uv.array);
  const skinIndices = Array.from(geometry.attributes.skinIndex.array);
  const skinWeights = Array.from(geometry.attributes.skinWeight.array);
  const indices = Array.from(geometry.index!.array);
  // The palm and digit charts occupy different parts of the skin atlas.
  // Duplicate the tube's first ring for the bridge's UVs, while keeping its
  // positions and skin weights exact; normals are joined again below.
  const borderUvs = border.map((vertex) => new THREE.Vector3(
    geometry.attributes.uv.getX(vertex), geometry.attributes.uv.getY(vertex), 0,
  ));
  const bridgeEnd = best.map((source, vertex) => {
    const target = positions.length / 3;
    const point = pointAt(geometry, source);
    const uv = sampleLoop(borderUvs, borderFractions, bestFractions[vertex]);
    positions.push(point.x, point.y, point.z);
    uvs.push(uv.x, uv.y);
    for (let slot = 0; slot < 4; slot++) {
      skinIndices.push(geometry.attributes.skinIndex.getComponent(source, slot));
      skinWeights.push(geometry.attributes.skinWeight.getComponent(source, slot));
    }
    return target;
  });
  let previous = border;

  for (const t of [1 / 3, 2 / 3]) {
    const loop: number[] = [];
    for (let vertex = 0; vertex < border.length; vertex++) {
      const source = border[vertex];
      const from = borderPoints[vertex];
      const to = targetAt[vertex];
      const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, source);
      const reach = from.distanceTo(to);
      const tangent = center.clone().sub(from);
      tangent.addScaledVector(normal, -tangent.dot(normal)).normalize().multiplyScalar(reach);
      // Cubic Hermite section: leaves tangent to the palm and arrives along
      // the thumb, keeping the change in direction across the broad web.
      const t2 = t * t;
      const t3 = t2 * t;
      const point = from.clone().multiplyScalar(2 * t3 - 3 * t2 + 1)
        .addScaledVector(tangent, t3 - 2 * t2 + t)
        .addScaledVector(to, -2 * t3 + 3 * t2)
        .addScaledVector(thumbForward, (t3 - t2) * reach);
      loop.push(positions.length / 3);
      positions.push(point.x, point.y, point.z);

      // The bridge continues the palm chart; the tube keeps its digit chart.
      uvs.push(geometry.attributes.uv.getX(source), geometry.attributes.uv.getY(source));
      const share = THREE.MathUtils.smoothstep(t, 0, 1);
      const weights = new Map<number, number>();
      for (let slot = 0; slot < 4; slot++) {
        const bone = geometry.attributes.skinIndex.getComponent(source, slot);
        const weight = geometry.attributes.skinWeight.getComponent(source, slot) * (1 - share);
        if (weight > 0) weights.set(bone, (weights.get(bone) ?? 0) + weight);
      }
      const thumbBone = thumb.attributes.skinIndex.getX(0);
      weights.set(thumbBone, (weights.get(thumbBone) ?? 0) + share);
      const influences = [...weights];
      for (let slot = 0; slot < 4; slot++) {
        skinIndices.push(influences[slot]?.[0] ?? 0);
        skinWeights.push(influences[slot]?.[1] ?? 0);
      }
    }
    stitch(previous, borderFractions, loop, borderFractions, indices);
    previous = loop;
  }
  stitch(previous, borderFractions, bridgeEnd, bestFractions, indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();

  // The UV seam duplicates a ring vertex. Average its two copies after the
  // bridge joins them, preserving one smooth normal through the root.
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const shared = new THREE.Vector3();
  const position = geometry.attributes.position;
  const byPosition = new Map<string, number[]>();
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)].map((value) => Math.round(value * 1e7)).join(',');
    const group = byPosition.get(key) ?? [];
    group.push(vertex);
    byPosition.set(key, group);
  }
  for (const group of byPosition.values()) {
    if (group.length < 2) continue;
    shared.set(0, 0, 0);
    for (const vertex of group) shared.add(new THREE.Vector3().fromBufferAttribute(normal, vertex));
    shared.normalize();
    for (const vertex of group) normal.setXYZ(vertex, shared.x, shared.y, shared.z);
  }
  palm.dispose();
  thumb.dispose();
  return geometry;
}
