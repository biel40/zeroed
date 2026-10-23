import * as THREE from 'three';

/**
 * Code-baked PBR surfaces shared by every map: a painter writes colour,
 * height, roughness and (optionally) glow per texel; `bake` turns that into
 * colour, normal, roughness and emissive data once per key and process.
 */
export type Rgb = [number, number, number];

/** One texel being painted: colour 0..255, height, roughness and glow 0..1. */
export interface Texel {
  color: Rgb;
  height: number;
  roughness: number;
  emissive: number;
}

export interface BakedSurface {
  readonly size: number;
  readonly color: Uint8Array;
  readonly normal: Uint8Array;
  readonly roughness: Uint8Array;
  /** Glow mask, only when the painter lit at least one texel. */
  readonly emissive: Uint8Array | null;
}

export type Painter = (x: number, y: number, texel: Texel) => void;

const bakeCache = new Map<string, BakedSurface>();

/** Bakes colour, a height-derived normal map, roughness and glow once per key. */
export function bake(key: string, size: number, normalStrength: number, makePainter: () => Painter): BakedSurface {
  const cached = bakeCache.get(key);
  if (cached) return cached;
  const paint = makePainter();
  const color = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const glow = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const texel: Texel = { color: [0, 0, 0], height: 0, roughness: 1, emissive: 0 };
  let glows = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      texel.height = 0.5;
      texel.roughness = 0.8;
      texel.emissive = 0;
      paint(x, y, texel);
      const index = y * size + x;
      heights[index] = texel.height;
      for (let channel = 0; channel < 3; channel++) {
        color[index * 4 + channel] = Math.round(THREE.MathUtils.clamp(texel.color[channel], 0, 255));
      }
      color[index * 4 + 3] = 255;
      const rough = Math.round(THREE.MathUtils.clamp(texel.roughness, 0, 1) * 255);
      roughness.fill(rough, index * 4, index * 4 + 3);
      roughness[index * 4 + 3] = 255;
      const lit = Math.round(THREE.MathUtils.clamp(texel.emissive, 0, 1) * 255);
      if (lit > 0) glows = true;
      glow.fill(lit, index * 4, index * 4 + 3);
      glow[index * 4 + 3] = 255;
    }
  }
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (dx: number, dy: number): number => heights[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const nx = (at(-1, 0) - at(1, 0)) * normalStrength;
      const ny = (at(0, -1) - at(0, 1)) * normalStrength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      normal[offset] = Math.round((nx / length * 0.5 + 0.5) * 255);
      normal[offset + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      normal[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;
    }
  }
  const baked = { size, color, normal, roughness, emissive: glows ? glow : null };
  bakeCache.set(key, baked);
  return baked;
}

export function bakedTexture(data: Uint8Array, size: number, colorSpace: THREE.ColorSpace, anisotropy: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Standard material over a baked surface. `metersPerTile` drives the
 * world-scale UVs of ArenaStructure and StaticMeshBatch boxes; a glowing
 * surface gets its mask as emissive map (black until `emissive` is set).
 */
export function surfaceMaterial(
  name: string,
  surface: BakedSurface,
  anisotropy: number,
  metersPerTile: number,
  parameters: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name,
    map: bakedTexture(surface.color, surface.size, THREE.SRGBColorSpace, anisotropy),
    normalMap: bakedTexture(surface.normal, surface.size, THREE.NoColorSpace, anisotropy),
    roughnessMap: bakedTexture(surface.roughness, surface.size, THREE.NoColorSpace, anisotropy),
    emissiveMap: surface.emissive ? bakedTexture(surface.emissive, surface.size, THREE.SRGBColorSpace, anisotropy) : null,
    roughness: 1,
    metalness: 0,
    ...parameters,
  });
  material.userData.metersPerTile = metersPerTile;
  return material;
}

export function mix(a: Rgb, b: Rgb, t: number, out: Rgb): Rgb {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/** Deterministic 0..1 hash of an integer lattice point. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Non-repeating alpha texture for decals (stains, blots, streaks). */
export function decalTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Transparent overlay that never writes depth and wins the z-fight against its wall. */
export function decalMaterial(
  name: string,
  map: THREE.Texture,
  roughness: number,
  parameters: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name,
    map,
    transparent: true,
    alphaTest: 0.03,
    depthWrite: false,
    roughness,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    ...parameters,
  });
}
