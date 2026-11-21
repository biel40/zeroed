import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The EXHALIS arrow in metres, laid along -Z from its nock at the origin to
 * the tip at `-length`: a pale ash shaft, a flat bronze broadhead on a
 * socket, three grey-goose vanes at the back (none standing straight up, so
 * the arrow keeps under the sight line) and a wind spiral with two thin
 * bands engraved in the fore shaft. The first-person bow nocks it at this
 * size and the shot in flight scales it up, so both read as the same arrow.
 */
export const EXHALIS_ARROW = {
  length: 0.42,
  shaftRadius: 0.0042,
  /** Broadhead: length from the tip, half-width across and half-thickness. */
  head: { length: 0.036, halfWidth: 0.0085, halfThickness: 0.0032, socket: 0.014 },
  /** Bronze collar round the nock end. */
  nock: { length: 0.008, radius: 0.0052 },
  /** Vanes from `start` to `end` metres ahead of the nock, `height` off the shaft, at `angles` round it. */
  fletching: { start: 0.02, end: 0.078, height: 0.011, angles: [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2] },
  /** Wind spiral (`turns` round the shaft) and bands, between these distances from the nock. */
  runes: { from: 0.27, to: 0.355, turns: 2, bands: 2 },
} as const;

/** Arrow geometry by material, in the arrow's own frame (see `EXHALIS_ARROW`). */
export interface ExhalisArrowGeometry {
  /** Shaft and fletching: the arrow's pale body. */
  readonly body: THREE.BufferGeometry;
  /** Broadhead, its socket and the nock collar. */
  readonly metal: THREE.BufferGeometry;
  /** Wind runes engraved in the fore shaft. */
  readonly runes: THREE.BufferGeometry;
}

/** Low tessellation throughout: the arrow is thin, and the altar offering shows the bow in the scene. */
const SIDES = 6;

/** A cylinder along -Z between `from` and `to` metres ahead of the nock; `open` leaves its ends uncapped. */
function sleeve(radius: number, from: number, to: number, open: boolean): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, to - from, SIDES, 1, open).rotateX(Math.PI / 2).translate(0, 0, -(from + to) / 2);
}

/** One vane: a feather swept back from its leading edge, standing `angle` round the shaft. */
function vane(angle: number): THREE.BufferGeometry {
  const { start, end, height } = EXHALIS_ARROW.fletching;
  const span = end - start;
  // In (along the arrow from the vane's back, out from the shaft).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span, 0);
  shape.quadraticCurveTo(span * 0.82, height * 0.55, span * 0.55, height);
  shape.lineTo(span * 0.1, height * 0.92);
  shape.quadraticCurveTo(-span * 0.04, height * 0.5, 0, 0);
  const geometry = new THREE.ShapeGeometry(shape, 2);
  // Shape x runs forward (-Z from the vane's back), shape y outward (+X), then turned round the shaft.
  const toArrow = new THREE.Matrix4().set(
    0, 1, 0, EXHALIS_ARROW.shaftRadius * 0.6,
    0, 0, 1, 0,
    -1, 0, 0, -start,
    0, 0, 0, 1,
  );
  geometry.applyMatrix4(toArrow);
  geometry.rotateZ(angle);
  return geometry;
}

function broadhead(): THREE.BufferGeometry {
  const { length, head } = EXHALIS_ARROW;
  // A four-sided cone (corners on X and Z) flattened into a diamond blade lying flat, tip forward (-Z).
  const blade = new THREE.ConeGeometry(head.halfWidth, head.length, 4, 1)
    .scale(1, 1, head.halfThickness / head.halfWidth)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, -(length - head.length / 2));
  const socket = new THREE.CylinderGeometry(EXHALIS_ARROW.shaftRadius * 1.25, EXHALIS_ARROW.shaftRadius * 1.1, head.socket, SIDES, 1, true)
    .rotateX(Math.PI / 2)
    .translate(0, 0, -(length - head.length - head.socket / 2 + 0.002));
  return merged([blade, socket]);
}

function runes(): THREE.BufferGeometry {
  const { from, to, turns, bands } = EXHALIS_ARROW.runes;
  const radius = EXHALIS_ARROW.shaftRadius + 0.0003;
  const spiral = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, index) => {
    const t = index / 12;
    const angle = t * Math.PI * 2 * turns;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -(from + (to - from) * t));
  }));
  const parts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(spiral, 18, 0.0006, 3, false)];
  for (let band = 0; band < bands; band++) {
    const at = from - 0.012 - band * 0.006;
    parts.push(sleeve(EXHALIS_ARROW.shaftRadius + 0.0004, at, at + 0.0016, true));
  }
  return merged(parts);
}

/** Merges `parts` (indexed or not) into one non-indexed geometry, disposing them. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => {
    const plain = part.index ? part.toNonIndexed() : part;
    if (plain !== part) part.dispose();
    for (const name of Object.keys(plain.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') plain.deleteAttribute(name);
    }
    return plain;
  });
  const result = mergeGeometries(flat);
  for (const part of flat) part.dispose();
  if (!result) throw new Error('EXHALIS arrow parts do not share their attributes');
  return result;
}

/** Builds the arrow's geometry, one piece per material. */
export function buildExhalisArrowGeometry(): ExhalisArrowGeometry {
  const { length, shaftRadius, head, nock, fletching } = EXHALIS_ARROW;
  // Both ends sit inside the nock collar and the head's socket.
  const shaft = sleeve(shaftRadius, nock.length * 0.5, length - head.length - head.socket + 0.004, true);
  const body = merged([shaft, ...fletching.angles.map(vane)]);
  const collar = sleeve(nock.radius, 0, nock.length, false);
  const metal = merged([broadhead(), collar]);
  return { body, metal, runes: runes() };
}
