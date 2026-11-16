import { SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import {
  GARMENT_PATTERNS,
  garmentAtlasTexture,
  garmentPatternUv,
  walkerPaletteUv,
  type GarmentPattern,
} from '../src/zombies/skins/ZombieGarmentPatterns';
import { WALKER_BAND_COLORS, walkerBandAt } from '../src/zombies/skins/ZombieSkinRegions';

const atlas = garmentAtlasTexture();
const { width, height, data } = atlas.image as { width: number; height: number; data: Uint8Array };

/** RGBA texel a UV samples (nearest). */
function texel(u: number, v: number): readonly number[] {
  const x = Math.min(width - 1, Math.floor(u * width));
  const y = Math.min(height - 1, Math.floor(v * height));
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

/** Every texel a pattern's [0, 1]² square covers, sampled on a grid. */
function patternTexels(pattern: GarmentPattern, steps = 48): Array<{ u: number; v: number; rgba: readonly number[] }> {
  const out: Array<{ u: number; v: number; rgba: readonly number[] }> = [];
  const uv = new Float32Array(2);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      garmentPatternUv(pattern, i / steps, j / steps, uv, 0);
      out.push({ u: i / steps, v: j / steps, rgba: texel(uv[0], uv[1]) });
    }
  }
  return out;
}

describe('garment pattern atlas', () => {
  it('is one shared sRGB texture', () => {
    expect(garmentAtlasTexture()).toBe(atlas);
    expect(atlas.colorSpace).toBe(SRGBColorSpace);
    expect(width).toBe(height);
  });

  it('copies the walker palette so retargeted body UVs keep their exact colors', () => {
    const uv = new Float32Array(2);
    for (let row = 0; row < 32; row++) {
      for (let column = 0; column < 32; column++) {
        const u = (column + 0.5) / 32;
        const v = (row + 0.5) / 32;
        walkerPaletteUv(u, v, uv, 0);
        expect(texel(uv[0], uv[1]).slice(0, 3)).toEqual([...WALKER_BAND_COLORS[walkerBandAt(u, v)]]);
      }
    }
  });

  it('keeps every pattern inside its own tile, clear of the palette and of each other', () => {
    const uv = new Float32Array(2);
    const palette = new Float32Array(2);
    walkerPaletteUv(1, 1, palette, 0);
    const tiles = GARMENT_PATTERNS.map((pattern) => {
      garmentPatternUv(pattern, 0, 0, uv, 0);
      const min = [uv[0], uv[1]];
      garmentPatternUv(pattern, 1, 1, uv, 0);
      return { min, max: [uv[0], uv[1]] };
    });
    tiles.forEach((tile, index) => {
      expect(tile.min[0]).toBeGreaterThanOrEqual(0);
      expect(tile.max[1]).toBeLessThanOrEqual(1);
      expect(tile.min[0] >= palette[0] || tile.min[1] >= palette[1]).toBe(true);
      tiles.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        const overlaps = tile.min[0] < other.max[0] && other.min[0] < tile.max[0]
          && tile.min[1] < other.max[1] && other.min[1] < tile.max[1];
        expect(overlaps, `${GARMENT_PATTERNS[index]} / ${GARMENT_PATTERNS[otherIndex]}`).toBe(false);
      });
    });
  });

  it('tears holes only into the bottom of a ragged hem, leaving the top whole', () => {
    const texels = patternTexels('ragged');
    expect(texels.filter(({ v, rgba }) => v < 0.5 && rgba[3] < 128)).toHaveLength(0);
    expect(texels.filter(({ v, rgba }) => v > 0.85 && rgba[3] < 128).length).toBeGreaterThan(10);
  });

  it('opens lace into holes and keeps solid patterns opaque', () => {
    expect(patternTexels('lace').filter(({ rgba }) => rgba[3] < 128).length).toBeGreaterThan(50);
    for (const pattern of ['weave', 'embroidery', 'chainmail', 'rope'] as const) {
      expect(patternTexels(pattern).every(({ rgba }) => rgba[3] === 255), pattern).toBe(true);
    }
  });

  it('gives embroidery and chainmail strong light-dark contrast, and weave a subtle one', () => {
    const spread = (pattern: GarmentPattern): number => {
      const values = patternTexels(pattern).map(({ rgba }) => rgba[0]);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread('embroidery')).toBeGreaterThan(120);
    expect(spread('chainmail')).toBeGreaterThan(120);
    expect(spread('weave')).toBeGreaterThan(15);
    expect(spread('weave')).toBeLessThan(110);
  });

  it('bakes gold motifs onto each brocade ground, both colored and opaque', () => {
    const grounds: Record<'brocadeAzure' | 'brocadeSable' | 'brocadeGules', (r: number, g: number, b: number) => boolean> = {
      brocadeAzure: (r, _g, b) => b > r + 30,
      brocadeSable: (r, g, b) => Math.max(r, g, b) < 60,
      brocadeGules: (r, g, b) => r > g + 40 && r > b + 40,
    };
    for (const [pattern, isGround] of Object.entries(grounds) as Array<[GarmentPattern, (r: number, g: number, b: number) => boolean]>) {
      const texels = patternTexels(pattern);
      expect(texels.every(({ rgba }) => rgba[3] === 255), pattern).toBe(true);
      const gold = texels.filter(({ rgba: [r, g, b] }) => r > 140 && g > 100 && b < g * 0.75);
      const ground = texels.filter(({ rgba: [r, g, b] }) => isGround(r, g, b));
      expect(gold.length / texels.length, `${pattern} gold`).toBeGreaterThan(0.08);
      expect(ground.length / texels.length, `${pattern} ground`).toBeGreaterThan(0.4);
    }
  });

  it('is deterministic', () => {
    const copy = Uint8Array.from(data);
    expect(garmentAtlasTexture().image.data).toEqual(copy);
  });
});
