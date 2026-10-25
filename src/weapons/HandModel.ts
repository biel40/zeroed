import * as THREE from 'three';
import { ELBOW, THUMB, THUMB_LENGTHS, WRIST, bindFrames, boneBinds, fingerBone } from './ArmRig';
import type { ArmSide, BindFrame } from './ArmRig';
import { FINGER_LAYOUT, FINGERS, PHALANX_TAPER } from './HandPoses';
import { digitUv, handUv, HAND_HZ_RANGE, nailUv } from './HandSkinTexture';
import { skinnedLoft } from './SkinnedLoft';
import { joinThumbRoot } from './ThumbRoot';
import type { RingFinger } from '../game/rings/RingCatalog';

/**
 * Bare first-person hand, skinned to the arm skeleton in bind space: one
 * continuous surface for the forearm, wrist and palm, a tube per digit that
 * bends smoothly at its joints, and a nail on every fingertip. Sizes follow
 * an adult hand; the right hand is built, the left mirrors it.
 *
 * Section convention (bind space, right hand): +X is the back of the hand,
 * -X the palm, +Y the thumb side. `around` runs 0 (little-finger side),
 * 0.25 (back), 0.5 (thumb side), 0.75 (front) for the hand and every digit.
 */

/** Geometry density of the hand; the skeleton is identical in every tier. */
export interface HandDetail {
  /** Points around the forearm, wrist and palm. */
  readonly handRadial: number;
  /** Points around each finger and the thumb. */
  readonly digitRadial: number;
  /** Rings across each digit joint: three keep a bent joint round. */
  readonly jointRings: 2 | 3;
  /** Rings rounding each fingertip before its apex, and the palm's closing edge. */
  readonly tipRings: number;
  /** Nail grid: quads across and along. */
  readonly nailGrid: readonly [number, number];
  /** Builds the palm from every other profile ring. */
  readonly sparsePalm: boolean;
}

// --- Sections ----------------------------------------------------------------

const signedPower = (value: number, power: number): number => Math.sign(value) * Math.abs(value) ** (2 / power);

/**
 * Superelliptic section: `back`/`front` reach along +X/-X and
 * `thumbSide`/`littleSide` along +Y/-Y; `power` > 2 squares it off.
 */
function sectionPoint(
  around: number,
  back: number,
  front: number,
  thumbSide: number,
  littleSide: number,
  backPower: number,
  frontPower: number,
  out: THREE.Vector2,
): THREE.Vector2 {
  const angle = around * Math.PI * 2;
  const facing = Math.sin(angle);
  const lateral = -Math.cos(angle);
  const power = facing >= 0 ? backPower : frontPower;
  return out.set(
    signedPower(facing, power) * (facing >= 0 ? back : front),
    signedPower(lateral, power) * (lateral >= 0 ? thumbSide : littleSide),
  );
}

// --- Digits ------------------------------------------------------------------

/** Half extents of a digit section: across, toward the back (nail) and toward the front (pad). */
export interface DigitSection {
  halfWidth: number;
  back: number;
  front: number;
}

/** One finger or the thumb, in its own bind frame: bone line along -Z from the base joint. */
interface DigitSpec {
  /** Bind position and rotation of the base joint (its back is local +X). */
  readonly origin: THREE.Vector3;
  readonly frame: THREE.Quaternion;
  readonly lengths: readonly [number, number, number];
  /** Shaft section of each segment: [half width, back, front]. */
  readonly shafts: readonly (readonly [number, number, number])[];
  /** How far before and after each of the two joints the shaft section changes. */
  readonly shaftBlends: readonly (readonly [number, number])[];
  /**
   * Geometry begins at `root` along the bone line. Fingers start behind the
   * joint and taper from `rootFull` to `rootScale`, sinking by `rootShift`
   * (hand-frame [x, y]) inside the palm. The thumb starts at its sewn web.
   */
  readonly rootFull: number;
  readonly root: number;
  readonly rootScale: number;
  readonly rootShift: readonly [number, number];
  /** The bone the digit grows from, then its three segments. */
  readonly bones: readonly [number, number, number, number];
  /** Centre and half width of the weight ramp at the base joint. */
  readonly baseBlend: readonly [number, number];
  /** Half widths of the weight ramps at the two joints. */
  readonly jointBlend: readonly [number, number];
  /** Back bulge of the two joints (the knuckles). */
  readonly knuckles: readonly [number, number];
}

const DIGIT_BACK_POWER = 2;
const DIGIT_FRONT_POWER = 2.4;
/** Section ratios of each finger segment to its front reach (the fitting radius). */
const FINGER_WIDTH = [1.03, 1.06, 1.08] as const;
const FINGER_BACK = [0.88, 0.8, 0.7] as const;
/** Front pads swell mid-segment; flexion creases pinch the joints. */
const PAD_SWELL = 0.06;
const CREASE_PINCH = 0.0007;
/** Finger shaft sections blend across a joint over this half length. */
const SHAFT_BLEND = 0.005;
/** Knuckle bulges scale with the finger from this reference radius. */
const KNUCKLE_REFERENCE_RADIUS = 0.0095;
/** Fingertip: the cap starts this many front reaches before the bone end and ends this many past it. */
const CAP_BACK = 0.35;
const TIP_REACH = 0.62;
/** Nail: from this share of the distal segment to this many front reaches past its bone end. */
const NAIL_START = 0.3;
const NAIL_REACH = 0.3;
const NAIL_WIDTH = 0.78;
const NAIL_LIFT = 0.00045;

function fingerSpec(name: (typeof FINGERS)[number], wrist: THREE.Vector3): DigitSpec {
  const finger = FINGERS.indexOf(name);
  const { base, lengths, radius } = FINGER_LAYOUT[name];
  const shafts = FINGER_WIDTH.map((width, segment) => {
    const front = radius * PHALANX_TAPER ** segment;
    return [front * width, front * FINGER_BACK[segment], front] as const;
  });
  const knuckle = radius / KNUCKLE_REFERENCE_RADIUS;
  return {
    origin: wrist.clone().add(new THREE.Vector3(...base)),
    frame: new THREE.Quaternion(),
    lengths,
    shafts,
    shaftBlends: [[SHAFT_BLEND, SHAFT_BLEND], [SHAFT_BLEND, SHAFT_BLEND]],
    // Full down to just behind the knuckle, then tapering away inside the palm.
    rootFull: -0.003,
    root: -0.022,
    rootScale: 0.4,
    rootShift: [0, 0],
    bones: [WRIST, fingerBone(finger, 0), fingerBone(finger, 1), fingerBone(finger, 2)],
    baseBlend: [0, 0.006],
    jointBlend: [0.0065, 0.005],
    knuckles: [0.0011 * knuckle, 0.0006 * knuckle],
  };
}

/**
 * The exposed thumb begins partway along the metacarpal, where the palm's
 * sewn web joins it. Its rest orientation keeps that web near its grips.
 */
function thumbSpec(base: BindFrame): DigitSpec {
  return {
    origin: base.position.clone(),
    frame: base.rotation.clone(),
    lengths: THUMB_LENGTHS,
    // Broad where it leaves the hand, a slimmer waist, then a wide flat tip.
    shafts: [[0.013, 0.01, 0.013], [0.0095, 0.0078, 0.009], [0.01, 0.0065, 0.009]],
    shaftBlends: [[0.026, 0.004], [SHAFT_BLEND, SHAFT_BLEND]],
    rootFull: 0,
    root: 0.018,
    rootScale: 1,
    rootShift: [0, 0],
    bones: [WRIST, THUMB, THUMB + 1, THUMB + 2],
    baseBlend: [0, 0.01],
    jointBlend: [0.009, 0.006],
    knuckles: [0.0008, 0.0005],
  };
}

function joints(spec: DigitSpec): [number, number, number] {
  const [l0, l1, l2] = spec.lengths;
  return [l0, l0 + l1, l0 + l1 + l2];
}

/** Where the fingertip cap starts and where its apex lies. */
function tipSpan(spec: DigitSpec): [number, number] {
  const end = joints(spec)[2];
  const front = spec.shafts[2][2];
  return [end - CAP_BACK * front, end + TIP_REACH * front];
}

/** Bind-space centre and orientation of a digit's bone line at `s` from its base joint. */
function spineAt(spec: DigitSpec, s: number, center: THREE.Vector3, frame: THREE.Quaternion): void {
  frame.copy(spec.frame);
  center.set(0, 0, -s).applyQuaternion(frame).add(spec.origin);
}

/** How far a digit's root has sunk into the palm: 0 down to `rootFull`, 1 at the tube's start. */
function rootDepth(spec: DigitSpec, s: number): number {
  return s < spec.rootFull ? THREE.MathUtils.smoothstep(spec.rootFull - s, 0, spec.rootFull - spec.root) : 0;
}

/** Section of a digit at `s` along its bone line from the base joint. */
function digitSection(spec: DigitSpec, s: number, out: DigitSection): DigitSection {
  const [j1, j2, j3] = joints(spec);
  const [[before1, after1], [before2, after2]] = spec.shaftBlends;
  const k1 = THREE.MathUtils.smoothstep(s, j1 - before1, j1 + after1);
  const k2 = THREE.MathUtils.smoothstep(s, j2 - before2, j2 + after2);
  const [a, b, c] = spec.shafts;
  const blend = (index: number) => a[index] + (b[index] - a[index]) * k1 + (c[index] - b[index]) * k2;
  let halfWidth = blend(0);
  let back = blend(1);
  let front = blend(2);
  const scale = THREE.MathUtils.lerp(1, spec.rootScale, rootDepth(spec, s));
  halfWidth *= scale;
  back *= scale;
  front *= scale;
  if (s >= 0) {
    const start = s < j1 ? 0 : s < j2 ? j1 : j2;
    const end = s < j1 ? j1 : s < j2 ? j2 : j3;
    const share = THREE.MathUtils.clamp((s - start) / (end - start), 0, 1);
    front *= 1 + PAD_SWELL * Math.sin(Math.PI * share) ** 2;
  }
  const atJoint1 = Math.exp(-(((s - j1) / 0.0035) ** 2));
  const atJoint2 = Math.exp(-(((s - j2) / 0.003) ** 2));
  front -= CREASE_PINCH * (Math.exp(-(((s - j1) / 0.0025) ** 2)) + Math.exp(-(((s - j2) / 0.0022) ** 2)));
  back += spec.knuckles[0] * atJoint1 + spec.knuckles[1] * atJoint2;
  halfWidth += 0.55 * (spec.knuckles[0] * atJoint1 + spec.knuckles[1] * atJoint2);
  const [capStart, tip] = tipSpan(spec);
  if (s > capStart) {
    const scale = Math.sqrt(Math.max(0, 1 - ((s - capStart) / (tip - capStart)) ** 2));
    halfWidth *= scale;
    back *= scale;
    front *= scale;
  }
  out.halfWidth = halfWidth;
  out.back = back;
  out.front = front;
  return out;
}

/** Joint-space coordinate of the digit texture: segment index plus the share of it. */
function jointSpace(spec: DigitSpec, s: number): number {
  const [j1, j2] = joints(spec);
  const [l0, l1, l2] = spec.lengths;
  if (s < j1) return s / l0;
  if (s < j2) return 1 + (s - j1) / l1;
  return 2 + (s - j2) / l2;
}

const spread = (centre: number, half: number, rings: 2 | 3): number[] =>
  rings === 3 ? [centre - half, centre, centre + half] : [centre - half * 0.6, centre + half * 0.6];

const between = (from: number, to: number, count: number): number[] =>
  Array.from({ length: count }, (_, index) => from + ((to - from) * (index + 1)) / (count + 1));

function digitStations(spec: DigitSpec, detail: HandDetail): number[] {
  const [j1, j2] = joints(spec);
  const [baseCentre, baseHalf] = spec.baseBlend;
  const [half1, half2] = spec.jointBlend;
  const [capStart, tip] = tipSpan(spec);
  const rich = detail.jointRings === 3;
  const base = spread(baseCentre, baseHalf, detail.jointRings);
  const joint1 = spread(j1, half1, detail.jointRings);
  const joint2 = spread(j2, half2, detail.jointRings);
  const cap = Array.from({ length: detail.tipRings + 1 }, (_, ring) =>
    capStart + (tip - capStart) * Math.sin((Math.PI / 2) * (ring / (detail.tipRings + 1))));
  const stations = [
    spec.root,
    ...between(spec.root, base[0], 1),
    ...base,
    ...between(base[base.length - 1], joint1[0], rich ? 2 : 1),
    ...joint1,
    ...between(joint1[joint1.length - 1], joint2[0], 1),
    ...joint2,
    ...between(joint2[joint2.length - 1], capStart, rich ? 1 : 0),
    ...cap,
    tip,
  ].filter((station) => station >= spec.root);
  return stations.filter((station, index) => index === 0 || station - stations[index - 1] > 1e-6);
}

function digitGeometry(spec: DigitSpec, detail: HandDetail): THREE.BufferGeometry {
  const [j1, j2] = joints(spec);
  const [baseCentre, baseHalf] = spec.baseBlend;
  const [half1, half2] = spec.jointBlend;
  const section: DigitSection = { halfWidth: 0, back: 0, front: 0 };
  const flat = new THREE.Vector2();
  const center = new THREE.Vector3();
  const frame = new THREE.Quaternion();
  return skinnedLoft({
    stations: digitStations(spec, detail),
    radial: detail.digitRadial,
    apex: true,
    point: (s, around, out) => {
      const { halfWidth, back, front } = digitSection(spec, s, section);
      sectionPoint(around, back, front, halfWidth, halfWidth, DIGIT_BACK_POWER, DIGIT_FRONT_POWER, flat);
      const sink = rootDepth(spec, s);
      spineAt(spec, s, center, frame);
      out.set(flat.x, flat.y, 0).applyQuaternion(frame).add(center);
      out.x += spec.rootShift[0] * sink;
      out.y += spec.rootShift[1] * sink;
    },
    skin: (s, _around, _point, out) => {
      const r0 = THREE.MathUtils.smoothstep(s, baseCentre - baseHalf, baseCentre + baseHalf);
      const r1 = THREE.MathUtils.smoothstep(s, j1 - half1, j1 + half1);
      const r2 = THREE.MathUtils.smoothstep(s, j2 - half2, j2 + half2);
      const [parent, first, second, third] = spec.bones;
      out.add(parent, 1 - r0).add(first, r0 - r1).add(second, r1 - r2).add(third, r2);
    },
    uv: (s, around) => digitUv(around, jointSpace(spec, s)),
  });
}

/** Nail plate: a shell just above the back of the distal segment, rigid on its bone. */
function nailGeometry(spec: DigitSpec, detail: HandDetail): THREE.BufferGeometry {
  const [columns, rows] = detail.nailGrid;
  const [, j2, j3] = joints(spec);
  const start = j2 + NAIL_START * spec.lengths[2];
  const end = j3 + NAIL_REACH * spec.shafts[2][2];
  const section: DigitSection = { halfWidth: 0, back: 0, front: 0 };
  const center = new THREE.Vector3();
  const frame = new THREE.Quaternion();
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const along = row / rows;
    const s = THREE.MathUtils.lerp(start, end, along);
    const { halfWidth, back } = digitSection(spec, s, section);
    for (let column = 0; column <= columns; column++) {
      const across = (column / columns) * 2 - 1;
      const y = across * NAIL_WIDTH * halfWidth;
      const surface = back * (1 - Math.abs(y / halfWidth) ** DIGIT_BACK_POWER) ** (1 / DIGIT_BACK_POWER);
      // The plate rises out of the cuticle fold and settles onto the skin at its sides.
      const lift = NAIL_LIFT * (1 - across * across) * THREE.MathUtils.lerp(0.4, 1, THREE.MathUtils.smoothstep(along, 0, 0.35));
      spineAt(spec, s, center, frame);
      const point = new THREE.Vector3(surface + lift, y, 0).applyQuaternion(frame).add(center);
      positions.push(point.x, point.y, point.z);
      uvs.push(...nailUv(across, along));
      skinIndex.push(spec.bones[3], 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
  }
  const row = columns + 1;
  for (let along = 0; along < rows; along++) {
    for (let column = 0; column < columns; column++) {
      const a = along * row + column;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Forearm, wrist and palm -------------------------------------------------

/**
 * Hand body profile by `hz` (bind distance from the wrist joint, + toward
 * the elbow): thumb-side, little-side, back and front reach, then the
 * section power. Forearm oval inside the sleeve, narrow wrist, broad palm.
 */
const HAND_PROFILE: readonly (readonly [number, number, number, number, number, number])[] = [
  [0.088, 0.03, 0.0305, 0.02, 0.0215, 2.2],
  [0.062, 0.029, 0.0298, 0.019, 0.0205, 2.3],
  [0.04, 0.0282, 0.0292, 0.0178, 0.0195, 2.4],
  [0.022, 0.0275, 0.0288, 0.0165, 0.0183, 2.5],
  [0.006, 0.0272, 0.0286, 0.0156, 0.0175, 2.6],
  [-0.01, 0.0298, 0.0296, 0.0148, 0.0172, 2.7],
  [-0.028, 0.0342, 0.0326, 0.014, 0.017, 2.8],
  [-0.047, 0.0385, 0.0355, 0.0132, 0.017, 2.9],
  [-0.064, 0.0402, 0.0366, 0.0122, 0.0168, 3],
  [-0.078, 0.041, 0.0375, 0.0108, 0.0155, 3.2],
  [-0.088, 0.0415, 0.0378, 0.0096, 0.0138, 3.4],
  [-0.095, 0.041, 0.0372, 0.0086, 0.0118, 3.4],
];
/** Rise of the back of the hand over each metacarpal head (FINGERS order). */
const KNUCKLE_RISE = [0.0028, 0.003, 0.0026, 0.0021] as const;
/** Profile rows kept by the sparse (mobile) palm. */
const SPARSE_ROWS = [0, 2, 4, 5, 6, 7, 8, 10, 11];
/**
 * Past the knuckles the palm thins to a closed edge (the webs between the
 * fingers) while keeping most of its width, so it ends along the knuckle
 * line instead of in a dome.
 */
const PALM_END = -0.104;
const PALM_END_NARROWING = 0.12;
/**
 * Thenar mound under the thumb's base: centre (y, z), extents and how far it
 * swells toward the palm and the thumb side.
 */
const THENAR = { y: 0.03, z: -0.026, width: 0.013, length: 0.024, rise: 0.01, flare: 0.011 } as const;

interface HandProfile {
  thumbSide: number;
  littleSide: number;
  back: number;
  front: number;
  power: number;
  /** 1 along the hand, falling to 0 at its closed end. */
  thickness: number;
}

function handProfile(hz: number, out: HandProfile): HandProfile {
  const last = HAND_PROFILE[HAND_PROFILE.length - 1];
  let row = last;
  let thickness = 1;
  let width = 1;
  if (hz < last[0]) {
    const closing = THREE.MathUtils.clamp((last[0] - hz) / (last[0] - PALM_END), 0, 1);
    thickness = Math.sqrt(1 - closing * closing);
    width = 1 - PALM_END_NARROWING * closing * closing;
  } else {
    const index = Math.max(1, HAND_PROFILE.findIndex(([at]) => at <= hz));
    const [from, to] = [HAND_PROFILE[index - 1], HAND_PROFILE[index]];
    const t = (from[0] - hz) / (from[0] - to[0]);
    row = from.map((value, column) => THREE.MathUtils.lerp(value, to[column], t)) as unknown as typeof row;
  }
  out.thumbSide = row[1] * width;
  out.littleSide = row[2] * width;
  out.back = row[3] * thickness;
  out.front = row[4] * thickness;
  out.power = row[5];
  out.thickness = thickness;
  return out;
}

/** Knuckle line: bind z of the finger bases across the hand, extended past the edge fingers. */
function knuckleLine(): (y: number) => number {
  const points = FINGERS.map((name) => FINGER_LAYOUT[name].base).map(([, y, z]) => [y, z] as const).sort((a, b) => a[0] - b[0]);
  return (y) => {
    let index = 1;
    while (index < points.length - 1 && y > points[index][0]) index++;
    const [[y0, z0], [y1, z1]] = [points[index - 1], points[index]];
    return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  };
}

const bump = (dy: number, width: number, dz: number, length: number): number => Math.exp(-((dy / width) ** 2) - ((dz / length) ** 2));

function handBodyGeometry(wrist: THREE.Vector3, thumb: DigitSpec, detail: HandDetail): THREE.BufferGeometry {
  const knuckleZ = knuckleLine();
  const leading = Math.min(...FINGERS.map((name) => FINGER_LAYOUT[name].base[2]));
  const rows = detail.sparsePalm ? SPARSE_ROWS.map((index) => HAND_PROFILE[index]) : HAND_PROFILE;
  const capStart = HAND_PROFILE[HAND_PROFILE.length - 1][0];
  const cap = Array.from({ length: detail.tipRings }, (_, ring) =>
    capStart - (capStart - PALM_END) * Math.sin((Math.PI / 2) * ((ring + 1) / (detail.tipRings + 1))));
  const profile: HandProfile = { thumbSide: 0, littleSide: 0, back: 0, front: 0, power: 2, thickness: 1 };
  const flat = new THREE.Vector2();

  /** Point of one station and angle in the hand frame (relative to the wrist joint). */
  const local = (hz: number, around: number, out: THREE.Vector3): THREE.Vector3 => {
    const { thumbSide, littleSide, back, front, power, thickness } = handProfile(hz, profile);
    // The palm side is a little flatter than the back.
    const { x, y } = sectionPoint(around, back, front, thumbSide, littleSide, power, power + 0.3, flat);
    // The palm's end follows the slanted knuckle line.
    const z = hz + THREE.MathUtils.smoothstep(-hz, 0.05, 0.09) * (knuckleZ(y) - leading);
    // Metacarpal heads rise toward each knuckle; the palm adds its mounds.
    const backness = Math.max(0, Math.sin(around * Math.PI * 2));
    const frontness = Math.max(0, -Math.sin(around * Math.PI * 2));
    let dx = 0;
    FINGERS.forEach((name, finger) => {
      const [, by, bz] = FINGER_LAYOUT[name].base;
      dx += KNUCKLE_RISE[finger] * bump(y - by, 0.0052, z - (bz + 0.002), 0.008) * backness ** 1.5 * thickness;
    });
    // Thenar mound under the thumb, hypothenar mound under the little finger, hollow between.
    const thenar = bump(y - THENAR.y, THENAR.width, z - THENAR.z, THENAR.length);
    const thumbSideness = Math.max(0, -Math.cos(around * Math.PI * 2));
    dx -= THENAR.rise * thenar * frontness;
    const dy = THENAR.flare * thenar * thumbSideness;
    dx -= 0.0035 * bump(y + 0.027, 0.011, z + 0.05, 0.024) * frontness;
    dx += 0.0012 * bump(y - 0.004, 0.012, z + 0.058, 0.016) * frontness;
    // Ulnar head on the little-finger side of the back of the wrist.
    dx += 0.0018 * bump(y + 0.02, 0.006, z - 0.012, 0.008) * backness;
    return out.set(x + dx, y + dy, z);
  };

  const stations = [...rows.map(([hz]) => hz), ...cap, PALM_END];
  const palm = skinnedLoft({
    stations,
    radial: detail.handRadial,
    point: (hz, around, out) => local(hz, around, out).add(wrist),
    skin: (hz, _around, _point, out) => {
      const hand = THREE.MathUtils.smoothstep(0.018 - hz, 0, 0.04);
      out.add(ELBOW, 1 - hand).add(WRIST, hand);
    },
    uv: (hz, around) => handUv(around, THREE.MathUtils.clamp(hz, HAND_HZ_RANGE[1], HAND_HZ_RANGE[0])),
  });
  return joinThumbRoot(palm, digitGeometry(thumb, detail), {
    rows: [stations.indexOf(0.006), stations.indexOf(-0.064)],
    columns: [Math.floor(detail.handRadial * 0.4), Math.ceil(detail.handRadial * 0.8)],
    radial: detail.handRadial,
  }, detail.digitRadial, new THREE.Vector3(0, 0, -1).applyQuaternion(thumb.frame));
}

// --- Assembly ----------------------------------------------------------------

/** The digits of one hand, built in the right-hand convention with that hand's thumb rest. */
function digitSpecs(side: ArmSide): DigitSpec[] {
  const at = bindFrames(boneBinds(side));
  return [...FINGERS.map((name) => fingerSpec(name, at[WRIST].position)), thumbSpec(at[THUMB])];
}

/**
 * Every skin part of one hand in bind space, in the right-hand convention
 * (the left hand mirrors it): palm with its sewn thumb, four fingers and
 * the five nails.
 */
export function handGeometries(detail: HandDetail, side: ArmSide): THREE.BufferGeometry[] {
  const digits = digitSpecs(side);
  const frames = bindFrames(boneBinds(side));
  return [
    handBodyGeometry(frames[WRIST].position, digits[FINGERS.length], detail),
    ...digits.slice(0, FINGERS.length).map((spec) => digitGeometry(spec, detail)),
    ...digits.map((spec) => nailGeometry(spec, detail)),
  ];
}

/** Where a ring is worn: its bone, the distance along it and the finger section there. */
export interface DigitRingSeat extends DigitSection {
  readonly bone: number;
  readonly along: number;
}

/** Rings sit halfway along the proximal phalanx, clear of the knuckle web. */
const RING_SEAT_ALONG = 0.5;

export function digitRingSeat(finger: RingFinger, side: ArmSide): DigitRingSeat {
  const digits = digitSpecs(side);
  const spec = finger === 'thumb' ? digits[FINGERS.length] : digits[FINGERS.indexOf(finger)];
  // The thumb wears its ring on the proximal phalanx, past the metacarpal.
  const segment = finger === 'thumb' ? 1 : 0;
  const along = RING_SEAT_ALONG * spec.lengths[segment];
  const start = segment === 0 ? 0 : spec.lengths[0];
  const section = digitSection(spec, start + along, { halfWidth: 0, back: 0, front: 0 });
  return { ...section, bone: spec.bones[segment + 1], along };
}
