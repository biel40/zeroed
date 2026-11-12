import * as THREE from 'three';
import { seededRandom } from '../weapons/ProceduralTextures';

/** How strongly the shared noise marks one kind of surface. Tiles are in metres of model space. */
export interface SurfaceDetailProfile {
  /** Size of one tile of the fine layer: pores, weave, machining grain. */
  readonly fineTile: number;
  /** Size of one tile of the coarse layer: wear patches, grime, wrinkles. */
  readonly coarseTile: number;
  /** Relief of the surface normal; 0 leaves it smooth. */
  readonly bump: number;
  /** Peak change of roughness between worn and untouched patches. */
  readonly roughness: number;
  /** Darkening of the colour in the hollows of the relief. */
  readonly cavity: number;
}

/** Rotten skin and cloth: deep pores and wrinkles, grime in the creases. */
export const ZOMBIE_SURFACE_DETAIL: SurfaceDetailProfile = { fineTile: 0.035, coarseTile: 0.28, bump: 0.45, roughness: 0.22, cavity: 0.3 };
/** Steel, polymer and wood at arm's length: fine grain and handling wear that breaks up reflections. */
export const WEAPON_SURFACE_DETAIL: SurfaceDetailProfile = { fineTile: 0.012, coarseTile: 0.11, bump: 0.22, roughness: 0.16, cavity: 0.1 };

const NOISE_SIZE = 32;
const NOISE_SEED = 1986;
/** Lattice cells per tile and weight of each octave; every count divides the texture size. */
const OCTAVES = [{ cells: 4, weight: 0.5 }, { cells: 8, weight: 0.3 }, { cells: 16, weight: 0.2 }] as const;
const CACHE_KEY = 'surface-detail-v1';

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Tileable value noise on a `cells`³ lattice, sampled on a `size`³ grid. */
function addOctave(heights: Float32Array, size: number, cells: number, weight: number, random: () => number): void {
  const lattice = Float32Array.from({ length: cells ** 3 }, random);
  const at = (x: number, y: number, z: number): number => lattice[((z % cells) * cells + (y % cells)) * cells + (x % cells)];
  const scale = cells / size;
  let texel = 0;
  for (let z = 0; z < size; z++) {
    const cellZ = Math.floor(z * scale);
    const blendZ = smooth(z * scale - cellZ);
    for (let y = 0; y < size; y++) {
      const cellY = Math.floor(y * scale);
      const blendY = smooth(y * scale - cellY);
      for (let x = 0; x < size; x++, texel++) {
        const cellX = Math.floor(x * scale);
        const blendX = smooth(x * scale - cellX);
        const near = THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(at(cellX, cellY, cellZ), at(cellX + 1, cellY, cellZ), blendX),
          THREE.MathUtils.lerp(at(cellX, cellY + 1, cellZ), at(cellX + 1, cellY + 1, cellZ), blendX),
          blendY,
        );
        const far = THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(at(cellX, cellY, cellZ + 1), at(cellX + 1, cellY, cellZ + 1), blendX),
          THREE.MathUtils.lerp(at(cellX, cellY + 1, cellZ + 1), at(cellX + 1, cellY + 1, cellZ + 1), blendX),
          blendY,
        );
        heights[texel] += THREE.MathUtils.lerp(near, far, blendZ) * weight;
      }
    }
  }
}

/**
 * RGBA bytes of a `size`³ volume that repeats in every axis: alpha is the
 * height (0..255 over its full range) and RGB its gradient, centred on 127.5.
 * Storing the gradient lets a shader tilt a normal with a single sample.
 */
export function buildDetailNoise(size: number, random: () => number): Uint8Array {
  const heights = new Float32Array(size ** 3);
  for (const octave of OCTAVES) addOctave(heights, size, Math.min(octave.cells, size), octave.weight, random);

  let lowest = Infinity;
  let highest = -Infinity;
  for (const height of heights) {
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  const range = Math.max(highest - lowest, 1e-6);
  const index = (x: number, y: number, z: number): number => (((z + size) % size) * size + ((y + size) % size)) * size + ((x + size) % size);

  const gradients = new Float32Array(size ** 3 * 3);
  let steepest = 1e-6;
  for (let z = 0, texel = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++, texel++) {
        const dx = heights[index(x + 1, y, z)] - heights[index(x - 1, y, z)];
        const dy = heights[index(x, y + 1, z)] - heights[index(x, y - 1, z)];
        const dz = heights[index(x, y, z + 1)] - heights[index(x, y, z - 1)];
        gradients.set([dx, dy, dz], texel * 3);
        steepest = Math.max(steepest, Math.abs(dx), Math.abs(dy), Math.abs(dz));
      }
    }
  }

  const data = new Uint8Array(size ** 3 * 4);
  for (let texel = 0; texel < size ** 3; texel++) {
    for (let axis = 0; axis < 3; axis++) {
      data[texel * 4 + axis] = Math.round((gradients[texel * 3 + axis] / steepest * 0.5 + 0.5) * 255);
    }
    data[texel * 4 + 3] = Math.round((heights[texel] - lowest) / range * 255);
  }
  return data;
}

let noiseTexture: THREE.Data3DTexture | undefined;

/** One volume shared by every detailed material; its mipmaps fade the detail out with distance. */
function getDetailNoiseTexture(): THREE.Data3DTexture {
  if (noiseTexture) return noiseTexture;
  noiseTexture = new THREE.Data3DTexture(buildDetailNoise(NOISE_SIZE, seededRandom(NOISE_SEED)), NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  noiseTexture.format = THREE.RGBAFormat;
  noiseTexture.type = THREE.UnsignedByteType;
  noiseTexture.wrapS = noiseTexture.wrapT = noiseTexture.wrapR = THREE.RepeatWrapping;
  noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.generateMipmaps = true;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vSurfaceDetailPosition;
`;

/** The rest pose, before skinning: the detail stays glued to a moving body. */
const VERTEX_MAIN = /* glsl */ `
vSurfaceDetailPosition = position;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vSurfaceDetailPosition;
uniform highp sampler3D uSurfaceDetailNoise;
/** 1 / fine tile, 1 / coarse tile, bump, roughness. */
uniform vec4 uSurfaceDetail;
uniform float uSurfaceDetailCavity;
#ifndef USE_NORMALMAP_OBJECTSPACE
  uniform mat3 normalMatrix;
#endif
`;

/** After the roughness map: both layers are sampled once and reused for the normal below. */
const FRAGMENT_SURFACE = /* glsl */ `
vec4 surfaceDetailFine = texture(uSurfaceDetailNoise, vSurfaceDetailPosition * uSurfaceDetail.x);
vec4 surfaceDetailCoarse = texture(uSurfaceDetailNoise, vSurfaceDetailPosition * uSurfaceDetail.y + 0.37);
float surfaceDetailHeight = mix(surfaceDetailFine.a, surfaceDetailCoarse.a, 0.4) - 0.5;
diffuseColor.rgb *= 1.0 + uSurfaceDetailCavity * surfaceDetailHeight;
roughnessFactor = clamp(roughnessFactor + (surfaceDetailCoarse.a - 0.5) * 2.0 * uSurfaceDetail.w, 0.04, 1.0);
`;

/** After the normal maps: tilts the shading normal along the stored gradient, kept in the surface plane. */
const FRAGMENT_NORMAL = /* glsl */ `
vec3 surfaceDetailGradient = (surfaceDetailFine.rgb - 0.5) * 2.0 + (surfaceDetailCoarse.rgb - 0.5);
float surfaceDetailSlope = length(surfaceDetailGradient);
if (surfaceDetailSlope > 0.0001) {
  // Only the direction goes through the matrix, so the model's scale cannot change the relief.
  vec3 surfaceDetailTilt = normalize(normalMatrix * surfaceDetailGradient) * surfaceDetailSlope;
  surfaceDetailTilt -= normal * dot(surfaceDetailTilt, normal);
  normal = normalize(normal - surfaceDetailTilt * uSurfaceDetail.z);
}
`;

/**
 * Layers procedural micro-relief on a lit material: bumps, roughness breakup
 * and darker hollows, sampled from model space so no UVs or texture files are
 * needed. Keeps any shader hook already installed and is idempotent.
 */
export function installSurfaceDetail(material: THREE.MeshStandardMaterial, profile: SurfaceDetailProfile): void {
  if (material.userData.surfaceDetail) return;
  material.userData.surfaceDetail = true;
  const uniforms = {
    uSurfaceDetailNoise: { value: getDetailNoiseTexture() },
    uSurfaceDetail: { value: new THREE.Vector4(1 / profile.fineTile, 1 / profile.coarseTile, profile.bump, profile.roughness) },
    uSurfaceDetailCavity: { value: profile.cavity },
  };

  // Read now: the default key is the source of the current hook, which is about to be wrapped.
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${previousKey}|${CACHE_KEY}`;
  const previousCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_SURFACE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`);
  };
  material.needsUpdate = true;
}

/**
 * Details every lit material under `root`. Unlit materials (glows, sights,
 * sprites) are left alone. Call it after any other hook that replaces
 * `onBeforeCompile` outright.
 */
export function applySurfaceDetail(root: THREE.Object3D, profile: SurfaceDetailProfile): void {
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
      if (entry instanceof THREE.MeshStandardMaterial) installSurfaceDetail(entry, profile);
    }
  });
}
