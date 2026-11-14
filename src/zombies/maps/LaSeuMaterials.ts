import * as THREE from 'three';
import { makeBloodDecalTexture } from './shared/BloodDecalTexture';
import { seededRandom, tileableNoise } from './shared/ProceduralNoise';
import { bake, decalMaterial, hash2, surfaceMaterial, type Painter, type Rgb } from './shared/ProceduralSurface';
import { COOL_GLASS, makeLancetGlass, makeRoseGlass, makeShaftTexture, WARM_GLASS } from './laSeu/StainedGlass';

/**
 * Surfaces of La Seu: the golden Santanyi limestone of Palma in ashlar
 * courses, worn floor slabs, dark pew oak, wrought iron and gilding, and the
 * glass that lights it. Every texture is baked in code (no assets) and
 * cached per process; materials are created per arena.
 */
export interface LaSeuMaterials {
  /** Ashlar of the walls, inside and out. */
  readonly wallStone: THREE.MeshStandardMaterial;
  /** Finer, paler ashlar of the shafts, ribs and carved trim. */
  readonly dressedStone: THREE.MeshStandardMaterial;
  /** Webs of the vaults between the ribs. */
  readonly vaultStone: THREE.MeshStandardMaterial;
  /** Rough masonry of the entrance passages and service spaces. */
  readonly roughStone: THREE.MeshStandardMaterial;
  readonly floorStone: THREE.MeshStandardMaterial;
  readonly plazaPaving: THREE.MeshStandardMaterial;
  readonly darkWood: THREE.MeshStandardMaterial;
  readonly iron: THREE.MeshStandardMaterial;
  readonly gilt: THREE.MeshStandardMaterial;
  readonly wax: THREE.MeshStandardMaterial;
  readonly redCloth: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  /** Unlit glow of flames and lantern panes. */
  readonly flame: THREE.MeshBasicMaterial;
  /** Lancets of the east wall and the chancel, warm; of the west wall, cool. */
  readonly glassWarm: THREE.MeshBasicMaterial;
  readonly glassCool: THREE.MeshBasicMaterial;
  readonly glassRose: THREE.MeshBasicMaterial;
  /** Coloured light the glass throws on floors and walls (additive). */
  readonly poolWarm: THREE.MeshBasicMaterial;
  readonly poolCool: THREE.MeshBasicMaterial;
  readonly poolRose: THREE.MeshBasicMaterial;
  /** Moonbeams through the east lancets (additive). */
  readonly lightShaft: THREE.MeshBasicMaterial;
  readonly bloodSplatter: THREE.MeshStandardMaterial;
  readonly bloodSmear: THREE.MeshStandardMaterial;
  /** Invisible proxy for collision-only volumes (never drawn). */
  readonly collider: THREE.MeshBasicMaterial;
}

/** Ashlar courses with staggered joints, block-to-block tone shifts and damp streaks. */
function ashlarPainter(size: number, seed: number, base: Rgb, courses: number, blocks: number, polish: number): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const weather = tileableNoise(random, size / 4, size);
    const grain = tileableNoise(random, size / 32, size);
    const streak = tileableNoise(random, size / 8, size);
    const courseHeight = size / courses;
    const blockLength = size / blocks;
    return (x, y, texel) => {
      const course = Math.floor(y / courseHeight);
      const shifted = x + (course % 2) * blockLength / 2 + hash2(course, 0, seed) * blockLength * 0.3;
      const block = Math.floor(shifted / blockLength);
      const joint = y - course * courseHeight < 1.5 || shifted - block * blockLength < 1.5;
      const tone = 0.82 + hash2(block % blocks, course, seed) * 0.26;
      const damp = THREE.MathUtils.smoothstep(streak(x * 3, y * 0.4), 0.55, 0.9) * 0.3;
      const shade = tone * (0.86 + weather(x, y) * 0.22 + grain(x, y) * 0.1) * (1 - damp) * (joint ? 0.5 : 1);
      texel.color[0] = base[0] * shade;
      texel.color[1] = base[1] * shade;
      texel.color[2] = base[2] * shade * (1 - damp * 0.2);
      texel.height = joint ? 0.15 : 0.55 + grain(x, y) * 0.12;
      texel.roughness = joint ? 0.98 : polish + grain(x, y) * 0.12 + damp * 0.2;
    };
  };
}

/** Square slabs in two close tones, worn smooth and pale where feet have passed for centuries. */
function slabPainter(size: number, seed: number, base: Rgb, alternate: Rgb, tiles: number, polish: number): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const wear = tileableNoise(random, size / 2, size);
    const dirt = tileableNoise(random, size / 8, size);
    const grain = tileableNoise(random, size / 32, size);
    const tileSize = size / tiles;
    return (x, y, texel) => {
      const tileX = Math.floor(x / tileSize);
      const tileY = Math.floor(y / tileSize);
      const joint = x - tileX * tileSize < 1.2 || y - tileY * tileSize < 1.2;
      const stone = (tileX + tileY) % 2 === 0 ? base : alternate;
      const worn = THREE.MathUtils.smoothstep(wear(x, y), 0.4, 0.85);
      const shade = (0.8 + hash2(tileX, tileY, seed) * 0.22 + grain(x, y) * 0.1) * (1 - dirt(x, y) * 0.28) * (joint ? 0.45 : 1) + worn * 0.08;
      texel.color[0] = stone[0] * shade;
      texel.color[1] = stone[1] * shade;
      texel.color[2] = stone[2] * shade;
      texel.height = joint ? 0.1 : 0.55 + grain(x, y) * 0.08;
      texel.roughness = joint ? 0.98 : polish - worn * 0.22 + dirt(x, y) * 0.2;
    };
  };
}

/** Limewashed webs: no joints, only blotches of damp and soot. */
function plasterPainter(size: number, seed: number, base: Rgb): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const blotch = tileableNoise(random, size / 4, size);
    const fine = tileableNoise(random, size / 32, size);
    return (x, y, texel) => {
      const soot = THREE.MathUtils.smoothstep(blotch(x, y), 0.5, 0.95) * 0.35;
      const shade = (0.84 + fine(x, y) * 0.16 + blotch(y, x) * 0.12) * (1 - soot);
      texel.color[0] = base[0] * shade;
      texel.color[1] = base[1] * shade;
      texel.color[2] = base[2] * shade;
      texel.height = 0.5 + fine(x, y) * 0.1;
      texel.roughness = 0.9;
    };
  };
}

/** Dark oak boards, grain running along U, polished by hands on the high spots. */
function woodPainter(size: number, seed: number, base: Rgb): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const grain = tileableNoise(random, size / 16, size);
    const figure = tileableNoise(random, size / 4, size);
    const boards = 4;
    const boardHeight = size / boards;
    return (x, y, texel) => {
      const board = Math.floor(y / boardHeight);
      const gap = y - board * boardHeight < 1.2;
      const line = grain(x * 0.12 + board * 31, y * 2.4);
      const shade = (0.7 + line * 0.4 + figure(x, y) * 0.14) * (0.9 + hash2(board, 0, seed) * 0.2) * (gap ? 0.4 : 1);
      texel.color[0] = base[0] * shade;
      texel.color[1] = base[1] * shade;
      texel.color[2] = base[2] * shade;
      texel.height = gap ? 0.1 : 0.5 + line * 0.14;
      texel.roughness = gap ? 0.95 : 0.5 + line * 0.25;
    };
  };
}

/** Self-lit stained glass: night dims it, the moon behind still carries its colour. */
function glassMaterial(name: string, map: THREE.Texture, cutout: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ name, map, color: 0xb9b9b9, alphaTest: cutout ? 0.5 : 0 });
}

/** Glass colour thrown onto a surface. */
function poolMaterial(name: string, map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, alphaTest: 0.02,
  });
}

export function createLaSeuMaterials(anisotropy: number): LaSeuMaterials {
  const sandstone: Rgb = [176, 150, 108];
  const paleStone: Rgb = [190, 170, 132];
  const warmGlass = makeLancetGlass(WARM_GLASS, 6101);
  const coolGlass = makeLancetGlass(COOL_GLASS, 6102);
  const roseGlass = makeRoseGlass(6103);
  return {
    wallStone: surfaceMaterial('laseu_wall_stone', bake('laseu-wall-stone', 256, 2.2, ashlarPainter(256, 6001, sandstone, 6, 3, 0.86)), anisotropy, 3),
    dressedStone: surfaceMaterial('laseu_dressed_stone', bake('laseu-dressed-stone', 256, 1.4, ashlarPainter(256, 6002, paleStone, 4, 2, 0.74)), anisotropy, 2.4),
    vaultStone: surfaceMaterial('laseu_vault_stone', bake('laseu-vault-stone', 128, 0.8, plasterPainter(128, 6003, [150, 136, 112])), anisotropy, 5),
    roughStone: surfaceMaterial('laseu_rough_stone', bake('laseu-rough-stone', 128, 3, ashlarPainter(128, 6004, [104, 92, 74], 5, 3, 0.95)), anisotropy, 2),
    floorStone: surfaceMaterial('laseu_floor_stone', bake('laseu-floor-stone', 256, 1.6, slabPainter(256, 6005, [128, 118, 102], [96, 90, 82], 4, 0.62)), anisotropy, 3.2),
    plazaPaving: surfaceMaterial('laseu_plaza_paving', bake('laseu-plaza-paving', 256, 2.4, slabPainter(256, 6006, [124, 112, 94], [112, 102, 86], 8, 0.88)), anisotropy, 4),
    darkWood: surfaceMaterial('laseu_dark_wood', bake('laseu-dark-wood', 128, 1.6, woodPainter(128, 6007, [84, 54, 32])), anisotropy, 1.6),
    iron: new THREE.MeshStandardMaterial({ name: 'laseu_iron', color: 0x1b1a1c, roughness: 0.62, metalness: 0.75 }),
    gilt: new THREE.MeshStandardMaterial({ name: 'laseu_gilt', color: 0xb98c3a, roughness: 0.4, metalness: 0.85 }),
    wax: new THREE.MeshStandardMaterial({ name: 'laseu_wax', color: 0xd9cdae, roughness: 0.7, emissive: 0x3a2812, emissiveIntensity: 0.6 }),
    redCloth: new THREE.MeshStandardMaterial({ name: 'laseu_red_cloth', color: 0x6a1418, roughness: 0.92, side: THREE.DoubleSide }),
    foliage: new THREE.MeshStandardMaterial({ name: 'laseu_foliage', color: 0x243a22, roughness: 0.9, side: THREE.DoubleSide }),
    flame: new THREE.MeshBasicMaterial({ name: 'laseu_flame', color: 0xffd9a0 }),
    glassWarm: glassMaterial('laseu_glass_warm', warmGlass, false),
    glassCool: glassMaterial('laseu_glass_cool', coolGlass, false),
    glassRose: glassMaterial('laseu_glass_rose', roseGlass, true),
    poolWarm: poolMaterial('laseu_pool_warm', warmGlass, 0.22),
    poolCool: poolMaterial('laseu_pool_cool', coolGlass, 0.18),
    poolRose: poolMaterial('laseu_pool_rose', roseGlass, 0.3),
    lightShaft: new THREE.MeshBasicMaterial({
      name: 'laseu_light_shaft', map: makeShaftTexture(), color: 0x8fa8e6, transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
    bloodSplatter: decalMaterial('laseu_blood_splatter', makeBloodDecalTexture('splatter', 6201), 0.35),
    bloodSmear: decalMaterial('laseu_blood_smear', makeBloodDecalTexture('smear', 6202), 0.4),
    collider: new THREE.MeshBasicMaterial({ name: 'laseu_collider', visible: false }),
  };
}
