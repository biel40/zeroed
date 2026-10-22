import * as THREE from 'three';
import { makeBloodDecalTexture } from './shared/BloodDecalTexture';
import { seededRandom, valueNoise } from './shared/ProceduralNoise';

/**
 * Surfaces of Station 33: cold Soviet-era marble, chequered granite, stained
 * vault plaster and military-green steel. Every texture is baked in code
 * (no assets) and cached per process; materials are created per arena and
 * never shared with view models.
 */
export interface Station33Materials {
  readonly wallMarble: THREE.MeshStandardMaterial;
  readonly columnMarble: THREE.MeshStandardMaterial;
  readonly darkGranite: THREE.MeshStandardMaterial;
  readonly floorGranite: THREE.MeshStandardMaterial;
  readonly vaultPlaster: THREE.MeshStandardMaterial;
  readonly stucco: THREE.MeshStandardMaterial;
  readonly serviceConcrete: THREE.MeshStandardMaterial;
  /** Glazed service tiles of the luggage office, crazed and stained. */
  readonly tiledWall: THREE.MeshStandardMaterial;
  readonly paintedSteel: THREE.MeshStandardMaterial;
  readonly greySteel: THREE.MeshStandardMaterial;
  readonly bronze: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly varnishedWood: THREE.MeshStandardMaterial;
  readonly windowGlass: THREE.MeshStandardMaterial;
  readonly rubble: THREE.MeshStandardMaterial;
  readonly luggage: readonly THREE.MeshStandardMaterial[];
  readonly paper: THREE.MeshStandardMaterial;
  /** Steel slats bolted over the zombie entrances (WindowBarrierView skin). */
  readonly barrierSlat: THREE.MeshStandardMaterial;
  readonly bloodSplatter: THREE.MeshStandardMaterial;
  readonly bloodSmear: THREE.MeshStandardMaterial;
  readonly waterStreak: THREE.MeshStandardMaterial;
  readonly floorGrime: THREE.MeshStandardMaterial;
  readonly puddle: THREE.MeshStandardMaterial;
  /** Invisible proxy for collision-only volumes (never drawn). */
  readonly collider: THREE.MeshBasicMaterial;
}

type Rgb = [number, number, number];

/** One texel being painted: colour 0..255, height and roughness 0..1. */
interface Texel {
  color: Rgb;
  height: number;
  roughness: number;
}

interface BakedSurface {
  readonly size: number;
  readonly color: Uint8Array;
  readonly normal: Uint8Array;
  readonly roughness: Uint8Array;
}

type Painter = (x: number, y: number, texel: Texel) => void;

const bakeCache = new Map<string, BakedSurface>();

/** Bakes colour, a height-derived normal map and roughness once per key. */
function bake(key: string, size: number, normalStrength: number, makePainter: () => Painter): BakedSurface {
  const cached = bakeCache.get(key);
  if (cached) return cached;
  const paint = makePainter();
  const color = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const texel: Texel = { color: [0, 0, 0], height: 0, roughness: 1 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      texel.height = 0.5;
      texel.roughness = 0.8;
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
  const baked = { size, color, normal, roughness };
  bakeCache.set(key, baked);
  return baked;
}

function dataTexture(data: Uint8Array, size: number, colorSpace: THREE.ColorSpace, anisotropy: number): THREE.DataTexture {
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

function surfaceMaterial(
  name: string,
  surface: BakedSurface,
  anisotropy: number,
  metersPerTile: number,
  parameters: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name,
    map: dataTexture(surface.color, surface.size, THREE.SRGBColorSpace, anisotropy),
    normalMap: dataTexture(surface.normal, surface.size, THREE.NoColorSpace, anisotropy),
    roughnessMap: dataTexture(surface.roughness, surface.size, THREE.NoColorSpace, anisotropy),
    roughness: 1,
    metalness: 0,
    ...parameters,
  });
  material.userData.metersPerTile = metersPerTile;
  return material;
}

function mix(a: Rgb, b: Rgb, t: number, out: Rgb): Rgb {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Polished slabs with drifting veins, hairline joints and a film of grime. */
function marblePainter(size: number, seed: number, base: Rgb, vein: Rgb, veinScale: number): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const broad = valueNoise(random, size / 4, size);
    const medium = valueNoise(random, size / 10, size);
    const fine = valueNoise(random, size / 28, size);
    const grime = valueNoise(random, size / 3, size);
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const turbulence = broad(x, y) * 0.55 + medium(x, y) * 0.3 + fine(x, y) * 0.15;
      const veinLine = Math.pow(1 - Math.abs(Math.sin((x * 0.9 + y * 0.35) / size * Math.PI * 2 * veinScale + turbulence * 7)), 36);
      const joint = x < 2 || y < 2;
      const dirt = THREE.MathUtils.smoothstep(grime(x, y), 0.45, 0.95) * 0.32;
      mix(base, vein, veinLine * 0.75, tinted);
      const shade = (0.9 + medium(x, y) * 0.16) * (1 - dirt) * (joint ? 0.55 : 1);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade * 0.98;
      texel.height = joint ? 0 : 0.6 - veinLine * 0.04;
      texel.roughness = joint ? 0.95 : 0.32 + dirt * 1.2 + fine(x, y) * 0.08;
    };
  };
}

/** Chequered grey and red granite slabs, worn pale along the walking lines. */
function floorPainter(size: number, tiles: number): () => Painter {
  return () => {
    const random = seededRandom(3301);
    const wear = valueNoise(random, size / 3, size);
    const dirt = valueNoise(random, size / 9, size);
    const grey: Rgb = [84, 83, 80];
    const red: Rgb = [80, 46, 40];
    const tileSize = size / tiles;
    return (x, y, texel) => {
      const tileX = Math.floor(x / tileSize);
      const tileY = Math.floor(y / tileSize);
      const localX = x - tileX * tileSize;
      const localY = y - tileY * tileSize;
      const grout = localX < 2 || localY < 2;
      const base = (tileX + tileY) % 2 === 0 ? grey : red;
      const fleck = hash2(x, y, 11);
      const speck = fleck > 0.93 ? 1.35 : fleck < 0.08 ? 0.55 : 0.92 + fleck * 0.14;
      const tileTone = 0.9 + hash2(tileX, tileY, 5) * 0.18;
      const worn = THREE.MathUtils.smoothstep(wear(x, y), 0.55, 0.95) * 0.12;
      const grime = THREE.MathUtils.smoothstep(dirt(x, y), 0.5, 0.9) * 0.35;
      const shade = grout ? 0.32 : speck * tileTone * (1 + worn) * (1 - grime);
      texel.color[0] = base[0] * shade;
      texel.color[1] = base[1] * shade;
      texel.color[2] = base[2] * shade;
      texel.height = grout ? 0 : 0.7;
      texel.roughness = grout ? 0.95 : 0.42 + worn * 1.2 + grime * 0.9;
    };
  };
}

/** Off-white vault plaster with tide marks from seepage and a few hairline cracks. */
function plasterPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3307);
    const mottle = valueNoise(random, size / 12, size);
    const seep = valueNoise(random, size / 4, size);
    const crack = valueNoise(random, size / 6, size);
    const base: Rgb = [128, 124, 110];
    const stain: Rgb = [96, 84, 64];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const seepage = seep(x, y);
      // Occasional seepage stains, each ringed by a thin tide line.
      const stained = THREE.MathUtils.smoothstep(seepage, 0.68, 0.9) * 0.45;
      const tideLine = Math.max(0, 1 - Math.abs(seepage - 0.68) / 0.012) * 0.3;
      const crackLine = seepage > 0.6 && Math.abs(crack(x, y) - 0.5) < 0.005 ? 1 : 0;
      mix(base, stain, stained + tideLine, tinted);
      const shade = (0.9 + mottle(x, y) * 0.12) * (1 - crackLine * 0.55);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.5 + mottle(x, y) * 0.25 - crackLine * 0.5;
      texel.roughness = 0.92;
    };
  };
}

/** Poured concrete of the service passages, damp and streaked. */
function concretePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3313);
    const broad = valueNoise(random, size / 5, size);
    const fine = valueNoise(random, size / 30, size);
    return (x, y, texel) => {
      const pores = hash2(x, y, 23) > 0.97 ? 0.6 : 1;
      const streak = 0.85 + Math.sin(x * 0.21 + broad(x, y) * 6) * 0.06;
      const shade = (0.7 + broad(x, y) * 0.35 + fine(x, y) * 0.12) * pores * streak;
      // Dark on purpose: the hall lights reach through walls, the passages must still read as unlit.
      texel.color[0] = 34 * shade;
      texel.color[1] = 36 * shade;
      texel.color[2] = 34 * shade;
      texel.height = 0.4 + fine(x, y) * 0.5 * pores;
      texel.roughness = 0.96;
    };
  };
}

/** Pale green glazed tiles with dark grout, crazed and yellowed by seepage from above. */
function tilePainter(size: number, tiles: number): () => Painter {
  return () => {
    const random = seededRandom(3323);
    const stain = valueNoise(random, size / 3, size);
    const fine = valueNoise(random, size / 24, size);
    const glaze: Rgb = [128, 140, 126];
    const yellowed: Rgb = [112, 104, 78];
    const tinted: Rgb = [0, 0, 0];
    const tileSize = size / tiles;
    return (x, y, texel) => {
      const tileX = Math.floor(x / tileSize);
      const tileY = Math.floor(y / tileSize);
      const grout = x - tileX * tileSize < 2 || y - tileY * tileSize < 2;
      const chipped = hash2(tileX, tileY, 29) > 0.94;
      const seep = THREE.MathUtils.smoothstep(stain(x, y) + (1 - y / size) * 0.25, 0.55, 0.95);
      mix(glaze, yellowed, seep * 0.8, tinted);
      const shade = grout ? 0.3 : (0.88 + hash2(tileX, tileY, 31) * 0.14 + fine(x, y) * 0.06) * (chipped ? 0.55 : 1);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = grout ? 0.1 : chipped ? 0.4 : 0.7;
      texel.roughness = grout || chipped ? 0.95 : 0.22 + seep * 0.5;
    };
  };
}

/** Military green enamel, chipped down to rusty steel at the edges of the chips. */
function paintedSteelPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3319);
    const chips = valueNoise(random, size / 7, size);
    const fine = valueNoise(random, size / 26, size);
    const paint: Rgb = [58, 74, 54];
    const rust: Rgb = [92, 52, 30];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const chip = THREE.MathUtils.smoothstep(chips(x, y) + fine(x, y) * 0.2, 0.74, 0.8);
      mix(paint, rust, chip, tinted);
      const shade = 0.88 + fine(x, y) * 0.2;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.6 - chip * 0.3;
      texel.roughness = 0.55 + chip * 0.4;
    };
  };
}

/** Vertical seepage streaks running down from the cornice. */
function makeStreakTexture(seed: number): THREE.DataTexture {
  const size = 128;
  const random = seededRandom(seed);
  const wobble = valueNoise(random, 16, size);
  const data = new Uint8Array(size * size * 4);
  const columns = Array.from({ length: 7 }, () => ({ x: 10 + random() * 108, width: 2 + random() * 7, length: 0.3 + random() * 0.65 }));
  for (let y = 0; y < size; y++) {
    const fromTop = 1 - y / (size - 1);
    for (let x = 0; x < size; x++) {
      let alpha = 0;
      for (const column of columns) {
        const distance = Math.abs(x - column.x - (wobble(x, y) - 0.5) * 6);
        if (distance > column.width || fromTop > column.length) continue;
        alpha = Math.max(alpha, (1 - distance / column.width) * (1 - fromTop / column.length));
      }
      const offset = (y * size + x) * 4;
      data[offset] = 58;
      data[offset + 1] = 50;
      data[offset + 2] = 36;
      data[offset + 3] = Math.round(alpha * 190);
    }
  }
  return decalTexture(data, size);
}

/** Soft dark blot: floor grime (`wet` false) or a standing puddle. */
function makeBlotTexture(seed: number, wet: boolean): THREE.DataTexture {
  const size = 128;
  const random = seededRandom(seed);
  const edge = valueNoise(random, 18, size);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const coverage = THREE.MathUtils.smoothstep(1 - distance + (edge(x, y) - 0.5) * 0.5, 0.1, wet ? 0.3 : 0.7);
      const offset = (y * size + x) * 4;
      data[offset] = wet ? 18 : 30;
      data[offset + 1] = wet ? 22 : 26;
      data[offset + 2] = wet ? 22 : 20;
      data[offset + 3] = Math.round(coverage * (wet ? 200 : 150));
    }
  }
  return decalTexture(data, size);
}

function decalTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function decalMaterial(name: string, map: THREE.Texture, roughness: number): THREE.MeshStandardMaterial {
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
  });
}

export function createStation33Materials(anisotropyLimit: number): Station33Materials {
  const anisotropy = Math.min(anisotropyLimit, 8);
  const wallMarble = bake('wall-marble', 256, 2, marblePainter(256, 3331, [150, 148, 140], [92, 94, 90], 1.6));
  const columnMarble = bake('column-marble', 256, 2, marblePainter(256, 3337, [118, 92, 80], [168, 150, 136], 1.1));
  const darkGranite = bake('dark-granite', 256, 1.5, marblePainter(256, 3343, [58, 54, 52], [96, 92, 88], 4));
  const paintedSteel = bake('painted-steel', 128, 3, paintedSteelPainter(128));
  return {
    wallMarble: surfaceMaterial('station33_wall_marble', wallMarble, anisotropy, 1.2),
    columnMarble: surfaceMaterial('station33_column_marble', columnMarble, anisotropy, 1.0),
    darkGranite: surfaceMaterial('station33_dark_granite', darkGranite, anisotropy, 0.9),
    floorGranite: surfaceMaterial('station33_floor_granite', bake('floor-granite', 512, 3, floorPainter(512, 4)), anisotropy, 2.4),
    // Seen from below on curved and flat infills alike, so both faces render.
    vaultPlaster: surfaceMaterial('station33_vault_plaster', bake('vault-plaster', 256, 2, plasterPainter(256)), anisotropy, 2.5, { side: THREE.DoubleSide }),
    stucco: new THREE.MeshStandardMaterial({ name: 'station33_stucco', color: 0x9f9786, roughness: 0.9 }),
    serviceConcrete: surfaceMaterial('station33_service_concrete', bake('service-concrete', 256, 3, concretePainter(256)), anisotropy, 1.6),
    tiledWall: surfaceMaterial('station33_tiled_wall', bake('tiled-wall', 256, 2, tilePainter(256, 8)), anisotropy, 1.2),
    paintedSteel: surfaceMaterial('station33_painted_steel', paintedSteel, anisotropy, 0.8, { metalness: 0.45 }),
    greySteel: new THREE.MeshStandardMaterial({ name: 'station33_grey_steel', color: 0x4f5455, roughness: 0.55, metalness: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'station33_bronze', color: 0x6a5232, roughness: 0.45, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'station33_rubber', color: 0x141414, roughness: 0.75 }),
    varnishedWood: new THREE.MeshStandardMaterial({ name: 'station33_varnished_wood', color: 0x4c301c, roughness: 0.6 }),
    windowGlass: new THREE.MeshStandardMaterial({ name: 'station33_window_glass', color: 0x0c1312, roughness: 0.12, metalness: 0.3 }),
    rubble: new THREE.MeshStandardMaterial({ name: 'station33_rubble', color: 0x5d5b55, roughness: 0.98 }),
    luggage: [0x4a2e1c, 0x2b3440, 0x5f5236, 0x3a3d32].map((color, index) =>
      new THREE.MeshStandardMaterial({ name: `station33_luggage_${index}`, color, roughness: 0.8 })),
    paper: new THREE.MeshStandardMaterial({ name: 'station33_paper', color: 0xa9a28c, roughness: 0.95, side: THREE.DoubleSide }),
    barrierSlat: surfaceMaterial('station33_barrier_slat', paintedSteel, anisotropy, 0.8, { metalness: 0.45 }),
    bloodSplatter: decalMaterial('station33_blood_splatter', makeBloodDecalTexture('splatter', 331), 0.6),
    bloodSmear: decalMaterial('station33_blood_smear', makeBloodDecalTexture('smear', 337), 0.6),
    waterStreak: decalMaterial('station33_water_streak', makeStreakTexture(341), 0.85),
    floorGrime: decalMaterial('station33_floor_grime', makeBlotTexture(347, false), 0.95),
    puddle: decalMaterial('station33_puddle', makeBlotTexture(353, true), 0.08),
    collider: new THREE.MeshBasicMaterial({ name: 'station33_collider', visible: false }),
  };
}
