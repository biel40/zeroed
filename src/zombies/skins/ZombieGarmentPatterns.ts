import * as THREE from 'three';
import { valueNoise } from './ZombieSkinDamage';
import { WALKER_BAND_COLORS, walkerBandAt } from './ZombieSkinRegions';

/**
 * Surface detail for the long garments: one small procedural atlas shared by
 * every patterned skin. Its first cell repeats the walker's 32x32 palette, so
 * the body keeps its colors through retargeted UVs; the other cells are
 * grayscale patterns the vertex colors tint. Opaque everywhere except ragged
 * hems and lace, which the material cuts out with an alpha test. Built once,
 * in code, so it costs one small texture and no asset.
 */

export type GarmentPattern =
  /** Coarse wool or linen, grimy and darker towards the hem. */
  | 'weave'
  /** Weave whose bottom edge is torn into tatters and rips. */
  | 'ragged'
  /** Gold-thread band: borders and a column of crosses in diamonds. */
  | 'embroidery'
  /** Openwork lace band with a scalloped edge. */
  | 'lace'
  /** Riveted rings in staggered rows, rusted. */
  | 'chainmail'
  /** Twisted cord. */
  | 'rope'
  /**
   * Brocades bake two colors, gold over a dyed ground, so their parts tint
   * with near-white: lilies on blue, scrollwork on black, crosses on crimson.
   */
  | 'brocadeAzure'
  | 'brocadeSable'
  | 'brocadeGules';

export const GARMENT_PATTERNS: readonly GarmentPattern[] = [
  'weave', 'ragged', 'embroidery', 'lace', 'chainmail', 'rope', 'brocadeAzure', 'brocadeSable', 'brocadeGules',
];

/**
 * Alpha below which a patterned skin's material discards the texel (tears,
 * lace holes). Low, because the test also sees the death fade's opacity: the
 * body must stay visible until the fade has all but finished.
 */
export const GARMENT_ALPHA_TEST = 0.1;

const ATLAS_SIZE = 256;
const CELL = 64;
/** Texels of a pattern cell kept clear of filtering from its neighbours. */
const INSET = 3;
const WALKER_ATLAS_SIZE = 32;

/** Cell (column, row) of each pattern; cell (0, 0) holds the walker palette. */
const CELLS: Readonly<Record<GarmentPattern, readonly [number, number]>> = {
  weave: [1, 0],
  ragged: [2, 0],
  embroidery: [3, 0],
  lace: [0, 1],
  chainmail: [1, 1],
  rope: [2, 1],
  brocadeAzure: [3, 1],
  brocadeSable: [0, 2],
  brocadeGules: [1, 2],
};

/**
 * sRGB gray each pattern paints its main surface with: a vertex color of
 * `target * garmentPatternGain` shows that surface at the target color.
 */
const SURFACE_GRAY: Readonly<Record<GarmentPattern, number>> = {
  weave: 0.86,
  ragged: 0.86,
  embroidery: 1,
  lace: 0.95,
  chainmail: 0.9,
  rope: 0.8,
  brocadeAzure: 1,
  brocadeSable: 1,
  brocadeGules: 1,
};

/** Atlas UV of the walker palette at walker UV (u, v), written at `offset`. */
export function walkerPaletteUv(u: number, v: number, target: Float32Array, offset: number): void {
  const scale = WALKER_ATLAS_SIZE / ATLAS_SIZE;
  target[offset] = u * scale;
  target[offset + 1] = v * scale;
}

/** Atlas UV of `pattern` at pattern coordinates (u across, v down to the hem), written at `offset`. */
export function garmentPatternUv(pattern: GarmentPattern, u: number, v: number, target: Float32Array, offset: number): void {
  const [column, row] = CELLS[pattern];
  const span = CELL - INSET * 2;
  target[offset] = (column * CELL + INSET + THREE.MathUtils.clamp(u, 0, 1) * span) / ATLAS_SIZE;
  target[offset + 1] = (row * CELL + INSET + THREE.MathUtils.clamp(v, 0, 1) * span) / ATLAS_SIZE;
}

/** Linear multiplier that makes a pattern's main surface show at its tint. */
export function garmentPatternGain(pattern: GarmentPattern): number {
  return 1 / THREE.MathUtils.clamp(new THREE.Color().setRGB(SURFACE_GRAY[pattern], 0, 0, THREE.SRGBColorSpace).r, 1e-3, 1);
}

/** sRGB color (0..1) and alpha (0 or 1) of a pattern at (x, y) texels inside its square, y down. */
type PatternTexel = (x: number, y: number) => readonly [number, number, number, number];
/** Gray (sRGB 0..1) and alpha of a pattern the vertex colors tint. */
type GrayTexel = (x: number, y: number) => readonly [number, number];

const SPAN = CELL - INSET * 2;
/** Brocade motifs repeat on this grid, in texels. */
const BROCADE_CELL = 16;
const BROCADE_GOLD: readonly [number, number, number] = [0.8, 0.62, 0.27];

function gray(texel: GrayTexel): PatternTexel {
  return (x, y) => {
    const [value, alpha] = texel(x, y);
    return [value, value, value, alpha];
  };
}

/**
 * Gold motif woven into a dyed ground. `motif` sees local coordinates in
 * -0.5..0.5 within one grid cell and the cell's column and row.
 */
function brocade(
  ground: readonly [number, number, number], seed: number,
  motif: (ls: number, lt: number, column: number, row: number) => boolean,
): PatternTexel {
  return (x, y) => {
    const column = Math.floor(x / BROCADE_CELL);
    const row = Math.floor(y / BROCADE_CELL);
    const ls = x / BROCADE_CELL - column - 0.5;
    const lt = y / BROCADE_CELL - row - 0.5;
    const shade = weaveGray(x, y, seed) / SURFACE_GRAY.weave;
    if (motif(ls, lt, column, row)) {
      // Worn thread: some of the gold is rubbed down towards the ground.
      const wear = 0.75 + 0.25 * valueNoise(x / 5, y / 5, 10, seed);
      return [BROCADE_GOLD[0] * wear, BROCADE_GOLD[1] * wear, BROCADE_GOLD[2] * wear, 1];
    }
    return [ground[0] * shade, ground[1] * shade, ground[2] * shade, 1];
  };
}

/** A stylized lily: three petals over a band and a stem. */
function lily(ls: number, lt: number): boolean {
  const petal = Math.abs(ls) < 0.07 * (1 - (lt + 0.4) * 0.6) + 0.02 && lt > -0.4 && lt < 0.08;
  const side = ((Math.abs(ls) - 0.2) ** 2) / 0.012 + ((lt + 0.02) ** 2) / 0.02 < 1 && Math.abs(ls) > 0.1;
  const band = Math.abs(lt - 0.12) < 0.05 && Math.abs(ls) < 0.24;
  const stem = Math.abs(ls) < 0.05 && lt > 0.12 && lt < 0.36;
  return petal || side || band || stem;
}

/** Diagonal scrollwork lattice with a boss at each crossing. */
function scrollwork(ls: number, lt: number): boolean {
  const diagonal = Math.abs(Math.abs(ls) - Math.abs(lt)) < 0.06;
  const boss = ls * ls + lt * lt < 0.012;
  const curl = Math.abs(Math.hypot(ls - 0.25, lt) - 0.13) < 0.035 && ls > 0.2;
  return diagonal || boss || curl;
}

/** Latin crosses on a staggered grid, with rosettes between them. */
function crosslets(ls: number, lt: number, column: number, row: number): boolean {
  if ((column + row) % 2 === 1) return Math.abs(Math.hypot(ls, lt) - 0.12) < 0.05 || ls * ls + lt * lt < 0.003;
  return (Math.abs(ls) < 0.09 && Math.abs(lt) < 0.36) || (Math.abs(lt + 0.1) < 0.08 && Math.abs(ls) < 0.27);
}

function weaveGray(x: number, y: number, seed: number): number {
  const thread = (Math.floor(x) + Math.floor(y)) % 2 === 0 ? 0.035 : -0.035;
  const slub = (valueNoise(x * 0.5, y * 3, 0, seed) - 0.5) * 0.08;
  const fold = 0.05 * Math.sin((x / SPAN) * Math.PI * 12);
  const grime = (valueNoise(x / 8, y / 8, 1, seed) - 0.5) * 0.18;
  const hem = 0.1 * (y / SPAN) ** 2;
  return SURFACE_GRAY.weave + thread + slub + fold + grime - hem;
}

const PATTERN_TEXELS: Readonly<Record<GarmentPattern, PatternTexel>> = {
  weave: gray((x, y) => [weaveGray(x, y, 3), 1]),

  ragged: gray((x, y) => {
    // Torn edge: a jagged band at the bottom, a few rips above it and loose
    // threads hanging into the tears.
    const depth = 0.1 + 0.1 * valueNoise(x / 3, 0, 2, 7) + 0.05 * valueNoise(x, 0, 3, 7);
    const t = y / SPAN;
    const torn = t > 1 - depth;
    const thread = torn && Math.floor(x) % 5 === 0 && t < 1 - depth * 0.35;
    let rip = false;
    for (let index = 0; index < 5; index++) {
      const cx = valueNoise(index, 0, 4, 11) * SPAN;
      const cy = SPAN * (0.6 + 0.22 * valueNoise(index, 1, 4, 11));
      const rx = 1.5 + 2 * valueNoise(index, 2, 4, 11);
      const ry = 3 + 4 * valueNoise(index, 3, 4, 11);
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) rip = true;
    }
    const shade = weaveGray(x, y, 5) - (thread ? 0.15 : 0);
    return [shade, (torn && !thread) || rip ? 0 : 1];
  }),

  embroidery: gray((x, y) => {
    const s = x / SPAN;
    const motif = (y / SPAN) * 4;
    const ls = s - 0.5;
    const lt = motif - Math.floor(motif) - 0.5;
    const ground = 0.3 + (valueNoise(x / 2, y / 2, 5, 13) - 0.5) * 0.08;
    const worn = (valueNoise(x / 7, y / 7, 6, 13) - 0.5) * 0.3;
    const border = s < 0.09 || s > 0.91;
    const stitch = border && Math.floor(y / 2) % 3 !== 0;
    const crossArm = (Math.abs(ls) < 0.07 && Math.abs(lt) < 0.32) || (Math.abs(lt) < 0.07 && Math.abs(ls) < 0.26);
    const diamond = Math.abs(Math.abs(ls) + Math.abs(lt) - 0.4) < 0.045;
    const dot = (Math.abs(ls) - 0.3) ** 2 + (Math.abs(lt) - 0.3) ** 2 < 0.004;
    const thread = crossArm || stitch ? 1 : diamond || dot ? 0.82 : ground;
    return [thread + (thread > 0.5 ? worn : 0), 1];
  }),

  lace: gray((x, y) => {
    const t = y / SPAN;
    const s = x / SPAN;
    const scallop = 0.8 + 0.14 * Math.sin(Math.PI * (s * 8 - Math.floor(s * 8)));
    if (t > scallop) return [0.95, 0];
    if (t < 0.16) return [0.95 - (valueNoise(x / 3, y / 3, 7, 17) - 0.5) * 0.1, 1];
    // Openwork: rows of eyelets between thread bars.
    const cx = (Math.floor(x / 6) + 0.5) * 6 + (Math.floor(y / 6) % 2) * 3;
    const cy = (Math.floor(y / 6) + 0.5) * 6;
    const eyelet = (x - cx) ** 2 + (y - cy) ** 2 < 2.4 ** 2;
    return [0.92, eyelet ? 0 : 1];
  }),

  chainmail: gray((x, y) => {
    const ringW = 4;
    const ringH = 3.5;
    const row = Math.floor(y / ringH);
    const offset = row % 2 === 0 ? 0 : ringW / 2;
    const cx = (Math.floor((x - offset) / ringW) + 0.5) * ringW + offset;
    const cy = (row + 0.5) * ringH;
    const dx = (x - cx) / (ringW / 2);
    const dy = (y - cy) / (ringH / 2);
    const radius = Math.hypot(dx, dy);
    const rust = (valueNoise(x / 6, y / 6, 8, 19) - 0.5) * 0.3;
    // Lit from above: the upper half of each ring catches the light.
    const ring = Math.abs(radius - 0.72) < 0.32 ? 0.9 - Math.max(0, dy) * 0.35 : 0.1;
    return [ring + (ring > 0.5 ? rust : rust * 0.3), 1];
  }),

  rope: gray((x, y) => {
    const twist = Math.sin(((x + y) / 5) * Math.PI * 2);
    return [0.55 + 0.32 * twist + (valueNoise(x / 2, y / 2, 9, 23) - 0.5) * 0.1, 1];
  }),

  brocadeAzure: brocade([0.15, 0.2, 0.4], 29, lily),
  brocadeSable: brocade([0.11, 0.1, 0.09], 31, scrollwork),
  brocadeGules: brocade([0.42, 0.08, 0.1], 37, crosslets),
};

function fillWalkerPalette(data: Uint8Array): void {
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      // The palette sits in the corner; the rest of the cell repeats its edge texels.
      const u = (Math.min(x, WALKER_ATLAS_SIZE - 1) + 0.5) / WALKER_ATLAS_SIZE;
      const v = (Math.min(y, WALKER_ATLAS_SIZE - 1) + 0.5) / WALKER_ATLAS_SIZE;
      const [r, g, b] = WALKER_BAND_COLORS[walkerBandAt(u, v)];
      data.set([r, g, b, 255], (y * ATLAS_SIZE + x) * 4);
    }
  }
}

function fillPattern(data: Uint8Array, pattern: GarmentPattern): void {
  const [column, row] = CELLS[pattern];
  const texel = PATTERN_TEXELS[pattern];
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      // The inset frame repeats the pattern's edge so filtering never reaches a neighbour.
      const px = THREE.MathUtils.clamp(x - INSET, 0, SPAN - 1) + 0.5;
      const py = THREE.MathUtils.clamp(y - INSET, 0, SPAN - 1) + 0.5;
      const [r, g, b, alpha] = texel(px, py);
      const byte = (value: number): number => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      data.set([byte(r), byte(g), byte(b), alpha > 0 ? 255 : 0], ((row * CELL + y) * ATLAS_SIZE + column * CELL + x) * 4);
    }
  }
}

let sharedAtlas: THREE.DataTexture | null = null;

/** The shared atlas: walker palette plus every garment pattern. */
export function garmentAtlasTexture(): THREE.DataTexture {
  if (sharedAtlas) return sharedAtlas;
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  fillWalkerPalette(data);
  for (const pattern of GARMENT_PATTERNS) fillPattern(data, pattern);
  const texture = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.name = 'zombie-garment-atlas';
  texture.needsUpdate = true;
  sharedAtlas = texture;
  return texture;
}
