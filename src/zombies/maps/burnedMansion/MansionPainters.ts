import * as THREE from 'three';
import { seededRandom, tileableNoise } from '../shared/ProceduralNoise';
import { hash2, mix, type Painter, type Rgb } from '../shared/ProceduralSurface';

/**
 * Texel painters of Burned Mansion: a Victorian house gutted by fire above a
 * cold civil-defence bunker. Every repeating surface uses tileable noise so
 * world-anchored UVs never show a seam. Sizes must be multiples of the
 * pattern cells noted on each painter.
 */

const { smoothstep } = THREE.MathUtils;

/** One block of checked char: crack 1 in the fissures, dome 0..1 towards the block centre. */
interface CharBlock {
  crack: number;
  dome: number;
  id: number;
}

/**
 * Burnt wood splits into blocks across its grain ("alligatoring"). Rows of
 * `width` x `height` texel blocks, staggered per row; both must divide the
 * texture size for the pattern to tile.
 */
function charBlock(x: number, y: number, width: number, height: number, seed: number, out: CharBlock): CharBlock {
  const row = Math.floor(y / height);
  const shifted = x + Math.floor(hash2(row, 0, seed) * width);
  const column = Math.floor(shifted / width);
  const localX = shifted - column * width;
  const localY = y - row * height;
  const edge = Math.min(localX, width - localX, localY, height - localY);
  out.crack = 1 - smoothstep(edge, 0.5, 1.6);
  out.dome = Math.min(1, edge / (Math.min(width, height) * 0.4));
  out.id = hash2(column, row, seed + 7);
  return out;
}

/** Five-lobed damask medallion with scrolling stems; `px` mirrored 0..1, `py` -0.5..0.5. */
function damask(px: number, py: number): number {
  const radius = Math.hypot(px * 0.95, py * 1.3);
  const angle = Math.atan2(py, px);
  const lobe = 0.3 + 0.06 * Math.cos(angle * 5);
  const outer = 1 - smoothstep(radius, lobe - 0.015, lobe + 0.015);
  const inner = 1 - smoothstep(radius, lobe * 0.6 - 0.015, lobe * 0.6 + 0.015);
  const heart = 1 - smoothstep(radius, 0.07, 0.09);
  const stemX = 0.62 + 0.18 * Math.sin(py * Math.PI * 2);
  const stem = radius > lobe + 0.06 ? 1 - smoothstep(Math.abs(px - stemX), 0.014, 0.026) : 0;
  const bud = 1 - smoothstep(Math.hypot(px - 0.88, Math.abs(py) - 0.36), 0.035, 0.05);
  return Math.max(outer - inner, heart, stem, bud);
}

/**
 * Oxblood damask paper over plaster, faded, streaked and burnt through in
 * patches whose curled edges went black. Motif cell: size / 4, half-drop.
 */
export function wallpaperPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5101);
    const fade = tileableNoise(random, size / 4, size);
    const burn = tileableNoise(random, size / 4, size);
    const burnFine = tileableNoise(random, size / 16, size);
    const runs = tileableNoise(random, size / 32, size);
    const paper: Rgb = [80, 30, 32];
    const motif: Rgb = [128, 92, 56];
    const plaster: Rgb = [62, 56, 48];
    const char: Rgb = [15, 12, 11];
    const tinted: Rgb = [0, 0, 0];
    const cell = size / 4;
    return (x, y, texel) => {
      const column = Math.floor(x / cell);
      const u = (x % cell) / cell;
      const v = ((y + (column % 2) * cell / 2) % cell) / cell;
      const pattern = damask(Math.abs(u - 0.5) * 2, v - 0.5);
      mix(paper, motif, pattern * 0.8, tinted);
      // Seepage runs down from the cornice in narrow vertical bands.
      const run = smoothstep(runs(x, 0), 0.62, 0.86) * (0.6 + fade(x, y) * 0.4) * 0.35;
      const shade = (0.78 + fade(x, y) * 0.34) * (1 - run);
      const burnt = burn(x, y) * 0.8 + burnFine(x, y) * 0.2;
      const scorch = smoothstep(burnt, 0.5, 0.66);
      const hole = smoothstep(burnt, 0.665, 0.685);
      const curledEdge = Math.max(0, 1 - Math.abs(burnt - 0.675) / 0.014);
      mix(tinted, char, scorch * 0.75, tinted);
      if (hole > 0) mix(tinted, plaster, hole, tinted);
      mix(tinted, char, curledEdge, tinted);
      const plasterSoot = hole * (0.45 + burnFine(x, y) * 0.4);
      texel.color[0] = tinted[0] * shade * (1 - plasterSoot);
      texel.color[1] = tinted[1] * shade * (1 - plasterSoot);
      texel.color[2] = tinted[2] * shade * (1 - plasterSoot);
      texel.height = 0.55 + pattern * 0.04 - hole * 0.25 + curledEdge * 0.2;
      texel.roughness = THREE.MathUtils.lerp(0.82 - pattern * 0.24, 0.96, Math.max(hole, scorch * 0.6));
    };
  };
}

/**
 * Raised walnut panels, one per tile, with a bevelled field and scorched,
 * checked patches where the flames licked down the walls.
 */
export function wainscotPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5113);
    const grainNoise = tileableNoise(random, size / 16, size);
    const charNoise = tileableNoise(random, size / 2, size);
    const wear = tileableNoise(random, size / 8, size);
    const walnut: Rgb = [70, 42, 26];
    const charred: Rgb = [16, 13, 12];
    const tinted: Rgb = [0, 0, 0];
    const block: CharBlock = { crack: 0, dome: 0, id: 0 };
    const frame = 0.14;
    const bevel = 0.06;
    return (x, y, texel) => {
      const u = x / size;
      const v = y / size;
      const toSide = Math.min(u, 1 - u);
      const toEnd = Math.min(v, 1 - v);
      const edge = Math.min(toSide, toEnd);
      const seam = edge < 0.008;
      const inRail = toEnd < frame && toEnd < toSide;
      // Stiles run their grain vertically, rails and field horizontally.
      const across = inRail || edge >= frame ? y : x;
      const grain = 0.5 + 0.5 * Math.sin(across * 0.55 + grainNoise(x, y) * 9);
      let height = 0.55;
      if (edge >= frame + bevel) height = 0.8;
      else if (edge >= frame) height = 0.3 + (edge - frame) / bevel * 0.5;
      const quirk = edge >= frame && edge < frame + 0.008;
      const burnt = smoothstep(charNoise(x, y), 0.56, 0.7);
      charBlock(x, y, 16, 8, 5117, block);
      mix(walnut, charred, burnt, tinted);
      const worn = smoothstep(wear(x, y), 0.6, 0.9) * (height > 0.75 ? 0.25 : 0.1);
      const shade = (0.82 + grain * 0.16 + worn) * (1 - burnt * block.crack * 0.7) * (seam || quirk ? 0.45 : 1);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = seam ? 0.1 : quirk ? 0.25 : height - burnt * (block.crack * 0.25 - block.dome * 0.08);
      texel.roughness = THREE.MathUtils.lerp(0.42 + worn, 0.8 - block.dome * 0.15, burnt);
    };
  };
}

/** Plain varnished wood for mouldings and casings, grain along the length, scorched in places. */
export function trimPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5119);
    const grainNoise = tileableNoise(random, size / 8, size);
    const scorch = tileableNoise(random, size / 2, size);
    const varnish: Rgb = [64, 38, 23];
    const charred: Rgb = [18, 14, 12];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const grain = 0.5 + 0.5 * Math.sin(y * 0.7 + grainNoise(x, y) * 7);
      const burnt = smoothstep(scorch(x, y), 0.55, 0.75) * 0.85;
      mix(varnish, charred, burnt, tinted);
      const shade = 0.84 + grain * 0.18;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.5 + grain * 0.08;
      texel.roughness = 0.45 + burnt * 0.45;
    };
  };
}

/**
 * Black, checked char with a silvery sheen on the blocks. A few fissures
 * still smoulder: their glow lives in the emissive mask. Blocks 16 x 32.
 */
export function charredWoodPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5123);
    const fine = tileableNoise(random, size / 16, size);
    const ember = tileableNoise(random, size / 4, size);
    const scale: Rgb = [42, 38, 35];
    const fissure: Rgb = [7, 6, 5];
    const glow: Rgb = [120, 36, 10];
    const tinted: Rgb = [0, 0, 0];
    const block: CharBlock = { crack: 0, dome: 0, id: 0 };
    return (x, y, texel) => {
      charBlock(x, y, 16, 32, 5129, block);
      const sheen = 0.7 + block.dome * 0.35 + fine(x, y) * 0.15;
      mix(scale, fissure, block.crack, tinted);
      const smoulder = block.id > 0.9 ? block.crack * smoothstep(ember(x, y), 0.4, 0.75) : 0;
      if (smoulder > 0) mix(tinted, glow, smoulder, tinted);
      texel.color[0] = tinted[0] * sheen;
      texel.color[1] = tinted[1] * sheen;
      texel.color[2] = tinted[2] * sheen;
      texel.height = 0.25 + block.dome * 0.6 - block.crack * 0.25;
      texel.roughness = 0.6 + block.crack * 0.4 - block.dome * 0.08;
      texel.emissive = smoulder;
    };
  };
}

/**
 * Oak boards with staggered butt joints, varnish worn grey along the
 * walking lines, ash drifts and black, checked burns. Planks 32 texels
 * wide, two per row; size must be 512.
 */
export function parquetPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5131);
    const grainNoise = tileableNoise(random, size / 32, size);
    const charNoise = tileableNoise(random, size / 4, size);
    const charFine = tileableNoise(random, size / 16, size);
    const ashNoise = tileableNoise(random, size / 8, size);
    const oak: Rgb = [104, 66, 40];
    const charred: Rgb = [17, 14, 12];
    const ash: Rgb = [92, 88, 82];
    const tinted: Rgb = [0, 0, 0];
    const block: CharBlock = { crack: 0, dome: 0, id: 0 };
    const plankWidth = 32;
    const plankLength = size / 2;
    return (x, y, texel) => {
      const row = Math.floor(y / plankWidth);
      const localY = y - row * plankWidth;
      const shifted = (x + Math.floor(hash2(row, 0, 5137) * plankLength)) % size;
      const segment = Math.floor(shifted / plankLength);
      const localX = shifted - segment * plankLength;
      const gap = localY < 1.5 || localX < 1.5;
      const tone = 0.74 + hash2(segment, row, 5139) * 0.34;
      const grain = 0.5 + 0.5 * Math.sin(localY * 0.85 + grainNoise(x, y) * 10 + hash2(segment, row, 5141) * 40);
      const burnt = charNoise(x, y) * 0.75 + charFine(x, y) * 0.25;
      const charredness = smoothstep(burnt, 0.58, 0.68);
      const scorch = smoothstep(burnt, 0.44, 0.6) * 0.6;
      const dusted = smoothstep(ashNoise(x, y), 0.55, 0.8) * 0.45 * (1 - charredness);
      charBlock(x, y, 32, 16, 5143, block);
      mix(oak, charred, Math.max(scorch, charredness), tinted);
      mix(tinted, ash, dusted, tinted);
      const shade = gap ? 0.25 : tone * (0.86 + grain * 0.16) * (1 - charredness * block.crack * 0.6);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = gap ? 0 : 0.7 + charredness * (block.dome * 0.15 - block.crack * 0.35);
      texel.roughness = gap ? 1 : THREE.MathUtils.lerp(0.36 + scorch * 0.4 + dusted, 0.82, charredness);
    };
  };
}

/**
 * Lath-and-plaster ceiling blackened by smoke; where plaster fell, the
 * charred laths show through. Laths 12 texels apart.
 */
export function ceilingPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5147);
    const soot = tileableNoise(random, size / 4, size);
    const holes = tileableNoise(random, size / 4, size);
    const fine = tileableNoise(random, size / 16, size);
    const plaster: Rgb = [78, 72, 64];
    const black: Rgb = [20, 18, 16];
    const lath: Rgb = [38, 29, 22];
    const cavity: Rgb = [4, 4, 4];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const hole = smoothstep(holes(x, y) * 0.85 + fine(x, y) * 0.15, 0.66, 0.68);
      const crackLine = Math.abs(fine(x, y) - 0.5) < 0.006 && hole === 0;
      mix(plaster, black, 0.45 + smoothstep(soot(x, y), 0.25, 0.8) * 0.5, tinted);
      const onLath = y % 12 < 8;
      if (hole > 0) mix(tinted, onLath ? lath : cavity, hole, tinted);
      const shade = (0.86 + fine(x, y) * 0.2) * (crackLine ? 0.5 : 1);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = hole > 0 ? (onLath ? 0.35 : 0.05) : 0.6 + fine(x, y) * 0.15 - (crackLine ? 0.3 : 0);
      texel.roughness = 0.95;
    };
  };
}

/**
 * Board-formed bunker concrete: the shuttering left 32-texel board marks,
 * a faint grain and the tie holes of the formwork.
 */
export function formedConcretePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5153);
    const broad = tileableNoise(random, size / 4, size);
    const fine = tileableNoise(random, size / 32, size);
    const grainNoise = tileableNoise(random, size / 8, size);
    return (x, y, texel) => {
      const board = Math.floor(y / 32);
      const localY = y - board * 32;
      const ridge = localY < 1.5;
      const tone = 0.9 + hash2(board, Math.floor(x / 128), 5159) * 0.12;
      const grain = Math.sin(localY * 1.3 + grainNoise(x, y) * 6) * 0.04;
      const tieHole = Math.hypot((x % 128) - 64, (y % 128) - 16) < 3;
      const shade = tieHole ? 0.35 : (0.74 + broad(x, y) * 0.3 + fine(x, y) * 0.1 + grain) * tone * (ridge ? 1.08 : 1);
      texel.color[0] = 94 * shade;
      texel.color[1] = 96 * shade;
      texel.color[2] = 91 * shade;
      texel.height = tieHole ? 0 : ridge ? 0.75 : 0.5 + grain + fine(x, y) * 0.12;
      texel.roughness = 0.94;
    };
  };
}

/** Poured bunker slab with saw-cut joints every 128 texels and oil stains. */
export function slabConcretePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5167);
    const broad = tileableNoise(random, size / 4, size);
    const fine = tileableNoise(random, size / 32, size);
    const oil = tileableNoise(random, size / 4, size);
    return (x, y, texel) => {
      const joint = x % 128 < 1.5 || y % 128 < 1.5;
      const stain = smoothstep(oil(x, y), 0.68, 0.82) * 0.55;
      const shade = joint ? 0.35 : (0.76 + broad(x, y) * 0.28 + fine(x, y) * 0.1) * (1 - stain);
      texel.color[0] = 76 * shade;
      texel.color[1] = 76 * shade;
      texel.color[2] = 72 * shade;
      texel.height = joint ? 0 : 0.6 + fine(x, y) * 0.1;
      texel.roughness = joint ? 1 : 0.9 - stain * 0.75;
    };
  };
}

/** Olive civil-defence paint, chipped back to bare concrete. */
export function bunkerPaintPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5171);
    const chips = tileableNoise(random, size / 8, size);
    const fine = tileableNoise(random, size / 32, size);
    const paint: Rgb = [66, 74, 52];
    const concrete: Rgb = [94, 94, 90];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const chip = smoothstep(chips(x, y) + fine(x, y) * 0.2, 0.74, 0.79);
      mix(paint, concrete, chip, tinted);
      const shade = 0.86 + fine(x, y) * 0.2;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.6 - chip * 0.25;
      texel.roughness = 0.62 + chip * 0.3;
    };
  };
}

/** Bare steel blooming with rust and pitting. */
export function rustySteelPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5179);
    const rustNoise = tileableNoise(random, size / 4, size);
    const fine = tileableNoise(random, size / 16, size);
    const steel: Rgb = [74, 76, 76];
    const rust: Rgb = [102, 54, 30];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const rusted = smoothstep(rustNoise(x, y) * 0.7 + fine(x, y) * 0.3, 0.45, 0.75);
      const pit = hash2(x, y, 5181) > 0.975;
      mix(steel, rust, rusted, tinted);
      const shade = (0.82 + fine(x, y) * 0.25) * (pit ? 0.6 : 1);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.5 + rusted * 0.15 - (pit ? 0.2 : 0);
      texel.roughness = 0.42 + rusted * 0.5;
    };
  };
}

/** Diamond tread plate of the bunker stairs: worn bright on the lozenges. Cells 32 texels. */
export function treadPlatePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5183);
    const rustNoise = tileableNoise(random, size / 4, size);
    const steel: Rgb = [70, 72, 72];
    const worn: Rgb = [132, 132, 128];
    const rust: Rgb = [96, 52, 30];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const cellX = Math.floor(x / 32);
      const cellY = Math.floor(y / 32);
      const localX = x - cellX * 32 - 16;
      const localY = y - cellY * 32 - 16;
      const turn = (cellX + cellY) % 2 === 0 ? 1 : -1;
      const along = (localX + turn * localY) * Math.SQRT1_2;
      const across = (localX - turn * localY) * Math.SQRT1_2;
      const lozenge = 1 - smoothstep(Math.abs(along) / 12 + Math.abs(across) / 3.2, 0.85, 1.05);
      const rusted = smoothstep(rustNoise(x, y), 0.55, 0.8) * (1 - lozenge);
      mix(steel, worn, lozenge * 0.7, tinted);
      mix(tinted, rust, rusted, tinted);
      texel.color[0] = tinted[0];
      texel.color[1] = tinted[1];
      texel.color[2] = tinted[2];
      texel.height = 0.4 + lozenge * 0.5;
      texel.roughness = 0.62 - lozenge * 0.3 + rusted * 0.3;
    };
  };
}

/** Grey, weathered boards nailed over the paid doorways. Boards 32 texels wide. */
export function weatheredPlankPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5189);
    const grainNoise = tileableNoise(random, size / 16, size);
    const scorch = tileableNoise(random, size / 2, size);
    const board: Rgb = [96, 82, 66];
    const charred: Rgb = [24, 19, 16];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const column = Math.floor(x / 32);
      const localX = x - column * 32;
      const gap = localX < 1.5;
      const grain = 0.5 + 0.5 * Math.sin(localX * 0.9 + grainNoise(x, y) * 8 + column * 3.1);
      const nail = (Math.abs((y % 128) - 12) < 2 || Math.abs((y % 128) - 116) < 2) && Math.abs(localX - 16) < 2;
      const burnt = smoothstep(scorch(x, y), 0.6, 0.8) * 0.8;
      mix(board, charred, burnt, tinted);
      const shade = gap || nail ? 0.3 : (0.72 + hash2(column, 0, 5191) * 0.25) * (0.86 + grain * 0.18);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = gap ? 0 : nail ? 0.3 : 0.6 + grain * 0.12;
      texel.roughness = 0.88;
    };
  };
}

/** Dead lawn around the house: mud, straw-coloured grass, ash and standing water. */
export function deadLawnPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5197);
    const broad = tileableNoise(random, size / 4, size);
    const tufts = tileableNoise(random, size / 64, size);
    const ashNoise = tileableNoise(random, size / 8, size);
    const mud: Rgb = [46, 39, 31];
    const straw: Rgb = [92, 80, 52];
    const ash: Rgb = [78, 76, 72];
    const water: Rgb = [16, 18, 19];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const grass = smoothstep(tufts(x, y) + broad(x, y) * 0.3, 0.62, 0.8);
      const ashed = smoothstep(ashNoise(x, y), 0.62, 0.8) * 0.6;
      const puddle = 1 - smoothstep(broad(x, y), 0.14, 0.2);
      mix(mud, straw, grass * 0.8, tinted);
      mix(tinted, ash, ashed, tinted);
      mix(tinted, water, puddle, tinted);
      const shade = 0.8 + tufts(x, y) * 0.3;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.4 + grass * 0.3 - puddle * 0.2;
      texel.roughness = THREE.MathUtils.lerp(0.95, 0.12, puddle);
    };
  };
}

/** Furrowed bark of the dead trees. */
export function barkPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5209);
    const wobble = tileableNoise(random, size / 8, size);
    const fine = tileableNoise(random, size / 32, size);
    return (x, y, texel) => {
      const furrow = Math.abs(Math.sin((x / size) * Math.PI * 8 + wobble(x, y) * 3));
      const shade = 0.5 + furrow * 0.5 + fine(x, y) * 0.15;
      texel.color[0] = 44 * shade;
      texel.color[1] = 38 * shade;
      texel.color[2] = 34 * shade;
      texel.height = furrow * 0.8 + fine(x, y) * 0.1;
      texel.roughness = 0.95;
    };
  };
}

/** Lichen-spotted granite of the family plot. */
export function gravestonePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(5221);
    const broad = tileableNoise(random, size / 4, size);
    const lichenNoise = tileableNoise(random, size / 8, size);
    const fine = tileableNoise(random, size / 32, size);
    const stone: Rgb = [92, 92, 88];
    const lichen: Rgb = [70, 78, 50];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const growth = smoothstep(lichenNoise(x, y) + fine(x, y) * 0.2, 0.68, 0.8);
      mix(stone, lichen, growth, tinted);
      const shade = 0.72 + broad(x, y) * 0.3 + fine(x, y) * 0.1;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.5 + fine(x, y) * 0.3 + growth * 0.1;
      texel.roughness = 0.9;
    };
  };
}

/**
 * A darkened family portrait, crazed varnish and a hole burnt through the
 * canvas. Not tiled: one image per plane (v grows upwards).
 */
export function portraitPainter(size: number, seed: number): () => Painter {
  return () => {
    const random = seededRandom(seed);
    const fine = tileableNoise(random, size / 16, size);
    const holeEdge = tileableNoise(random, size / 8, size);
    const holeX = 0.25 + random() * 0.5;
    const holeY = 0.2 + random() * 0.6;
    const block: CharBlock = { crack: 0, dome: 0, id: 0 };
    const background: Rgb = [44, 32, 22];
    const skin: Rgb = [118, 88, 66];
    const coat: Rgb = [28, 22, 24];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      const u = x / size;
      const v = y / size;
      const head = 1 - smoothstep(Math.hypot((u - 0.5) / 0.13, (v - 0.64) / 0.17), 0.9, 1.05);
      const shoulders = 1 - smoothstep(Math.hypot((u - 0.5) / 0.36, (v - 0.12) / 0.3), 0.9, 1.02);
      const vignette = 1 - Math.hypot(u - 0.5, v - 0.55) * 0.9;
      mix(background, skin, head * 0.85, tinted);
      mix(tinted, coat, shoulders * (1 - head), tinted);
      charBlock(x, y, 8, 8, seed + 3, block);
      const holeDistance = Math.hypot(u - holeX, v - holeY) + (holeEdge(x, y) - 0.5) * 0.12;
      const hole = 1 - smoothstep(holeDistance, 0.12, 0.13);
      const singed = 1 - smoothstep(holeDistance, 0.13, 0.2);
      const shade = Math.max(0.2, vignette) * (0.85 + fine(x, y) * 0.2) * (1 - block.crack * 0.25) * (1 - singed * 0.75);
      texel.color[0] = hole > 0 ? 6 : tinted[0] * shade;
      texel.color[1] = hole > 0 ? 5 : tinted[1] * shade;
      texel.color[2] = hole > 0 ? 5 : tinted[2] * shade;
      texel.height = hole > 0 ? 0 : 0.5 - block.crack * 0.15;
      texel.roughness = hole > 0 ? 1 : 0.55 + block.crack * 0.3;
    };
  };
}
