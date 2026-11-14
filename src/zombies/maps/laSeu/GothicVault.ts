import * as THREE from 'three';

/**
 * Gothic geometry shared by La Seu's builders: the pointed arch, the
 * four-part rib vault it generates, the ribs that follow it and the flat
 * shapes (windows, arch bands) cut to it. Pure geometry, no materials.
 */

const SQRT3 = Math.sqrt(3);

/** Height (0..1) of an equilateral pointed arch at `s` in [-1, 1] across its span. */
export function pointedArch(s: number): number {
  const reach = Math.min(1, Math.abs(s)) + 1;
  return Math.sqrt(Math.max(0, 4 - reach * reach)) / SQRT3;
}

/** `segments + 1` positions across a span in [-1, 1], gathered towards the springs where the arch is steepest. */
function archSamples(segments: number): number[] {
  return Array.from({ length: segments + 1 }, (_, index) => Math.sin((index / segments - 0.5) * Math.PI));
}

export interface VaultBay {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly springY: number;
  readonly apexY: number;
}

/** Ceiling height of a four-part vault: the higher of the two pointed tunnels that cross over the bay. */
export function vaultHeightAt(bay: VaultBay, x: number, z: number): number {
  const sx = (x - (bay.minX + bay.maxX) / 2) / ((bay.maxX - bay.minX) / 2);
  const sz = (z - (bay.minZ + bay.maxZ) / 2) / ((bay.maxZ - bay.minZ) / 2);
  return bay.springY + (bay.apexY - bay.springY) * Math.max(pointedArch(sx), pointedArch(sz));
}

/**
 * Underside of a four-part vault over `bay`, facing down. Quads are split
 * along the groins, so the creases follow the bay's diagonals exactly.
 */
export function ribVaultGeometry(bay: VaultBay, segments: number, metersPerTile: number): THREE.BufferGeometry {
  const samples = archSamples(segments);
  const side = segments + 1;
  const centerX = (bay.minX + bay.maxX) / 2;
  const centerZ = (bay.minZ + bay.maxZ) / 2;
  const halfWidth = (bay.maxX - bay.minX) / 2;
  const halfDepth = (bay.maxZ - bay.minZ) / 2;
  const rise = bay.apexY - bay.springY;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const vertex = j * side + i;
      const x = centerX + halfWidth * samples[i];
      const z = centerZ + halfDepth * samples[j];
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = bay.springY + rise * Math.max(pointedArch(samples[i]), pointedArch(samples[j]));
      positions[vertex * 3 + 2] = z;
      uvs[vertex * 2] = x / metersPerTile;
      uvs[vertex * 2 + 1] = z / metersPerTile;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      const sameSign = (samples[i] + samples[i + 1]) * (samples[j] + samples[j + 1]) > 0;
      if (sameSign) indices.push(a, b, d, a, d, c);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Points of a pointed arch standing over the straight plan line from (`fromX`, `fromZ`) to (`toX`, `toZ`). */
export function archPoints(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  springY: number,
  rise: number,
  segments: number,
): THREE.Vector3[] {
  return archSamples(segments).map((s) => new THREE.Vector3(
    THREE.MathUtils.lerp(fromX, toX, (s + 1) / 2),
    springY + rise * pointedArch(s),
    THREE.MathUtils.lerp(fromZ, toZ, (s + 1) / 2),
  ));
}

/**
 * A rib following `points` (which lie in one vertical plane): one box per
 * stretch, `width` across the plane and `depth` within it.
 */
export function ribGeometries(points: ReadonlyArray<THREE.Vector3>, width: number, depth: number): THREE.BufferGeometry[] {
  const first = points[0];
  const last = points[points.length - 1];
  const across = new THREE.Vector3(last.z - first.z, 0, first.x - last.x).normalize();
  const along = new THREE.Vector3();
  const inPlane = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const geometries: THREE.BufferGeometry[] = [];
  for (let index = 0; index + 1 < points.length; index++) {
    const from = points[index];
    const to = points[index + 1];
    along.subVectors(to, from);
    const length = along.length();
    along.divideScalar(length);
    inPlane.crossVectors(along, across);
    basis.makeBasis(across, inPlane, along).setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    // A little overlap hides the joints where the rib bends.
    geometries.push(new THREE.BoxGeometry(width, depth, length + depth * 0.4).applyMatrix4(basis));
  }
  return geometries;
}

/** A window or doorway outline: upright sides from `sillY` to `shoulderY` under a pointed head reaching `apexY`. */
export function lancetShape(width: number, sillY: number, shoulderY: number, apexY: number, segments: number): THREE.Shape {
  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, sillY);
  shape.lineTo(half, sillY);
  for (const s of archSamples(segments).reverse()) shape.lineTo(half * s, shoulderY + (apexY - shoulderY) * pointedArch(s));
  shape.closePath();
  return shape;
}

/** The wall left between a pointed arch and a level line at `topY` above it. */
export function archSpandrelShape(halfSpan: number, springY: number, rise: number, topY: number, segments: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, topY);
  for (const s of archSamples(segments)) shape.lineTo(halfSpan * s, springY + rise * pointedArch(s));
  shape.lineTo(halfSpan, topY);
  shape.closePath();
  return shape;
}

/** The wall between two pointed arches of one span: an arcade arch below, the vault's wall arch above. */
export function archBandShape(
  halfSpan: number,
  lowerSpringY: number,
  lowerRise: number,
  upperSpringY: number,
  upperRise: number,
  segments: number,
): THREE.Shape {
  const samples = archSamples(segments);
  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, lowerSpringY);
  for (const s of samples) shape.lineTo(halfSpan * s, lowerSpringY + lowerRise * pointedArch(s));
  for (const s of [...samples].reverse()) shape.lineTo(halfSpan * s, upperSpringY + upperRise * pointedArch(s));
  shape.closePath();
  return shape;
}

/** Which way a flat wall piece looks. */
export type WallFacing = 'px' | 'nx' | 'pz' | 'nz';

export const FACING_YAW: Readonly<Record<WallFacing, number>> = { pz: 0, px: Math.PI / 2, nz: Math.PI, nx: -Math.PI / 2 };

/**
 * Stands a shape drawn in (along-the-wall, height) coordinates on a wall
 * looking `facing`, with its origin at (`x`, 0, `z`). `metersPerTile` gives
 * world-scale UVs; omitted, the UVs span the shape's own bounds (glass).
 */
export function wallShapeGeometry(shape: THREE.Shape, facing: WallFacing, x: number, z: number, metersPerTile?: number): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  for (let index = 0; index < uv.count; index++) {
    const px = position.getX(index);
    const py = position.getY(index);
    if (metersPerTile) uv.setXY(index, px / metersPerTile, py / metersPerTile);
    else uv.setXY(index, (px - min.x) / (max.x - min.x), (py - min.y) / (max.y - min.y));
  }
  return geometry.rotateY(FACING_YAW[facing]).translate(x, 0, z);
}
