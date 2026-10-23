import * as THREE from 'three';
import { addHeightGrime } from './burnedMansion/HeightGrime';
import {
  barkPainter,
  bunkerPaintPainter,
  ceilingPainter,
  charredWoodPainter,
  deadLawnPainter,
  formedConcretePainter,
  gravestonePainter,
  parquetPainter,
  portraitPainter,
  rustySteelPainter,
  slabConcretePainter,
  treadPlatePainter,
  trimPainter,
  wainscotPainter,
  wallpaperPainter,
  weatheredPlankPainter,
} from './burnedMansion/MansionPainters';
import { makeBloodDecalTexture } from './shared/BloodDecalTexture';
import { seededRandom, valueNoise } from './shared/ProceduralNoise';
import { bake, decalMaterial, decalTexture, surfaceMaterial, type Painter } from './shared/ProceduralSurface';

/**
 * Surfaces of Burned Mansion: a Victorian house gutted by fire (oxblood
 * damask, walnut wainscot, oak parquet, checked char that still smoulders)
 * above a civil-defence bunker of board-formed concrete. Every texture is
 * baked in code and cached per process; materials are created per arena.
 */
export interface MansionSurfaceMaterials {
  /** Ground-floor walls; smoke darkens them towards the ceiling. */
  readonly wallpaper: THREE.MeshStandardMaterial;
  /** Bunker and secret-room walls; damp darkens them towards the floor. */
  readonly bunkerConcrete: THREE.MeshStandardMaterial;
  readonly ceilingBurned: THREE.MeshStandardMaterial;
  readonly bunkerCeiling: THREE.MeshStandardMaterial;
  readonly parquet: THREE.MeshStandardMaterial;
  readonly bunkerFloor: THREE.MeshStandardMaterial;
  /** Stairwell walls, joists and the cabinet; its emissive map holds the embers. */
  readonly charredWood: THREE.MeshStandardMaterial;
  readonly wainscot: THREE.MeshStandardMaterial;
  readonly trimWood: THREE.MeshStandardMaterial;
  /** Boards nailed over the paid doorways (PointDoorView skin). */
  readonly doorPlanks: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly treadPlate: THREE.MeshStandardMaterial;
  readonly bunkerPaint: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
  readonly gilt: THREE.MeshStandardMaterial;
  readonly shadeGlass: THREE.MeshStandardMaterial;
  /** Enamel lamp shades of the bunker, open underneath. */
  readonly enamelShade: THREE.MeshStandardMaterial;
  readonly windowGlass: THREE.MeshStandardMaterial;
  readonly mirrorGlass: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly rubble: THREE.MeshStandardMaterial;
  readonly ash: THREE.MeshStandardMaterial;
  readonly paper: THREE.MeshStandardMaterial;
  readonly wroughtIron: THREE.MeshStandardMaterial;
  readonly portraits: readonly THREE.MeshStandardMaterial[];
  readonly lawn: THREE.MeshStandardMaterial;
  readonly bark: THREE.MeshStandardMaterial;
  readonly gravestone: THREE.MeshStandardMaterial;
  readonly sootSoft: THREE.MeshStandardMaterial;
  readonly sootHeavy: THREE.MeshStandardMaterial;
  readonly bloodSplatter: THREE.MeshStandardMaterial;
  readonly bloodSmear: THREE.MeshStandardMaterial;
  readonly damp: THREE.MeshStandardMaterial;
  readonly crack: THREE.MeshStandardMaterial;
  readonly floorScorch: THREE.MeshStandardMaterial;
  readonly ashDrift: THREE.MeshStandardMaterial;
}

/** Ember glow of the charred wood at full smoulder; the atmosphere breathes it. */
export const CHAR_EMBER_COLOR = 0xff5a1e;
export const CHAR_EMBER_INTENSITY = 1.6;

function makeWallDecalTexture(kind: 'soot' | 'damp' | 'crack', seed: number): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const index = (y * size + x) * 4;
      const hash = ((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0;
      const noise = (hash % 997) / 996;
      let alpha = 0;
      let color: readonly [number, number, number] = [24, 20, 18];

      if (kind === 'soot') {
        const plume = Math.max(0, 1 - Math.hypot((u - 0.5) / 0.48, (v - 0.36) / 0.65));
        const streaks = 0.55 + Math.sin(u * 37 + seed) * 0.18;
        alpha = plume * streaks * (0.55 + noise * 0.45);
      } else if (kind === 'damp') {
        const patch = Math.max(0, 1 - Math.hypot((u - 0.48) / 0.53, (v - 0.55) / 0.48));
        alpha = patch * (0.28 + noise * 0.42);
        color = [38, 47, 39];
      } else {
        const branch = Math.abs(u - 0.5 - Math.sin(v * 20 + seed) * (0.025 + v * 0.035));
        const offshoot = Math.abs(u - 0.43 - v * 0.2);
        alpha = branch < 0.012 || (v > 0.42 && offshoot < 0.008) ? 0.9 : 0;
        color = [22, 20, 18];
      }
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  return decalTexture(data, size);
}

/** Irregular floor blot: a black burn mark (`scorch`) or a soft drift of grey ash. */
function makeFloorBlotTexture(kind: 'scorch' | 'ash', seed: number): THREE.DataTexture {
  const size = 128;
  const random = seededRandom(seed);
  const edge = valueNoise(random, 16, size);
  const fine = valueNoise(random, 4, size);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const body = THREE.MathUtils.smoothstep(1 - distance + (edge(x, y) - 0.5) * 0.6, 0.15, kind === 'scorch' ? 0.55 : 0.8);
      const offset = (y * size + x) * 4;
      const grain = 0.75 + fine(x, y) * 0.5;
      data[offset] = kind === 'scorch' ? 12 : Math.round(96 * grain);
      data[offset + 1] = kind === 'scorch' ? 10 : Math.round(92 * grain);
      data[offset + 2] = kind === 'scorch' ? 9 : Math.round(86 * grain);
      data[offset + 3] = Math.round(THREE.MathUtils.clamp(body * (kind === 'scorch' ? 235 : 170) * grain, 0, 255));
    }
  }
  return decalTexture(data, size);
}

/** Wall decals hang on planes rotated in place, so both faces must render. */
function wallDecal(name: string, map: THREE.Texture, alphaTest = 0.03, roughness = 1): THREE.MeshStandardMaterial {
  return decalMaterial(name, map, roughness, { alphaTest, side: THREE.DoubleSide });
}

export function createMansionSurfaceMaterials(anisotropyLimit: number): MansionSurfaceMaterials {
  const anisotropy = Math.min(anisotropyLimit, 8);
  const surface = (
    name: string,
    key: string,
    size: number,
    normalStrength: number,
    painter: (size: number) => () => Painter,
    metersPerTile: number,
    parameters: THREE.MeshStandardMaterialParameters = {},
  ): THREE.MeshStandardMaterial => surfaceMaterial(name, bake(key, size, normalStrength, painter(size)), anisotropy, metersPerTile, parameters);

  const wallpaper = surface('burned_wallpaper', 'mansion-wallpaper', 512, 2.5, wallpaperPainter, 1.8);
  addHeightGrime(wallpaper, { fromY: 1.2, toY: 3.2, darkness: 0.62 });
  const bunkerConcrete = surface('bunker_concrete', 'mansion-formed-concrete', 256, 3, formedConcretePainter, 1.6);
  addHeightGrime(bunkerConcrete, { fromY: -2.5, toY: -3.4, darkness: 0.42 });
  const slab = bake('mansion-slab-concrete', 256, 2.5, slabConcretePainter(256));

  return {
    wallpaper,
    bunkerConcrete,
    ceilingBurned: surface('blackened_plaster_ceiling', 'mansion-ceiling', 256, 3, ceilingPainter, 1.6),
    bunkerCeiling: surfaceMaterial('bunker_ceiling_concrete', slab, anisotropy, 2.4, { color: 0xa6a69e }),
    parquet: surface('charred_parquet', 'mansion-parquet', 512, 3, parquetPainter, 2.4),
    bunkerFloor: surfaceMaterial('bunker_floor_concrete', slab, anisotropy, 2.4),
    charredWood: surface('charred_wood', 'mansion-char', 256, 4, charredWoodPainter, 0.6, {
      emissive: CHAR_EMBER_COLOR,
      emissiveIntensity: CHAR_EMBER_INTENSITY,
    }),
    wainscot: surface('burned_wainscot', 'mansion-wainscot', 256, 4, wainscotPainter, 0.9),
    trimWood: surface('scorched_trim', 'mansion-trim', 128, 2, trimPainter, 0.6),
    doorPlanks: surface('weathered_planks', 'mansion-planks', 256, 3, weatheredPlankPainter, 1.25),
    metal: surface('oxidized_metal', 'mansion-rusty-steel', 128, 2, rustySteelPainter, 0.6, { metalness: 0.55 }),
    treadPlate: surface('stair_tread_plate', 'mansion-tread-plate', 128, 4, treadPlatePainter, 0.3, { metalness: 0.7 }),
    bunkerPaint: surface('bunker_paint', 'mansion-bunker-paint', 128, 2, bunkerPaintPainter, 0.8, { metalness: 0.1 }),
    brass: new THREE.MeshStandardMaterial({ name: 'tarnished_brass', color: 0x6b5330, roughness: 0.45, metalness: 0.85 }),
    gilt: new THREE.MeshStandardMaterial({ name: 'sooty_gilt', color: 0x5c4524, roughness: 0.5, metalness: 0.75 }),
    shadeGlass: new THREE.MeshStandardMaterial({
      name: 'frosted_shade',
      color: 0x8c6a5a,
      emissive: 0x3c0904,
      roughness: 0.35,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    enamelShade: new THREE.MeshStandardMaterial({
      name: 'enamel_shade',
      color: 0x3e4a36,
      roughness: 0.5,
      metalness: 0.3,
      side: THREE.DoubleSide,
    }),
    mirrorGlass: new THREE.MeshStandardMaterial({ name: 'tarnished_mirror', color: 0x30363a, roughness: 0.12, metalness: 0.92 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'gas_mask_rubber', color: 0x161616, roughness: 0.72 }),
    windowGlass: new THREE.MeshStandardMaterial({
      name: 'broken_window_glass',
      color: 0x1b2326,
      roughness: 0.08,
      metalness: 0.4,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    }),
    rubble: new THREE.MeshStandardMaterial({ name: 'fallen_plaster', color: 0x5a534c, roughness: 0.96 }),
    ash: new THREE.MeshStandardMaterial({ name: 'ash_heap', color: 0x2e2b28, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ name: 'burnt_paper', color: 0x6a5c4c, roughness: 0.95, side: THREE.DoubleSide }),
    wroughtIron: new THREE.MeshStandardMaterial({ name: 'wrought_iron', color: 0x18181b, roughness: 0.6, metalness: 0.6 }),
    portraits: [5231, 5237].map((seed, index) => surfaceMaterial(
      `ruined_portrait_${index}`,
      bake(`mansion-portrait-${seed}`, 128, 2, portraitPainter(128, seed)),
      anisotropy,
      1,
    )),
    lawn: surface('dead_lawn', 'mansion-lawn', 256, 2, deadLawnPainter, 3),
    bark: surface('dead_bark', 'mansion-bark', 128, 4, barkPainter, 0.8),
    gravestone: surface('weathered_stone', 'mansion-gravestone', 128, 2, gravestonePainter, 0.8),
    sootSoft: wallDecal('soot_soft', makeWallDecalTexture('soot', 17)),
    sootHeavy: wallDecal('soot_heavy', makeWallDecalTexture('soot', 83)),
    // Dried blood keeps a faint sheen over the matte plaster.
    bloodSplatter: wallDecal('blood_splatter', makeBloodDecalTexture('splatter', 41), 0.03, 0.62),
    bloodSmear: wallDecal('blood_smear', makeBloodDecalTexture('smear', 53), 0.03, 0.62),
    damp: wallDecal('damp_stain', makeWallDecalTexture('damp', 67)),
    crack: wallDecal('plaster_crack', makeWallDecalTexture('crack', 29), 0.35),
    floorScorch: decalMaterial('floor_scorch', makeFloorBlotTexture('scorch', 5243), 0.95),
    ashDrift: decalMaterial('ash_drift', makeFloorBlotTexture('ash', 5249), 1),
  };
}
