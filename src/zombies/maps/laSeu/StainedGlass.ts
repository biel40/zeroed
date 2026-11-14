import * as THREE from 'three';
import { hash2, type Rgb } from '../shared/ProceduralSurface';

/**
 * Stained glass painted in code: leaded quarries for the lancets and the
 * triangle lattice of Palma's great rose. Pure texel maths, no canvas, so the
 * windows are identical on every device and in tests.
 */

const LEAD: Rgb = [10, 9, 12];
const TRACERY_STONE: Rgb = [58, 50, 42];

export const WARM_GLASS: ReadonlyArray<Rgb> = [
  [196, 38, 28], [236, 150, 36], [248, 204, 84], [214, 88, 30], [150, 24, 40], [48, 76, 190],
];

export const COOL_GLASS: ReadonlyArray<Rgb> = [
  [40, 78, 212], [72, 132, 232], [128, 62, 190], [38, 156, 168], [24, 44, 140], [206, 52, 60],
];

const ROSE_GLASS: ReadonlyArray<Rgb> = [
  [206, 40, 44], [44, 84, 214], [246, 196, 70], [150, 50, 176], [40, 150, 120], [232, 120, 40],
];

const LANCET_SIZE = { width: 64, height: 256 } as const;
const ROSE_SIZE = 256;

function glassTexture(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function put(data: Uint8Array, offset: number, color: Rgb, gain: number, alpha = 255): void {
  data[offset] = Math.min(255, color[0] * gain);
  data[offset + 1] = Math.min(255, color[1] * gain);
  data[offset + 2] = Math.min(255, color[2] * gain);
  data[offset + 3] = alpha;
}

/** Distance of `value` to the nearest integer. */
function toLine(value: number): number {
  return Math.abs(value - Math.round(value));
}

/**
 * A two-light lancet: diamond quarries between lead cames, saddle bars and
 * three medallions per light. `v` runs up the window; the pointed head is cut
 * by the window's geometry.
 */
export function makeLancetGlass(palette: ReadonlyArray<Rgb>, seed: number): THREE.DataTexture {
  const { width, height } = LANCET_SIZE;
  const data = new Uint8Array(width * height * 4);
  const cell = 10;
  const lightWidth = width / 2;
  const medallionRadius = 11;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const inLight = x % lightWidth;
      const frame = x < 2 || x >= width - 2 || Math.abs(x - width / 2 + 0.5) < 1.6 || y % 32 === 0;
      const diagonalA = (x + y) / cell;
      const diagonalB = (x - y) / cell;
      const came = toLine(diagonalA) < 0.09 || toLine(diagonalB) < 0.09;
      const medallionY = (Math.floor(y / (height / 4)) + 0.5) * (height / 4);
      const medallion = Math.hypot(inLight - lightWidth / 2 + 0.5, y - medallionY);
      const onMedallion = y > height / 8 && y < height * 7 / 8 && medallion < medallionRadius;
      if (frame || (onMedallion ? Math.abs(medallion - medallionRadius) < 1.2 || Math.abs(medallion - 4.5) < 0.7 : came)) {
        put(data, offset, LEAD, 1);
        continue;
      }
      if (onMedallion) {
        const ring = medallion < 4.5 ? 2 : Math.floor(hash2(Math.floor(medallionY), x < lightWidth ? 0 : 1, seed) * palette.length);
        put(data, offset, palette[ring % palette.length], 1.15);
        continue;
      }
      const quarryA = Math.floor(diagonalA);
      const quarryB = Math.floor(diagonalB);
      const pick = hash2(quarryA, quarryB, seed);
      // Old glass: every pane has its own density, a few are nearly opaque with grime.
      const gain = 0.55 + hash2(quarryB, quarryA, seed + 7) * 0.6;
      put(data, offset, palette[Math.floor(pick * palette.length)], pick > 0.93 ? 0.18 : gain);
    }
  }
  return glassTexture(data, width, height);
}

/**
 * The rose: a lattice of small triangles gathered into larger ones by heavier
 * tracery, the star pattern of La Seu's "Gothic eye". Texels outside the
 * circle are transparent (the material cuts them with `alphaTest`).
 */
export function makeRoseGlass(seed: number): THREE.DataTexture {
  const size = ROSE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const rows = 9;
  const sqrt3 = Math.sqrt(3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const px = (x + 0.5 - size / 2) / (size / 2);
      const py = (y + 0.5 - size / 2) / (size / 2);
      const radius = Math.hypot(px, py);
      if (radius > 1) {
        put(data, offset, TRACERY_STONE, 1, 0);
        continue;
      }
      if (radius > 0.93 || (radius > 0.6 && radius < 0.63)) {
        put(data, offset, TRACERY_STONE, radius > 0.93 ? 1 : 0.6);
        continue;
      }
      // Three line families at 0, 60 and 120 degrees.
      const b = py * rows * 2 / sqrt3;
      const a = px * rows - b / 2;
      const c = a + b;
      const fine = Math.min(toLine(a), toLine(b), toLine(c));
      const heavy = Math.min(toLine(a / 3), toLine(b / 3), toLine(c / 3)) * 3;
      if (fine < 0.07 || heavy < 0.14) {
        put(data, offset, heavy < 0.14 ? TRACERY_STONE : LEAD, heavy < 0.14 ? 0.7 : 1);
        continue;
      }
      if (radius < 0.07) {
        put(data, offset, ROSE_GLASS[2], 1.2);
        continue;
      }
      const cellA = Math.floor(a);
      const cellB = Math.floor(b);
      const upper = a - cellA + (b - cellB) > 1 ? 1 : 0;
      const pick = hash2(cellA * 2 + upper, cellB, seed);
      const gain = 0.6 + hash2(cellB, cellA * 2 + upper, seed + 3) * 0.6;
      put(data, offset, ROSE_GLASS[Math.floor(pick * ROSE_GLASS.length)], gain);
    }
  }
  return glassTexture(data, size, size);
}

/** A soft beam: bright at the window (v = 1), fading to nothing at the floor and at both edges. */
export function makeShaftTexture(): THREE.DataTexture {
  const width = 16;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const across = 1 - Math.abs((x + 0.5) / width * 2 - 1);
      const along = (y + 0.5) / height;
      const level = Math.round(255 * THREE.MathUtils.smoothstep(across, 0, 0.9) * along * along);
      data.fill(level, (y * width + x) * 4, (y * width + x) * 4 + 3);
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
