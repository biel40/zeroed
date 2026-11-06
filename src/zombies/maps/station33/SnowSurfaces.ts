import * as THREE from 'three';
import { seededRandom, tileableNoise, valueNoise } from '../shared/ProceduralNoise';
import { decalTexture, hash2, mix, type Painter, type Rgb } from '../shared/ProceduralSurface';

/** Packed night snow, faintly blue. */
const SNOW: Rgb = [176, 186, 198];
/** Trodden snow, grey with slush. */
const TRODDEN: Rgb = [122, 128, 134];
/** Bare concrete where the snow has worn through. */
const CONCRETE: Rgb = [70, 69, 66];

/**
 * The yard's slabs under trodden snow: drifts of clean snow, grey slush
 * where boots and wheels went, slab joints showing through as faint lines
 * where the cover is thin, and bare concrete in the worn patches. A few
 * texels glint (lower roughness) like ice crystals.
 */
export function snowYardPainter(size: number, slabs: number): () => Painter {
  return () => {
    const random = seededRandom(3811);
    const cover = tileableNoise(random, size / 4, size);
    const trodden = tileableNoise(random, size / 8, size);
    const grain = tileableNoise(random, size / 32, size);
    const slab = size / slabs;
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const depth = cover(x, y) * 0.75 + grain(x, y) * 0.25;
      const bare = 1 - THREE.MathUtils.smoothstep(depth, 0.18, 0.34);
      const slush = THREE.MathUtils.smoothstep(trodden(x, y), 0.45, 0.8) * 0.85;
      const joint = (x % slab < 2 || y % slab < 2) && depth < 0.5;
      mix(SNOW, TRODDEN, slush, tinted);
      mix(tinted, CONCRETE, joint ? Math.max(bare, 0.55) : bare, tinted);
      const glint = hash2(x, y, 61) > 0.985 && bare < 0.2 ? 1.18 : 1;
      const shade = (0.9 + grain(x, y) * 0.14) * glint;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = joint ? 0.2 : 0.35 + depth * 0.5 - slush * 0.15;
      texel.roughness = glint > 1 ? 0.35 : 0.88 - slush * 0.2;
    };
  };
}

/** Fresh snow over open ground: wind ripples, soft drifts and scattered glints. */
export function snowFieldPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3821);
    const drift = tileableNoise(random, size / 4, size);
    const ripple = tileableNoise(random, size / 16, size);
    const grain = tileableNoise(random, size / 64, size);
    return (x, y, texel) => {
      const waves = Math.sin((x * 0.8 + y * 0.25) / size * Math.PI * 2 * 6 + ripple(x, y) * 5) * 0.5 + 0.5;
      const height = drift(x, y) * 0.6 + waves * 0.15 + grain(x, y) * 0.25;
      const glint = hash2(x, y, 67) > 0.98 ? 1.15 : 1;
      const shade = (0.86 + height * 0.16) * glint;
      texel.color[0] = SNOW[0] * shade;
      texel.color[1] = SNOW[1] * shade;
      texel.color[2] = SNOW[2] * shade * 1.02;
      texel.height = height;
      texel.roughness = glint > 1 ? 0.3 : 0.9;
    };
  };
}

/** Frozen puddle: a pale, glassy blot with frosted rims and a few cracks. */
export function makeIceTexture(seed: number): THREE.DataTexture {
  const size = 64;
  const random = seededRandom(seed);
  const edge = valueNoise(random, size / 4, size);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const coverage = THREE.MathUtils.smoothstep(1 - distance + (edge(x, y) - 0.5) * 0.5, 0.1, 0.32);
      const rim = coverage < 0.95 ? 1 : 0;
      const crack = Math.abs(Math.sin((x * 0.7 - y) * 0.31 + edge(x, y) * 6)) < 0.04 ? 1 : 0;
      const offset = (y * size + x) * 4;
      const tone = rim || crack ? 168 : 96;
      data[offset] = tone * 0.86;
      data[offset + 1] = tone * 0.94;
      data[offset + 2] = tone;
      data[offset + 3] = Math.round(coverage * 220);
    }
  }
  return decalTexture(data, size);
}
