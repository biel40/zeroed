import * as THREE from 'three';
import { makeBloodDecalTexture } from './shared/BloodDecalTexture';
import { seededRandom, tileableNoise, valueNoise } from './shared/ProceduralNoise';
import { bake, decalMaterial, decalTexture, hash2, mix, surfaceMaterial, type Painter, type Rgb } from './shared/ProceduralSurface';

/**
 * Surfaces of Station 33: cold Soviet-era marble, chequered granite, stained
 * vault plaster, military-green steel and, in the train sheds, cast-iron
 * tunnel rings and faded metro cars. Every texture is baked in code
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
  /** Cast-iron tunnel rings of the train sheds: flanged segments, bolts, rust and seepage. */
  readonly tubbing: THREE.MeshStandardMaterial;
  /** Oil-stained concrete slabs of the train-shed floor. */
  readonly depotFloor: THREE.MeshStandardMaterial;
  /** Dark ballast between and around the rails. */
  readonly trackBed: THREE.MeshStandardMaterial;
  /** Faded blue enamel of the metro cars, grimy and rust-blooming. */
  readonly carriagePaint: THREE.MeshStandardMaterial;
  /** Worn yellow and black warning stripes (buffer stops, blast gate). */
  readonly hazardPaint: THREE.MeshStandardMaterial;
  readonly railSteel: THREE.MeshStandardMaterial;
  readonly greySteel: THREE.MeshStandardMaterial;
  readonly bronze: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly varnishedWood: THREE.MeshStandardMaterial;
  readonly windowGlass: THREE.MeshStandardMaterial;
  readonly rubble: THREE.MeshStandardMaterial;
  readonly luggage: readonly THREE.MeshStandardMaterial[];
  /** Woven jute of the sandbags; its UVs are laid out by the sack geometry. */
  readonly burlap: THREE.MeshStandardMaterial;
  readonly paper: THREE.MeshStandardMaterial;
  /** Steel slats bolted over the zombie entrances (WindowBarrierView skin). */
  readonly barrierSlat: THREE.MeshStandardMaterial;
  readonly bloodSplatter: THREE.MeshStandardMaterial;
  readonly bloodSmear: THREE.MeshStandardMaterial;
  readonly waterStreak: THREE.MeshStandardMaterial;
  readonly floorGrime: THREE.MeshStandardMaterial;
  readonly puddle: THREE.MeshStandardMaterial;
  /** Dusty corner web anchored at the texture's top-left corner, seen from both sides. */
  readonly cobweb: THREE.MeshStandardMaterial;
  /** Invisible proxy for collision-only volumes (never drawn). */
  readonly collider: THREE.MeshBasicMaterial;
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

/**
 * Cast-iron tunnel lining: `panels` x `panels` flanged segments per tile,
 * each with a recessed back, a stiffening rib, bolt holes along its flanges
 * and rust blooming where water ran over it. Wet patches stay glossy.
 */
function tubbingPainter(size: number, panels: number): () => Painter {
  return () => {
    const random = seededRandom(3371);
    const rust = tileableNoise(random, size / 4, size);
    const wet = tileableNoise(random, size / 2, size);
    const fine = tileableNoise(random, size / 32, size);
    const iron: Rgb = [50, 49, 47];
    const rusted: Rgb = [76, 52, 38];
    const tinted: Rgb = [0, 0, 0];
    const panel = size / panels;
    const flange = Math.max(3, Math.round(panel * 0.08));
    const boltSpacing = panel / 5;
    return (x, y, texel) => {
      const px = x % panel;
      const py = y % panel;
      const edge = Math.min(px, py, panel - 1 - px, panel - 1 - py);
      const onFlange = edge < flange;
      const onRib = !onFlange && Math.abs(px - panel / 2) < 1.5;
      // Bolt holes sit in the middle of each flange, spaced along it.
      const along = px < flange || px > panel - 1 - flange ? py : px;
      const bolt = onFlange && Math.abs((along % boltSpacing) - boltSpacing / 2) < 1.6 && Math.abs(edge - flange / 2) < 1.4;
      const corrosion = THREE.MathUtils.smoothstep(rust(x, y) + fine(x, y) * 0.3 + (onFlange ? 0.04 : 0), 0.62, 0.98);
      const damp = THREE.MathUtils.smoothstep(wet(x, y), 0.6, 0.85);
      mix(iron, rusted, corrosion, tinted);
      const relief = onFlange || onRib ? 1.12 : 0.84 + fine(x, y) * 0.1;
      const shade = relief * (bolt ? 0.4 : 1) * (1 - damp * 0.25);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = bolt ? 0.55 : onFlange ? 0.95 : onRib ? 0.8 : 0.3 + fine(x, y) * 0.08;
      texel.roughness = 0.62 + corrosion * 0.32 - damp * 0.35;
    };
  };
}

/** Poured concrete floor slabs with saw-cut joints, oil drips and grit. */
function depotFloorPainter(size: number, slabs: number): () => Painter {
  return () => {
    const random = seededRandom(3373);
    const oil = tileableNoise(random, size / 4, size);
    const mottle = tileableNoise(random, size / 16, size);
    const slab = size / slabs;
    return (x, y, texel) => {
      const joint = x % slab < 2 || y % slab < 2;
      const stain = THREE.MathUtils.smoothstep(oil(x, y), 0.6, 0.9);
      const grit = hash2(x, y, 37) > 0.95 ? 0.75 : 1;
      const shade = joint ? 0.35 : (0.82 + mottle(x, y) * 0.22) * grit * (1 - stain * 0.55);
      texel.color[0] = 72 * shade;
      texel.color[1] = 71 * shade;
      texel.color[2] = 67 * shade;
      texel.height = joint ? 0.05 : 0.6 + mottle(x, y) * 0.15;
      // Oil leaves a dull sheen on the concrete.
      texel.roughness = joint ? 0.95 : 0.9 - stain * 0.45;
    };
  };
}

/** Coarse plain-weave jute with uneven, slubbed threads; the tile is small, so no broad stains that would repeat. */
function burlapPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3467);
    const slub = valueNoise(random, size / 16, size);
    const fibre: Rgb = [112, 94, 62];
    const faded: Rgb = [138, 122, 92];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      // Plain weave: warp over weft on alternate cells, a dark gap between threads.
      const cellX = Math.floor(x / 4);
      const cellY = Math.floor(y / 4);
      const over = (cellX + cellY) % 2 === 0;
      const along = over ? x % 4 : y % 4;
      const across = over ? y % 4 : x % 4;
      const thread = Math.sin(((across + 0.5) / 4) * Math.PI);
      const gap = along === 0 ? 0.55 : 1;
      mix(fibre, faded, slub(x, y) * 0.45, tinted);
      const shade = (0.62 + thread * 0.38) * gap * (0.92 + hash2(x, y, 41) * 0.12);
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.3 + thread * 0.6 * gap;
      texel.roughness = 0.97;
    };
  };
}

/** Coarse dark ballast: one stone per small cell, oil-blackened in patches. */
function trackBedPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3379);
    const oil = tileableNoise(random, size / 4, size);
    const stone = 5;
    return (x, y, texel) => {
      const cellX = Math.floor(x / stone);
      const cellY = Math.floor(y / stone);
      const dx = (x % stone) - stone / 2 + (hash2(cellX, cellY, 41) - 0.5) * 2;
      const dy = (y % stone) - stone / 2 + (hash2(cellX, cellY, 43) - 0.5) * 2;
      const round = Math.max(0, 1 - Math.hypot(dx, dy) / (stone * 0.6));
      const tone = 0.7 + hash2(cellX, cellY, 47) * 0.5;
      const blackened = 1 - THREE.MathUtils.smoothstep(oil(x, y), 0.5, 0.85) * 0.5;
      const shade = (0.35 + round * 0.65) * tone * blackened;
      texel.color[0] = 64 * shade;
      texel.color[1] = 61 * shade;
      texel.color[2] = 56 * shade;
      texel.height = round;
      texel.roughness = 0.95;
    };
  };
}

/** Metro-car enamel: a faded steel blue gone grey with grime, chipped to rust. */
function carriagePainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3389);
    const grime = tileableNoise(random, size / 4, size);
    const chips = tileableNoise(random, size / 12, size);
    const fine = tileableNoise(random, size / 32, size);
    const paint: Rgb = [70, 92, 102];
    const dirty: Rgb = [58, 60, 56];
    const rust: Rgb = [96, 58, 36];
    const tinted: Rgb = [0, 0, 0];
    return (x, y, texel) => {
      mix(paint, dirty, THREE.MathUtils.smoothstep(grime(x, y), 0.35, 0.9) * 0.7, tinted);
      const chip = THREE.MathUtils.smoothstep(chips(x, y) + fine(x, y) * 0.25, 0.9, 0.95);
      mix(tinted, rust, chip, tinted);
      const shade = 0.9 + fine(x, y) * 0.16;
      texel.color[0] = tinted[0] * shade;
      texel.color[1] = tinted[1] * shade;
      texel.color[2] = tinted[2] * shade;
      texel.height = 0.6 - chip * 0.3;
      texel.roughness = 0.45 + chip * 0.45 + grime(x, y) * 0.15;
    };
  };
}

/** Diagonal yellow and black warning stripes, faded and chipped back to steel. */
function hazardPainter(size: number): () => Painter {
  return () => {
    const random = seededRandom(3397);
    const wear = tileableNoise(random, size / 8, size);
    const yellow: Rgb = [146, 118, 38];
    const black: Rgb = [26, 25, 23];
    const steel: Rgb = [70, 64, 58];
    const tinted: Rgb = [0, 0, 0];
    const stripe = size / 4;
    return (x, y, texel) => {
      const band = Math.floor((x + y) / stripe) % 2 === 0 ? yellow : black;
      const worn = THREE.MathUtils.smoothstep(wear(x, y) + hash2(x, y, 53) * 0.12, 0.7, 0.8);
      mix(band, steel, worn, tinted);
      texel.color[0] = tinted[0];
      texel.color[1] = tinted[1];
      texel.color[2] = tinted[2];
      texel.height = 0.6 - worn * 0.2;
      texel.roughness = 0.55 + worn * 0.35;
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
/**
 * Corner cobweb: threads radiating from the top-left corner and a sagging
 * spiral strung between them, some spans broken, the whole web greyed with
 * dust and fading towards its loose edge.
 */
function makeCobwebTexture(seed: number): THREE.DataTexture {
  const size = 256;
  const random = seededRandom(seed);
  const threads = Array.from({ length: 9 }, (_, index) => (index / 8) * (Math.PI / 2) + (random() - 0.5) * 0.08);
  const rings = Array.from({ length: 11 }, (_, index) => 22 + index * 19 + (random() - 0.5) * 6);
  const reach = size * 0.98;
  const width = 1.6;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      let thread = 0;
      for (const theta of threads) thread = Math.max(thread, 1 - Math.abs(angle - theta) * radius / width);
      // Spiral spans sag between neighbouring threads; some have snapped.
      const span = threads.findIndex((theta, index) => index < threads.length - 1 && angle >= theta && angle < threads[index + 1]);
      let spiral = 0;
      if (span >= 0) {
        const from = threads[span];
        const along = (angle - from) / (threads[span + 1] - from);
        rings.forEach((ring, index) => {
          if (hash2(span, index, seed) < 0.18) return;
          const sagged = ring * (1 + 0.06 * Math.sin(Math.PI * along));
          spiral = Math.max(spiral, 1 - Math.abs(radius - sagged) / width);
        });
      }
      const fade = 1 - THREE.MathUtils.smoothstep(radius, reach * 0.7, reach);
      // A film of dust clogs the web near its anchor.
      const film = (1 - THREE.MathUtils.smoothstep(radius, 0, reach * 0.35)) * 0.18;
      const alpha = Math.min(1, Math.max(0, thread, spiral) * (0.65 + hash2(x >> 3, y >> 3, seed) * 0.35) + film) * fade;
      const offset = (y * size + x) * 4;
      data[offset] = 210;
      data[offset + 1] = 210;
      data[offset + 2] = 200;
      data[offset + 3] = Math.round(alpha * 245);
    }
  }
  return decalTexture(data, size);
}

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
    // Two 1 m segments per tile: a tunnel ring every metre, joints every metre around it.
    tubbing: surfaceMaterial('station33_tubbing', bake('tubbing', 256, 3, tubbingPainter(256, 2)), anisotropy, 2, { metalness: 0.35, side: THREE.DoubleSide }),
    depotFloor: surfaceMaterial('station33_depot_floor', bake('depot-floor', 256, 2, depotFloorPainter(256, 2)), anisotropy, 3),
    trackBed: surfaceMaterial('station33_track_bed', bake('track-bed', 256, 4, trackBedPainter(256)), anisotropy, 1.2),
    carriagePaint: surfaceMaterial('station33_carriage_paint', bake('carriage-paint', 256, 1.5, carriagePainter(256)), anisotropy, 2.5, { metalness: 0.3 }),
    hazardPaint: surfaceMaterial('station33_hazard_paint', bake('hazard-paint', 128, 1, hazardPainter(128)), anisotropy, 0.8, { metalness: 0.2 }),
    railSteel: new THREE.MeshStandardMaterial({ name: 'station33_rail_steel', color: 0x4c4038, roughness: 0.55, metalness: 0.7 }),
    greySteel: new THREE.MeshStandardMaterial({ name: 'station33_grey_steel', color: 0x4f5455, roughness: 0.55, metalness: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'station33_bronze', color: 0x6a5232, roughness: 0.45, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'station33_rubber', color: 0x141414, roughness: 0.75 }),
    varnishedWood: new THREE.MeshStandardMaterial({ name: 'station33_varnished_wood', color: 0x4c301c, roughness: 0.6 }),
    windowGlass: new THREE.MeshStandardMaterial({ name: 'station33_window_glass', color: 0x0c1312, roughness: 0.12, metalness: 0.3 }),
    rubble: new THREE.MeshStandardMaterial({ name: 'station33_rubble', color: 0x5d5b55, roughness: 0.98 }),
    luggage: [0x4a2e1c, 0x2b3440, 0x5f5236, 0x3a3d32].map((color, index) =>
      new THREE.MeshStandardMaterial({ name: `station33_luggage_${index}`, color, roughness: 0.8 })),
    burlap: surfaceMaterial('station33_burlap', bake('burlap', 128, 1.6, burlapPainter(128)), anisotropy, 0.14),
    paper: new THREE.MeshStandardMaterial({ name: 'station33_paper', color: 0xa9a28c, roughness: 0.95, side: THREE.DoubleSide }),
    barrierSlat: surfaceMaterial('station33_barrier_slat', paintedSteel, anisotropy, 0.8, { metalness: 0.45 }),
    bloodSplatter: decalMaterial('station33_blood_splatter', makeBloodDecalTexture('splatter', 331), 0.6),
    bloodSmear: decalMaterial('station33_blood_smear', makeBloodDecalTexture('smear', 337), 0.6),
    waterStreak: decalMaterial('station33_water_streak', makeStreakTexture(341), 0.85),
    floorGrime: decalMaterial('station33_floor_grime', makeBlotTexture(347, false), 0.95),
    puddle: decalMaterial('station33_puddle', makeBlotTexture(353, true), 0.08),
    cobweb: decalMaterial('station33_cobweb', makeCobwebTexture(359), 0.9, { side: THREE.DoubleSide }),
    collider: new THREE.MeshBasicMaterial({ name: 'station33_collider', visible: false }),
  };
}
