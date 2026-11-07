import * as THREE from 'three';
import { bake, bakedTexture, hash2, mix, type Painter, type Rgb } from '../maps/shared/ProceduralSurface';
import { seededRandom, tileableNoise } from '../maps/shared/ProceduralNoise';

/**
 * The materials of CAPITÁN URSS, baked once per process from code: a red
 * knit suit, oxblood and tan leather, cream webbing and boots, gunmetal
 * and polished steel, the zombie's grey-green skin (its veins glow with
 * fury), a grey beard and the shield's chipped red enamel. Textures are
 * created per build and listed for disposal.
 */
export interface CaptainUssrSurfaces {
  readonly suit: THREE.MeshStandardMaterial;
  readonly rag: THREE.MeshStandardMaterial;
  readonly leather: THREE.MeshStandardMaterial;
  readonly tan: THREE.MeshStandardMaterial;
  readonly webbing: THREE.MeshStandardMaterial;
  readonly boot: THREE.MeshStandardMaterial;
  readonly glove: THREE.MeshStandardMaterial;
  readonly sole: THREE.MeshStandardMaterial;
  readonly gunmetal: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  /** The shield's rim: it glints as an attack is about to land. */
  readonly rim: THREE.MeshStandardMaterial;
  readonly skin: THREE.MeshStandardMaterial;
  readonly beard: THREE.MeshStandardMaterial;
  readonly paint: THREE.MeshStandardMaterial;
  readonly wound: THREE.MeshStandardMaterial;
  readonly bone: THREE.MeshStandardMaterial;
  readonly mouth: THREE.MeshStandardMaterial;
  readonly lens: THREE.MeshBasicMaterial;
  readonly halo: THREE.MeshBasicMaterial;
  readonly materials: readonly THREE.Material[];
  readonly textures: readonly THREE.Texture[];
}

const ANISOTROPY = 4;

/** Glow of the skin's veins at full fury. */
const VEIN_GLOW = new THREE.Color(0xff2a12);

export function createCaptainUssrSurfaces(): CaptainUssrSurfaces {
  const textures: THREE.Texture[] = [];
  const baked = (key: string, size: number, normal: number, painter: () => Painter, repeat: number, parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
    const surface = bake(`captain-ussr-${key}`, size, normal, painter);
    const map = bakedTexture(surface.color, size, THREE.SRGBColorSpace, ANISOTROPY);
    const normalMap = bakedTexture(surface.normal, size, THREE.NoColorSpace, ANISOTROPY);
    const roughnessMap = bakedTexture(surface.roughness, size, THREE.NoColorSpace, ANISOTROPY);
    const emissiveMap = surface.emissive ? bakedTexture(surface.emissive, size, THREE.SRGBColorSpace, ANISOTROPY) : null;
    for (const texture of [map, normalMap, roughnessMap, emissiveMap]) {
      if (!texture) continue;
      texture.repeat.set(repeat, repeat);
      textures.push(texture);
    }
    return new THREE.MeshStandardMaterial({ name: `captain-ussr-${key}`, map, normalMap, roughnessMap, emissiveMap, roughness: 1, metalness: 0, ...parameters });
  };
  const plain = (name: string, color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ name: `captain-ussr-${name}`, color, roughness, metalness });

  const suit = baked('suit', 256, 5, knitPainter, 5, {});
  const rag = suit.clone();
  rag.side = THREE.DoubleSide;
  const leather = baked('leather', 128, 4, () => leatherPainter([92, 26, 24], 21), 3, { roughness: 0.9 });
  const tan = baked('tan', 128, 4, () => leatherPainter([156, 118, 80], 22), 2, {});
  const webbing = baked('webbing', 128, 6, webbingPainter, 1, {});
  const boot = baked('boot', 128, 4, () => leatherPainter([206, 196, 170], 23), 2, {});
  const glove = baked('glove', 128, 3, () => leatherPainter([34, 31, 30], 24), 2, { roughness: 0.8 });
  const gunmetal = baked('gunmetal', 128, 2, () => brushedPainter([96, 100, 108], 31), 2, { metalness: 0.88 });
  const steel = baked('steel', 128, 2, () => brushedPainter([182, 184, 188], 32), 2, { metalness: 0.95 });
  const rim = steel.clone();
  rim.emissive.setRGB(0, 0, 0);
  const skin = baked('skin', 128, 3, skinPainter, 2, { emissive: VEIN_GLOW, emissiveIntensity: 0 });
  const beard = baked('beard', 128, 7, beardPainter, 2, {});
  const paint = baked('paint', 256, 3, paintPainter, 1, { metalness: 0.35 });
  const wound = plain('wound', 0x3c1310, 0.45);
  const bone = plain('bone', 0xbcae8e, 0.65);
  const mouth = plain('mouth', 0x140707, 0.9);
  const sole = plain('sole', 0x2a2a2c, 0.95);
  const lens = new THREE.MeshBasicMaterial({ name: 'captain-ussr-lens', color: 0xff2414, toneMapped: false });
  const halo = new THREE.MeshBasicMaterial({
    name: 'captain-ussr-halo', color: 0xff1a0a, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const materials = [suit, rag, leather, tan, webbing, boot, glove, sole, gunmetal, steel, rim, skin, beard, paint, wound, bone, mouth, lens, halo];
  return { suit, rag, leather, tan, webbing, boot, glove, sole, gunmetal, steel, rim, skin, beard, paint, wound, bone, mouth, lens, halo, materials, textures };
}

/** Pebbled knit of the suit in deep red, grimy, with dark old blood soaked in here and there. */
function knitPainter(): Painter {
  const size = 256;
  const grime = tileableNoise(seededRandom(11), 32, size);
  const fine = tileableNoise(seededRandom(12), 4, size);
  const blood = tileableNoise(seededRandom(13), 16, size);
  const base: Rgb = [128, 22, 26];
  const dirt: Rgb = [58, 30, 24];
  const stain: Rgb = [52, 8, 8];
  const color: Rgb = [0, 0, 0];
  return (x, y, texel) => {
    const cx = (x % 4) - 1.5;
    const cy = ((y + (Math.floor(x / 4) % 2) * 2) % 4) - 1.5;
    const bump = 1 - Math.min(1, (cx * cx + cy * cy) / 4.5);
    const shade = 0.78 + 0.22 * bump + (fine(x, y) - 0.5) * 0.14;
    mix(base, dirt, Math.max(0, grime(x, y) - 0.55) * 1.6, color);
    mix(color, stain, Math.max(0, blood(x, y) - 0.74) * 3.5, color);
    texel.color[0] = color[0] * shade;
    texel.color[1] = color[1] * shade;
    texel.color[2] = color[2] * shade;
    texel.height = 0.3 + bump * 0.5 + fine(x, y) * 0.1;
    texel.roughness = 0.74 + (1 - bump) * 0.16;
  };
}

/** Grained leather of `tint`: creased, scuffed lighter where it wears, darker in the folds. */
function leatherPainter(tint: Rgb, seed: number): Painter {
  const size = 128;
  const grain = tileableNoise(seededRandom(seed), 2, size);
  const crease = tileableNoise(seededRandom(seed + 100), 16, size);
  const wear = tileableNoise(seededRandom(seed + 200), 32, size);
  return (x, y, texel) => {
    const fold = Math.abs(crease(x, y) - 0.5) < 0.035 ? 1 : 0;
    const scuff = Math.max(0, wear(x, y) - 0.6) * 1.8;
    const shade = 0.86 + (grain(x, y) - 0.5) * 0.18 + scuff * 0.35 - fold * 0.25;
    texel.color[0] = tint[0] * shade;
    texel.color[1] = tint[1] * shade;
    texel.color[2] = tint[2] * shade;
    texel.height = 0.5 + grain(x, y) * 0.25 - fold * 0.35;
    texel.roughness = 0.62 + grain(x, y) * 0.2 - scuff * 0.15;
  };
}

/** Cream canvas webbing: a tight twill along its length, grimed. */
function webbingPainter(): Painter {
  const size = 128;
  const grime = tileableNoise(seededRandom(41), 16, size);
  return (x, y, texel) => {
    const twill = ((x + y) % 4 < 2 ? 1 : 0) * 0.5 + (x % 2) * 0.25;
    const dirty = Math.max(0, grime(x, y) - 0.45) * 0.6;
    const shade = 0.86 + twill * 0.14 - dirty;
    texel.color[0] = 214 * shade;
    texel.color[1] = 202 * shade;
    texel.color[2] = 172 * shade;
    texel.height = 0.4 + twill * 0.4;
    texel.roughness = 0.88;
  };
}

/** Brushed metal of `tint`: fine streaks along u, worn bright and pitted dark in patches. */
function brushedPainter(tint: Rgb, seed: number): Painter {
  const size = 128;
  const wear = tileableNoise(seededRandom(seed), 16, size);
  const pits = tileableNoise(seededRandom(seed + 1), 2, size);
  return (x, y, texel) => {
    const streak = hash2(0, y, seed) * 0.6 + hash2(x >> 3, y, seed + 7) * 0.4;
    const worn = wear(x, y);
    const pit = pits(x, y) > 0.82 ? 1 : 0;
    const shade = 0.82 + streak * 0.16 + (worn - 0.5) * 0.18 - pit * 0.3;
    texel.color[0] = tint[0] * shade;
    texel.color[1] = tint[1] * shade;
    texel.color[2] = tint[2] * shade;
    texel.height = 0.5 + streak * 0.1 - pit * 0.3;
    texel.roughness = 0.3 + (1 - worn) * 0.2 + pit * 0.3;
  };
}

/** Dead grey-green skin, mottled with bruises, its veins dark and glowing faintly once fury lights them. */
function skinPainter(): Painter {
  const size = 128;
  const mottle = tileableNoise(seededRandom(51), 16, size);
  const bruise = tileableNoise(seededRandom(52), 32, size);
  const veins = tileableNoise(seededRandom(53), 8, size);
  const pores = tileableNoise(seededRandom(54), 2, size);
  const pale: Rgb = [128, 138, 106];
  const purple: Rgb = [92, 64, 82];
  const vein: Rgb = [58, 36, 52];
  const color: Rgb = [0, 0, 0];
  return (x, y, texel) => {
    const line = Math.max(0, 1 - Math.abs(veins(x, y) - 0.5) / 0.03);
    mix(pale, purple, Math.max(0, bruise(x, y) - 0.5) * 1.6, color);
    mix(color, vein, line * 0.8, color);
    const shade = 0.88 + (mottle(x, y) - 0.5) * 0.25;
    texel.color[0] = color[0] * shade;
    texel.color[1] = color[1] * shade;
    texel.color[2] = color[2] * shade;
    texel.height = 0.5 + pores(x, y) * 0.15 + line * 0.25;
    texel.roughness = 0.78 - line * 0.2;
    texel.emissive = line;
  };
}

/** Coarse grey hair in strands along v, darker at the roots. */
function beardPainter(): Painter {
  const size = 128;
  const clumps = tileableNoise(seededRandom(61), 8, size);
  return (x, y, texel) => {
    const strand = hash2(x, 0, 61) * 0.7 + hash2(x >> 1, y >> 4, 62) * 0.3;
    const clump = clumps(x, y);
    const shade = 0.45 + strand * 0.55 + (clump - 0.5) * 0.2;
    texel.color[0] = 168 * shade;
    texel.color[1] = 164 * shade;
    texel.color[2] = 156 * shade;
    texel.height = 0.3 + strand * 0.6;
    texel.roughness = 0.9;
  };
}

/** The shield's red enamel: glossy, chipped to bare steel along its scrapes, a dark blood smear across it. */
function paintPainter(): Painter {
  const size = 256;
  const chips = tileableNoise(seededRandom(71), 8, size);
  const scrapes = tileableNoise(seededRandom(72), 32, size);
  const smear = tileableNoise(seededRandom(73), 64, size);
  const enamel: Rgb = [156, 20, 24];
  const bare: Rgb = [150, 152, 156];
  const blood: Rgb = [60, 10, 8];
  const color: Rgb = [0, 0, 0];
  return (x, y, texel) => {
    const chipped = chips(x, y) * 0.6 + scrapes(x, y) * 0.4 > 0.7 ? 1 : 0;
    mix(enamel, bare, chipped, color);
    mix(color, blood, Math.max(0, smear(x, y) - 0.68) * 2.5 * (1 - chipped), color);
    texel.color[0] = color[0];
    texel.color[1] = color[1];
    texel.color[2] = color[2];
    texel.height = chipped ? 0.35 : 0.6;
    texel.roughness = chipped ? 0.4 : 0.28 + scrapes(x, y) * 0.15;
  };
}
