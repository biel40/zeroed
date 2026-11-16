import * as THREE from 'three';
import type { ZombieBodyFrame } from './ZombieBodyFrame';

/**
 * Low-poly building blocks for walker accessories and garments, authored in
 * the upright body frame of ZombieBodyFrame (meters, x = the body's left,
 * y = up from the soles, z = forward).
 */

/** Elliptical cross-section of a body part at a height (body frame, meters). */
export interface Section {
  readonly x: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
}

/** Low-poly ring resolution, matching the walker's faceted look. */
export const RING_SEGMENTS = 10;
/** Clearance between cloth and the skin under it, as a radius factor. */
export const FIT = 1.08;

export function sectionOf(box: THREE.Box3): Section {
  return {
    x: (box.min.x + box.max.x) / 2,
    z: (box.min.z + box.max.z) / 2,
    rx: (box.max.x - box.min.x) / 2,
    rz: (box.max.z - box.min.z) / 2,
  };
}

export function scaled(section: Section, sx: number, sz = sx): Section {
  return { ...section, rx: section.rx * sx, rz: section.rz * sz };
}

export function ringPoint(section: Section, y: number, angle: number): THREE.Vector3 {
  return new THREE.Vector3(section.x + Math.sin(angle) * section.rx, y, section.z + Math.cos(angle) * section.rz);
}

export function trianglesGeometry(points: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  return geometry;
}

/**
 * Lofted elliptical tube from `bottom` at y0 to `top` at y1, outward facing,
 * optionally capped on top. Angles start at the front (+z) and turn to the
 * left (+x); `arc` below 2π leaves an open shell (visors, flaps).
 */
export function loft(
  bottom: Section, y0: number, top: Section, y1: number,
  options: { readonly capTop?: boolean; readonly arc?: number; readonly start?: number } = {},
): THREE.BufferGeometry {
  const arc = options.arc ?? Math.PI * 2;
  const start = options.start ?? 0;
  const points: THREE.Vector3[] = [];
  const topCenter = new THREE.Vector3(top.x, y1, top.z);
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a0 = start + (arc * i) / RING_SEGMENTS;
    const a1 = start + (arc * (i + 1)) / RING_SEGMENTS;
    const b0 = ringPoint(bottom, y0, a0);
    const b1 = ringPoint(bottom, y0, a1);
    const t0 = ringPoint(top, y1, a0);
    const t1 = ringPoint(top, y1, a1);
    points.push(b0, b1, t0, t0, b1, t1);
    if (options.capTop) points.push(topCenter, t0, t1);
  }
  return trianglesGeometry(points);
}

/** Adds the reversed copy of every triangle, for open shells seen from inside. */
export function doubleSided(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const front = geometry.getAttribute('position').array;
  const back = new Float32Array(front.length);
  for (let i = 0; i < front.length; i += 9) {
    back.set(front.subarray(i, i + 3), i);
    back.set(front.subarray(i + 6, i + 9), i + 3);
    back.set(front.subarray(i + 3, i + 6), i + 6);
  }
  const both = new Float32Array(front.length * 2);
  both.set(front);
  both.set(back, front.length);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(both, 3));
  return geometry;
}

/** Flat horizontal slab over part of an ellipse (visors), both faces. */
export function slab(section: Section, y: number, thickness: number, start: number, arc: number, droop: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const center = new THREE.Vector3(section.x, y, section.z);
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a0 = start + (arc * i) / RING_SEGMENTS;
    const a1 = start + (arc * (i + 1)) / RING_SEGMENTS;
    const p0 = ringPoint(section, y - droop * Math.cos(a0), a0);
    const p1 = ringPoint(section, y - droop * Math.cos(a1), a1);
    const q0 = p0.clone().setY(p0.y - thickness);
    const q1 = p1.clone().setY(p1.y - thickness);
    const under = center.clone().setY(y - thickness);
    points.push(center, p0, p1, under, q1, q0, p0, q0, p1, p1, q0, q1);
  }
  return trianglesGeometry(points);
}

export function box(size: readonly [number, number, number], position: THREE.Vector3, rotation = new THREE.Euler()): THREE.BufferGeometry {
  return new THREE.BoxGeometry(...size).toNonIndexed().applyMatrix4(
    new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1)),
  );
}

/** Flat five-pointed star facing +z, rotated by `rotation` and centered on `position`. */
export function star(radius: number, position: THREE.Vector3, rotation = new THREE.Euler()): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const tip = (index: number): THREE.Vector3 => {
    const r = index % 2 === 0 ? radius : radius * 0.42;
    const angle = (index * Math.PI) / 5;
    return new THREE.Vector3(Math.sin(angle) * r, Math.cos(angle) * r, 0);
  };
  for (let i = 0; i < 10; i++) points.push(new THREE.Vector3(), tip(i + 1), tip(i));
  return trianglesGeometry(points).applyMatrix4(
    new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1)),
  );
}

/** Front surface point of a section at `y`, pushed out by `gap`. */
export function frontOf(section: Section, y: number, gap: number): THREE.Vector3 {
  return new THREE.Vector3(section.x, y, section.z + section.rz + gap);
}

export interface BodyMeasures {
  /** Skull above the brow, where every hat sits. */
  readonly crown: Section;
  readonly crownTop: number;
  readonly browY: number;
  readonly waist: Section;
  readonly waistY: number;
  readonly chest: Section;
  readonly shoulderY: number;
  /** Bottom of the hips band: below it draped cloth starts following the thighs. */
  readonly hipBottomY: number;
  /** Knee height: draped cloth follows the thighs fully from here down. */
  readonly kneeY: number;
  /** Both thighs together. */
  readonly legs: Section;
  /** Distance of each thigh's center from the midline. */
  readonly legX: number;
  /** Bind-pose forearm bounds; the walker binds its arms out along x. */
  readonly forearms: Readonly<Record<BodySide, THREE.Box3>>;
  /** Bind-pose foot and toe bounds. */
  readonly feet: Readonly<Record<BodySide, THREE.Box3>>;
}

/** Bone name prefix of each side; Left is +x in the body frame. */
export type BodySide = 'Left' | 'Right';
export const BODY_SIDES: readonly BodySide[] = ['Left', 'Right'];

export function measure(body: ZombieBodyFrame): BodyMeasures {
  const head = body.bounds({ bones: ['Head'] });
  const browY = head.max.y - 0.085;
  const hips = body.bounds({ bones: ['Hips'] });
  const chest = body.bounds({ bones: ['Spine2'] });
  const thighs = body.bounds({ bones: ['LeftUpLeg', 'RightUpLeg'] });
  const leftThigh = body.bounds({ bones: ['LeftUpLeg'] });
  return {
    crown: sectionOf(body.bounds({ bones: ['Head'], minY: browY - 0.03 })),
    crownTop: head.max.y,
    browY,
    waist: sectionOf(hips),
    waistY: (hips.min.y + hips.max.y) / 2,
    chest: sectionOf(chest),
    shoulderY: chest.max.y,
    hipBottomY: hips.min.y,
    kneeY: thighs.min.y,
    legs: sectionOf(thighs),
    legX: (leftThigh.min.x + leftThigh.max.x) / 2,
    forearms: { Left: body.bounds({ bones: ['LeftForeArm'] }), Right: body.bounds({ bones: ['RightForeArm'] }) },
    feet: {
      Left: body.bounds({ bones: ['LeftFoot', 'LeftToeBase'] }),
      Right: body.bounds({ bones: ['RightFoot', 'RightToeBase'] }),
    },
  };
}

/** One horizontal ring of a garment shell. */
export interface GarmentRing {
  readonly section: Section;
  readonly y: number;
}

export interface GarmentShellOptions {
  /** Ring resolution; even, so folds alternate cleanly. */
  readonly segments?: number;
  /** First angle (0 = front, turning to the left) and angular extent; below 2π the shell is open. */
  readonly start?: number;
  readonly arc?: number;
  /** Fold depth as a fraction of the radius, growing from nothing at the first ring to full at the hem. */
  readonly folds?: number;
  /** Ragged hem: each hem vertex drops by up to this many meters. */
  readonly tatter?: number;
  /** Raises the hem by this many meters at an angle (shaped hems); keep it under the last ring spacing. */
  readonly hemLift?: (angle: number) => number;
  /** Picks the tatter pattern so two garments fray differently. */
  readonly seed?: number;
}

/** Integer hash in [0, 1). */
function hash01(index: number, seed: number): number {
  let h = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * Hanging cloth lofted through rings listed top to bottom, seen from both
 * sides: vertical folds alternate the ring vertices in and out (deeper towards
 * the hem) and the hem can fray or follow a shaped line. Non-indexed, so flat
 * shading reads every fold.
 */
export function garmentShell(rings: readonly GarmentRing[], options: GarmentShellOptions = {}): THREE.BufferGeometry {
  const segments = options.segments ?? 16;
  const start = options.start ?? 0;
  const arc = options.arc ?? Math.PI * 2;
  const closed = arc >= Math.PI * 2 - 1e-6;
  const columns = closed ? segments : segments + 1;
  const grid: THREE.Vector3[][] = rings.map((ring, row) => {
    const depth = (options.folds ?? 0) * (rings.length > 1 ? row / (rings.length - 1) : 0);
    const hem = row === rings.length - 1;
    const points: THREE.Vector3[] = [];
    for (let column = 0; column < columns; column++) {
      const angle = start + (arc * column) / segments;
      const fold = 1 + (column % 2 === 0 ? depth : -depth);
      const point = ringPoint(scaled(ring.section, fold), ring.y, angle);
      if (hem) {
        point.y += options.hemLift?.(angle) ?? 0;
        point.y -= (options.tatter ?? 0) * hash01(column, options.seed ?? 0);
      }
      points.push(point);
    }
    return points;
  });
  const triangles: THREE.Vector3[] = [];
  for (let row = 0; row < rings.length - 1; row++) {
    for (let column = 0; column < segments; column++) {
      const next = (column + 1) % columns;
      const t0 = grid[row][column];
      const t1 = grid[row][next];
      const b0 = grid[row + 1][column];
      const b1 = grid[row + 1][next];
      triangles.push(b0, b1, t0, t0, b1, t1);
    }
  }
  return doubleSided(trianglesGeometry(triangles));
}

/**
 * Tube around the x axis from x0 to x1 (radii r0 to r1) centered on (y, z),
 * for sleeves on the walker's bind-pose arms; outward facing on both sides.
 */
export function sleeveShell(
  x0: number, x1: number, y: number, z: number, r0: number, r1: number, options: GarmentShellOptions = {},
): THREE.BufferGeometry {
  // Lofted along +y around the origin, then laid along x: rotating -90° about z maps +y to +x.
  const length = Math.abs(x1 - x0);
  const shell = garmentShell(
    [{ section: { x: 0, z: 0, rx: r0, rz: r0 }, y: length }, { section: { x: 0, z: 0, rx: r1, rz: r1 }, y: 0 }],
    { segments: 10, ...options },
  );
  // Rows run top (x0 end) to bottom (x1 end), so the hem options fray the cuff.
  shell.applyMatrix4(new THREE.Matrix4().makeRotationZ(x1 > x0 ? Math.PI / 2 : -Math.PI / 2));
  return shell.translate(x1, y, z);
}
