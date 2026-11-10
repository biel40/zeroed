import * as THREE from 'three';

const TEXTURE_SIZE = 128;
/** sRGB bytes: the punched hole, the wet torn rim, the blood that runs from it. */
const HOLE = [16, 2, 2] as const;
const RIM = [128, 12, 9] as const;
const BLOOD = [104, 7, 5] as const;
/** Hole centre in texture space (0..1, v up): high on the decal so the run has room below. */
const CENTER_U = 0.5;
const CENTER_V = 0.64;
/** Radii in texture units (decal half-size = 0.5). */
const HOLE_RADIUS = 0.07;
const RIM_RADIUS = 0.15;
const SPLASH_RADIUS = 0.22;

let geometry: THREE.PlaneGeometry | null = null;
let material: THREE.MeshStandardMaterial | null = null;

/** Deterministic lumpy edge: the hole is never a perfect disc. */
function edgeWobble(angle: number): number {
  return 1 + 0.14 * Math.sin(angle * 3 + 0.7) + 0.08 * Math.sin(angle * 7 + 2.1) + 0.05 * Math.sin(angle * 13);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Coverage of the blood runs below the hole: two uneven trickles that thin and end. */
function runCoverage(u: number, v: number): number {
  if (v > CENTER_V) return 0;
  const drop = CENTER_V - v;
  let coverage = 0;
  for (const [offset, length, width] of [[-0.035, 0.5, 0.032], [0.04, 0.32, 0.024]] as const) {
    const along = drop / length;
    if (along > 1) continue;
    const centre = CENTER_U + offset + 0.012 * Math.sin(drop * 40 + offset * 90);
    const halfWidth = width * (1 - 0.6 * along);
    const across = 1 - smoothstep(halfWidth * 0.55, halfWidth, Math.abs(u - centre));
    // A rounded bead where each run stops.
    const tip = 1 - smoothstep(0.85, 1, along);
    coverage = Math.max(coverage, across * tip);
  }
  return coverage;
}

/**
 * Entry wound decal, "up" towards +V: a near-black hole, a wet red torn rim,
 * a spatter halo and blood running down below it. Owners orient the quad so
 * that +V points against gravity at the moment of the hit.
 */
function makeWoundTexture(): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = (x + 0.5) / TEXTURE_SIZE;
      const v = (y + 0.5) / TEXTURE_SIZE;
      const du = u - CENTER_U;
      const dv = v - CENTER_V;
      const radius = Math.hypot(du, dv) / edgeWobble(Math.atan2(dv, du));
      const hole = 1 - smoothstep(HOLE_RADIUS * 0.7, HOLE_RADIUS, radius);
      const rim = 1 - smoothstep(RIM_RADIUS * 0.6, RIM_RADIUS, radius);
      const splash = (1 - smoothstep(RIM_RADIUS, SPLASH_RADIUS, radius)) * 0.55;
      const run = runCoverage(u, v);
      const blood = Math.max(rim, run * 0.95, splash);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const wet = BLOOD[channel] + (RIM[channel] - BLOOD[channel]) * rim;
        data[offset + channel] = Math.round(wet + (HOLE[channel] - wet) * hole);
      }
      data[offset + 3] = Math.round(255 * Math.min(1, blood + hole));
    }
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Unit quad facing +Z, texture +V along +Y; each wound instance scales and orients it. Shared by every zombie. */
export function woundGeometry(): THREE.PlaneGeometry {
  return (geometry ??= new THREE.PlaneGeometry(1, 1));
}

/**
 * One material for every wound in the run. It sits just over the skin
 * (polygon offset, no depth writes) so it never fights the body's depth.
 * A faint emissive keeps the wet red readable on dark maps without glowing.
 */
export function woundMaterial(): THREE.MeshStandardMaterial {
  return (material ??= new THREE.MeshStandardMaterial({
    map: makeWoundTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: 0.25,
    metalness: 0,
    emissive: new THREE.Color(0x3a0503),
    emissiveIntensity: 0.6,
  }));
}
