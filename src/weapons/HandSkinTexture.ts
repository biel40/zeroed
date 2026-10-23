import * as THREE from 'three';
import { tileableNoise, seededRandom } from '../zombies/maps/shared/ProceduralNoise';
import { bake, bakedTexture, hash2, mix } from '../zombies/maps/shared/ProceduralSurface';
import type { Painter, Rgb, Texel } from '../zombies/maps/shared/ProceduralSurface';

/**
 * Skin of the first-person hands: one baked atlas (colour, relief and
 * roughness) shared by both arms. The geometry addresses it through the
 * three UV charts below, so the painter places every crease, nail and vein
 * in the same terms the hand is built in:
 *
 * - digits: `around` the digit (0 and 1 on its little-finger side, 0.25 on
 *   its back, 0.75 on its front) by joint-space `t` (segment index plus the
 *   share of that segment: joints sit at 1 and 2);
 * - hand: `around` the forearm, wrist and hand by `hz`, the bind distance
 *   from the wrist joint (+ toward the elbow);
 * - nails: `across` (-1..1) by `along` (0 at the cuticle, 1 at the free edge).
 */

/** The charts are laid out in units of a 512-texel atlas, whatever size it is baked at. */
const ATLAS = 512;
/** Digit chart: texel columns 0..255, rows 0..415. */
const DIGIT_ROWS = 415;
const DIGIT_T_RANGE = [-0.6, 3.4] as const;
/** Nail chart: columns 8..247, rows 428..506. */
const NAIL_X = [8, 247] as const;
const NAIL_Y = [428, 506] as const;
/** Hand chart: texel columns 256..511, all rows. */
export const HAND_HZ_RANGE = [0.09, -0.112] as const;
/** Texels around a chart; both edges are the same seam, so noise repeats every this many. */
const AROUND = 255;

export function digitUv(around: number, t: number): [number, number] {
  const row = (t - DIGIT_T_RANGE[0]) / (DIGIT_T_RANGE[1] - DIGIT_T_RANGE[0]);
  return [(0.5 + around * AROUND) / ATLAS, (0.5 + row * DIGIT_ROWS) / ATLAS];
}

export function handUv(around: number, hz: number): [number, number] {
  const row = (HAND_HZ_RANGE[0] - hz) / (HAND_HZ_RANGE[0] - HAND_HZ_RANGE[1]);
  return [(256.5 + around * AROUND) / ATLAS, (0.5 + row * (ATLAS - 1)) / ATLAS];
}

export function nailUv(across: number, along: number): [number, number] {
  const column = NAIL_X[0] + ((across + 1) / 2) * (NAIL_X[1] - NAIL_X[0]);
  return [(column + 0.5) / ATLAS, (NAIL_Y[0] + along * (NAIL_Y[1] - NAIL_Y[0]) + 0.5) / ATLAS];
}

// --- Palette (sRGB) ----------------------------------------------------------

const SKIN: Rgb = [176, 131, 108];
const PALM: Rgb = [196, 150, 128];
/** Knuckles, joints and fingertips carry more blood. */
const FLUSH: Rgb = [166, 104, 88];
const CREASE: Rgb = [118, 78, 66];
const VEIN: Rgb = [146, 124, 132];
const FRECKLE: Rgb = [148, 100, 78];
const NAIL_BED: Rgb = [204, 150, 140];
const LUNULA: Rgb = [218, 190, 178];
const FREE_EDGE: Rgb = [226, 212, 196];

// --- Creases -------------------------------------------------------------------

/** A family of parallel crease lines: [offset from `at`, strength] each, `width` thick. */
interface CreaseSet {
  readonly at: number;
  readonly lines: readonly (readonly [number, number])[];
  readonly width: number;
  /** How far the lines bow toward `at` away from the midline (knuckle wrinkles). */
  readonly bow: number;
  /** Farther than this from `at` the set adds nothing. */
  readonly reach: number;
}

function creaseSet(at: number, lines: CreaseSet['lines'], width: number, bow = 0): CreaseSet {
  const reach = Math.max(...lines.map(([offset]) => Math.abs(offset))) + width * 3 + bow;
  return { at, lines, width, bow, reach };
}

/** Back of the digits: wrinkles over the middle joint, the end joint and the root. */
const KNUCKLE_WRINKLES: readonly CreaseSet[] = [
  creaseSet(1, [[-0.12, 0.6], [-0.06, 0.95], [0, 1], [0.06, 0.9], [0.12, 0.55]], 0.014, 0.05),
  creaseSet(2, [[-0.05, 0.55], [0, 0.7], [0.05, 0.45]], 0.012, 0.04),
  creaseSet(0.05, [[-0.03, 0.3], [0.03, 0.3]], 0.016),
];
/** Front of the digits: two flexion creases at the middle joint, one at the end joint and the root. */
const FLEXION_CREASES: readonly CreaseSet[] = [
  creaseSet(1, [[-0.03, 0.85], [0.025, 0.85]], 0.011),
  creaseSet(2, [[-0.015, 0.75]], 0.011),
  creaseSet(0.145, [[-0.025, 0.6], [0.025, 0.5]], 0.011),
];
/** Wrist: two creases across the front, two faint ones across the back (by hz). */
const WRIST_FRONT = creaseSet(0.005, [[0.002, 0.8], [-0.007, 0.65], [0.011, 0.35]], 0.0008);
const WRIST_BACK = creaseSet(0.007, [[0.004, 0.3], [-0.004, 0.3]], 0.0009);
/** Back-of-hand veins: start (around at the wrist), drift toward the knuckles and sway. */
const VEINS: readonly (readonly [number, number, number])[] = [[0.21, -0.05, 0.012], [0.27, 0.04, 0.01], [0.33, 0.07, 0.008]];

/** Bell of a line `width` thick at `offset` from it. */
const line = (offset: number, width: number): number => Math.exp(-(offset * offset) / (width * width));

/** Summed darkness of a crease set at coordinate `at`; `lateral` (0..1) bows the lines. */
function creases(set: CreaseSet, at: number, lateral: number): number {
  if (Math.abs(at - set.at) > set.reach) return 0;
  let sum = 0;
  for (const [offset, strength] of set.lines) {
    sum += strength * line(at - (set.at + offset - Math.sign(offset) * set.bow * lateral), set.width);
  }
  return sum;
}

/** 0..1 presence of a palm line running between palm depths `from` and `to` (-hz). */
function palmSpan(hz: number, from: number, to: number): number {
  return THREE.MathUtils.smoothstep(-hz, from, from + 0.006) * (1 - THREE.MathUtils.smoothstep(-hz, to - 0.006, to));
}

/** Height of a crease groove below the skin and how much it darkens. */
const CREASE_DEPTH = 0.2;
const CREASE_SHADE = 0.42;

/** Per-texel skin factors shared by the digit and hand charts. */
interface SkinFactors {
  /** 0..1 toward the back and the front (palm side) of the part. */
  back: number;
  front: number;
  flush: number;
  creases: number;
}

function skinPainter(size: number): Painter {
  const random = seededRandom(4417);
  const blotch = tileableNoise(random, 17, AROUND);
  const wobble = tileableNoise(random, 15, AROUND);
  const factors: SkinFactors = { back: 0, front: 0, flush: 0, creases: 0 };
  const shade: Rgb = [0, 0, 0];

  const facing = (around: number) => {
    const value = Math.sin(around * Math.PI * 2);
    factors.back = THREE.MathUtils.smoothstep(value, 0.1, 0.8);
    factors.front = THREE.MathUtils.smoothstep(-value, 0.1, 0.8);
  };

  /** Tone, mottling, creases and fine grain of one skin texel. */
  let grain = 0;
  const finish = (x: number, y: number, texel: Texel) => {
    // Darker blotches are a little redder too.
    const spot = blotch(x, y);
    mix(SKIN, PALM, factors.front * 0.75, shade);
    mix(shade, FLUSH, THREE.MathUtils.clamp(factors.flush + (0.5 - spot) * 0.25, -0.15, 1), shade);
    const mottle = 0.95 + spot * 0.1;
    shade[0] *= mottle;
    shade[1] *= mottle;
    shade[2] *= mottle;
    mix(shade, CREASE, Math.min(0.6, factors.creases * CREASE_SHADE), texel.color);
    texel.height = 0.5 - factors.creases * CREASE_DEPTH + grain * 0.02;
    texel.roughness = 0.56 + factors.creases * 0.14 + grain * 0.05 + factors.back * 0.04;
  };

  /** Digit chart: creases at the joints, flushed knuckles and fingertips, the nail bed. */
  const digit = (x: number, y: number, texel: Texel) => {
    const around = x / AROUND;
    const t = DIGIT_T_RANGE[0] + (y / DIGIT_ROWS) * (DIGIT_T_RANGE[1] - DIGIT_T_RANGE[0]);
    facing(around);
    const fromBack = Math.abs(around - 0.25);
    const fromFront = Math.abs(around - 0.75);
    factors.flush = factors.back * (0.5 * line(t - 1, 0.18) + 0.32 * line(t - 2, 0.13) + 0.3 * line(t, 0.14))
      + factors.front * (0.22 * line(t - 1, 0.085) + 0.18 * line(t - 2, 0.07))
      + 0.38 * THREE.MathUtils.smoothstep(t, 2.5, 3.2);
    let sum = 0;
    const nearCrease = t < 0.35 || Math.abs(t - 1) < 0.3 || Math.abs(t - 2) < 0.22 || Math.abs(t - 2.31) < 0.05;
    const jitter = nearCrease ? (wobble(x, y) - 0.5) * 0.03 : 0;
    const backFade = nearCrease ? 1 - THREE.MathUtils.smoothstep(fromBack, 0.08, 0.16) : 0;
    if (backFade > 0) {
      const bow = (fromBack / 0.14) ** 2;
      for (const set of KNUCKLE_WRINKLES) sum += backFade * creases(set, t - jitter, bow);
    }
    const frontFade = nearCrease ? 1 - THREE.MathUtils.smoothstep(fromFront, 0.11, 0.2) : 0;
    if (frontFade > 0) {
      for (const set of FLEXION_CREASES) sum += frontFade * creases(set, t - jitter * 0.5, 0);
    }
    // Nail bed under the plate, edged by the cuticle fold.
    const bed = t > 2.2 ? (1 - THREE.MathUtils.smoothstep(fromBack, 0.075, 0.1)) * THREE.MathUtils.smoothstep(t, 2.3, 2.36) : 0;
    if (t > 2.2) sum += 0.8 * (1 - THREE.MathUtils.smoothstep(fromBack, 0.08, 0.11)) * line(t - 2.31, 0.012);
    factors.creases = sum;
    finish(x, y, texel);
    if (bed > 0) mix(texel.color, NAIL_BED, bed * 0.7, texel.color);
  };

  /** Hand chart: wrist creases, palm lines, veins and a few freckles. */
  const hand = (x: number, y: number, texel: Texel) => {
    const around = (x - 256) / AROUND;
    const hz = HAND_HZ_RANGE[0] - (y / (ATLAS - 1)) * (HAND_HZ_RANGE[0] - HAND_HZ_RANGE[1]);
    facing(around);
    factors.flush = factors.back * 0.32 * THREE.MathUtils.smoothstep(-hz, 0.074, 0.096)
      + factors.front * 0.12 * THREE.MathUtils.smoothstep(-hz, 0.02, 0.06);
    const lined = (factors.front > 0 && hz < 0.02) || (factors.back > 0 && hz > -0.078 && hz < 0.085);
    const jitter = lined ? (wobble(x, y) - 0.5) * 0.0012 : 0;
    let sum = 0;
    if (factors.front > 0 && hz < 0.02) {
      const frontFade = 1 - THREE.MathUtils.smoothstep(Math.abs(around - 0.75), 0.13, 0.22);
      sum += frontFade * creases(WRIST_FRONT, hz - jitter, 0);
      // Palm lines, in `around` as a function of hz: thenar arc, head and heart lines.
      if (hz < -0.012 && hz > -0.088) {
        const thenar = 0.63 + 0.05 * Math.sin(((-hz - 0.012) / 0.062) * Math.PI);
        sum += 0.75 * palmSpan(hz, 0.012, 0.074) * line(around - thenar - jitter * 6, 0.006);
        const head = 0.6 + ((-hz - 0.052) / 0.024) * 0.3;
        sum += 0.6 * palmSpan(hz, 0.05, 0.076) * line(around - head, 0.008) * THREE.MathUtils.smoothstep(around, 0.6, 0.64);
        const heart = 0.96 - ((-hz - 0.07) / 0.016) * 0.28;
        sum += 0.6 * palmSpan(hz, 0.068, 0.088) * line(around - heart, 0.008) * THREE.MathUtils.smoothstep(around, 0.66, 0.7);
      }
    }
    if (factors.back > 0) {
      sum += 0.3 * (1 - THREE.MathUtils.smoothstep(Math.abs(around - 0.25), 0.1, 0.2)) * creases(WRIST_BACK, hz - jitter, 0);
    }
    factors.creases = sum;
    finish(x, y, texel);

    // Back-of-hand veins: soft, raised and a little blue; a few freckles.
    if (factors.back === 0 || hz < -0.078 || hz > 0.085) return;
    const span = THREE.MathUtils.smoothstep(hz, -0.078, -0.06) * (1 - THREE.MathUtils.smoothstep(hz, 0.05, 0.085));
    let vein = 0;
    for (const [start, drift, sway] of VEINS) {
      const path = start + drift * THREE.MathUtils.smoothstep(-hz, -0.02, 0.07) + sway * Math.sin(hz * 70 + start * 20);
      vein = Math.max(vein, line(around - path - jitter * 4, 0.009));
    }
    vein *= span * factors.back;
    mix(texel.color, VEIN, vein * 0.1, texel.color);
    texel.height += vein * 0.05;
    const cellX = Math.floor(x / 9);
    const cellY = Math.floor(y / 9);
    if (factors.back > 0.5 && hash2(cellX, cellY, 4423) > 0.94) {
      mix(texel.color, FRECKLE, 0.3 * line(Math.hypot(cellX * 9 + 4 - x, cellY * 9 + 4 - y), 1.6), texel.color);
    }
  };

  /** Nail chart: pink plate, pale lunula, white free edge. */
  const nail = (x: number, y: number, texel: Texel) => {
    const across = THREE.MathUtils.clamp(((x - NAIL_X[0]) / (NAIL_X[1] - NAIL_X[0])) * 2 - 1, -1, 1);
    const along = THREE.MathUtils.clamp((y - NAIL_Y[0]) / (NAIL_Y[1] - NAIL_Y[0]), 0, 1);
    const lunula = 1 - THREE.MathUtils.smoothstep(Math.hypot(across / 0.62, along / 0.24), 0.85, 1.05);
    const edge = THREE.MathUtils.smoothstep(along, 0.87, 0.95);
    mix(NAIL_BED, LUNULA, lunula * 0.6, texel.color);
    mix(texel.color, FLUSH, THREE.MathUtils.smoothstep(Math.abs(across), 0.75, 1) * 0.35, texel.color);
    mix(texel.color, FREE_EDGE, edge * 0.75, texel.color);
    texel.height = 0.5 + (blotch(x * 0.25, y * 4) - 0.5) * 0.04;
    texel.roughness = 0.24 + edge * 0.16;
  };

  const scale = ATLAS / size;
  return (column, row, texel) => {
    grain = hash2(column, row, 4421) - 0.5;
    const x = (column + 0.5) * scale - 0.5;
    const y = (row + 0.5) * scale - 0.5;
    if (x >= 255.75) hand(Math.max(x, 256), y, texel);
    else if (y > NAIL_Y[0] - 6) nail(x, y, texel);
    else digit(Math.min(x, 255), Math.min(y, DIGIT_ROWS), texel);
  };
}

const skins = new Map<number, THREE.MeshStandardMaterial>();

/** Skin of both first-person hands, nails included, baked `size` texels square (view-model only). */
export function skinMaterial(size: number): THREE.MeshStandardMaterial {
  let skin = skins.get(size);
  if (skin) return skin;
  // Relief is painted per atlas unit: a smaller texture steepens it.
  const surface = bake(`first-person-skin-${size}`, size, 2.4 * (size / ATLAS), () => skinPainter(size));
  skin = new THREE.MeshStandardMaterial({
    name: 'arm-skin',
    map: bakedTexture(surface.color, size, THREE.SRGBColorSpace, 4),
    normalMap: bakedTexture(surface.normal, size, THREE.NoColorSpace, 4),
    roughnessMap: bakedTexture(surface.roughness, size, THREE.NoColorSpace, 4),
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 1,
    metalness: 0,
  });
  skins.set(size, skin);
  return skin;
}
