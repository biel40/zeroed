import * as THREE from 'three';

/** Deterministic 0..1 generator (mulberry32) so procedural textures repeat per seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth 0..1 value noise over a lattice of random corners covering a
 * `size` x `size` texel square. Coordinates are in texels.
 */
export function valueNoise(random: () => number, cell: number, size: number): (x: number, y: number) => number {
  const cells = Math.ceil(size / cell) + 1;
  const corners = Float32Array.from({ length: cells * cells }, () => random());
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = THREE.MathUtils.smootherstep(gx - x0, 0, 1);
    const fy = THREE.MathUtils.smootherstep(gy - y0, 0, 1);
    const at = (cx: number, cy: number): number => corners[cy * cells + cx];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}
