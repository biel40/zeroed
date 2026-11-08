import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Side-profile point: [z, y] in meters. -Z is the muzzle, y = 0 the bore axis. */
export type ProfilePoint = readonly [number, number];

/** Shape in the profile plane: x = -z so the extrusion maps back to +Z after rotateY. */
export function profileShape(points: readonly ProfilePoint[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) shape.lineTo(-z, y);
  shape.closePath();
  return shape;
}

export function profilePath(points: readonly ProfilePoint[]): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(-points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) path.lineTo(-z, y);
  path.closePath();
  return path;
}

export interface RoundedEdges {
  /** Bevel steps per edge; three or more read as a rounded edge. */
  readonly segments?: number;
  /** Pulls the bevel inside the outline so the side profile keeps its exact size. */
  readonly keepOutline?: boolean;
  /** Subdivisions of curved contours; small vents need fewer than large silhouettes. */
  readonly curveSegments?: number;
}

/**
 * Extrudes a side profile across X, centered on the bore plane, with a soft
 * edge chamfer. Rounded edges get creased normals: the bevel shades smooth
 * while the profile's sharp corners stay crisp.
 */
export function extrudeProfile(
  shape: THREE.Shape, width: number, bevel = 0, rounded?: RoundedEdges,
): THREE.BufferGeometry {
  const depth = width - bevel * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: rounded?.keepOutline ? -bevel : 0,
    bevelSegments: rounded?.segments ?? 2,
    curveSegments: rounded?.curveSegments ?? 8,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2);
  return rounded ? toCreasedNormals(geometry, Math.PI / 3.2) : geometry;
}

/** Scales an extrusion's width (X) per vertex, e.g. a stock slimmer at the wrist. */
export function shapeWidth(geometry: THREE.BufferGeometry, scale: (y: number, z: number) => number): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setX(i, position.getX(i) * scale(position.getY(i), position.getZ(i)));
  }
  position.needsUpdate = true;
  return toCreasedNormals(geometry, Math.PI / 3.2);
}

/** Cylinder along Z; the first radius is the rear (+Z) end. */
export function cylinderZ(rearRadius: number, frontRadius: number, length: number, segments = 14): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(rearRadius, frontRadius, length, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/**
 * Replaces the UVs with a box projection in metres, one axis per triangle, so
 * texture detail keeps its real size on any part however small. The long
 * texture axis follows the bore on flanks and top faces. Returns a non-indexed
 * geometry; the offset (metres) keeps parts of one material from matching.
 */
export function projectMetricUVs(source: THREE.BufferGeometry, offsetU = 0, offsetV = 0): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let first = 0; first + 2 < position.count; first += 3) {
    a.fromBufferAttribute(position, first);
    b.fromBufferAttribute(position, first + 1);
    c.fromBufferAttribute(position, first + 2);
    normal.subVectors(b, a).cross(c.sub(a));
    const x = Math.abs(normal.x);
    const y = Math.abs(normal.y);
    const z = Math.abs(normal.z);
    for (let vertex = first; vertex < first + 3; vertex++) {
      const along = z > x && z > y ? position.getX(vertex) : position.getZ(vertex);
      const across = y > x && y >= z ? position.getX(vertex) : position.getY(vertex);
      uv[vertex * 2] = along + offsetU;
      uv[vertex * 2 + 1] = across + offsetV;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Cylinder spanning two points (bolt arm, bipod braces). */
export function strut(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.CylinderGeometry {
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}
