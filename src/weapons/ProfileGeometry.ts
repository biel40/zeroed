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
    curveSegments: 8,
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

/** Cylinder spanning two points (bolt arm, bipod braces). */
export function strut(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.CylinderGeometry {
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}
