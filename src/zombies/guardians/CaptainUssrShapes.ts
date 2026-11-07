import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A point of a turned profile: height, then radius. */
export type ProfilePoint = readonly [y: number, radius: number];

/**
 * A body part turned about the y axis from `profile` (any order; it is
 * sorted bottom to top so the faces look outwards), optionally only the
 * arc from `phiStart` (0 faces +z) spanning `phiLength`.
 */
export function turned(profile: readonly ProfilePoint[], segments = 18, phiStart = 0, phiLength = Math.PI * 2): THREE.LatheGeometry {
  const points = [...profile].sort((a, b) => a[0] - b[0]).map(([y, radius]) => new THREE.Vector2(radius, y));
  return new THREE.LatheGeometry(points, segments, phiStart, phiLength);
}

/** Radius of `profile` at height `y`, linearly between its points and clamped to its ends. */
export function profileRadius(profile: readonly ProfilePoint[], y: number): number {
  if (y <= profile[0][0]) return profile[0][1];
  for (let index = 1; index < profile.length; index++) {
    const [y1, r1] = profile[index];
    if (y > y1) continue;
    const [y0, r0] = profile[index - 1];
    return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][1];
}

/** A box with rounded edges, which catch the light like stitched leather and cast metal do. */
export function rounded(width: number, height: number, depth: number, radius: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, width / 2, height / 2, depth / 2));
}

/**
 * A strap of `width` and `thickness` laid along a smooth curve through
 * `path`, its outer face turned the way `outward` says at each point (away
 * from the body it wraps). u runs across the strap, v along it, in widths.
 */
export function strap(
  path: readonly THREE.Vector3[],
  width: number,
  thickness: number,
  outward: (point: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3,
  samples = 20,
): THREE.BufferGeometry {
  const points = new THREE.CatmullRomCurve3([...path]).getSpacedPoints(samples);
  const tangent = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  // Four corners per sample: outer right, outer left, inner left, inner right.
  const corners: THREE.Vector3[][] = [];
  const along: number[] = [];
  let length = 0;
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    tangent.subVectors(next, previous).normalize();
    outward(point, up);
    side.crossVectors(tangent, up).normalize();
    up.crossVectors(side, tangent).normalize();
    const half = side.clone().multiplyScalar(width / 2);
    const lift = up.clone().multiplyScalar(thickness / 2);
    corners.push([
      point.clone().add(half).add(lift),
      point.clone().sub(half).add(lift),
      point.clone().sub(half).sub(lift),
      point.clone().add(half).sub(lift),
    ]);
    if (index > 0) length += point.distanceTo(previous);
    along.push(length / width);
  });
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // Each face is its own strip of rows (corner a to corner b), so its edges stay sharp.
  for (const [a, b] of [[1, 0], [0, 3], [3, 2], [2, 1]] as const) {
    const first = positions.length / 3;
    corners.forEach((corner, row) => {
      positions.push(...corner[a].toArray(), ...corner[b].toArray());
      uvs.push(0, along[row], 1, along[row]);
      if (row === 0) return;
      const top = first + row * 2;
      indices.push(top - 2, top - 1, top, top - 1, top + 1, top);
    });
  }
  for (const [row, flip] of [[0, false], [corners.length - 1, true]] as const) {
    const first = positions.length / 3;
    for (const corner of corners[row]) {
      positions.push(...corner.toArray());
      uvs.push(0, 0);
    }
    indices.push(...(flip ? [first, first + 2, first + 1, first, first + 3, first + 2] : [first, first + 1, first + 2, first, first + 2, first + 3]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The faceted five-pointed star of Soviet insignia, point up, facing +z:
 * every arm rises to a ridge from its tip to the raised centre (`height`
 * over its base at z = 0), over a wall `depth` deep and a flat back. Flat
 * shaded, so each facet catches the light on its own.
 */
export function facetedStar(outer: number, inner: number, height: number, depth: number): THREE.BufferGeometry {
  const outline = Array.from({ length: 10 }, (_, point) => {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const positions: number[] = [];
  const corner = (point: THREE.Vector2, z: number): void => {
    positions.push(point.x, point.y, z);
  };
  for (let index = 0; index < 10; index++) {
    const p = outline[index];
    const q = outline[(index + 1) % 10];
    positions.push(0, 0, height);
    corner(p, 0);
    corner(q, 0);
    corner(p, 0);
    corner(p, -depth);
    corner(q, -depth);
    corner(p, 0);
    corner(q, -depth);
    corner(q, 0);
    positions.push(0, 0, -depth);
    corner(q, -depth);
    corner(p, -depth);
  }
  const uvs: number[] = [];
  for (let index = 0; index < positions.length; index += 3) uvs.push(positions[index] / (2 * outer) + 0.5, positions[index + 1] / (2 * outer) + 0.5);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
