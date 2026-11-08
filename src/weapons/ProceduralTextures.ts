import * as THREE from 'three';

/** Deterministic PRNG so every build draws the same surface detail. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Repeating canvas texture; null outside a DOM (tests, workers). */
export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

let steelWear: THREE.CanvasTexture | null | undefined;

/** Roughness speckle and fine handling scratches for blued or parkerized steel. */
export function steelWearTexture(): THREE.CanvasTexture | null {
  if (steelWear !== undefined) return steelWear;
  const random = seededRandom(1947);
  steelWear = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = 'rgb(140, 140, 140)';
    ctx.fillRect(0, 0, 128, 128);
    for (let speck = 0; speck < 900; speck++) {
      const value = 118 + Math.floor(random() * 50);
      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2);
    }
    ctx.fillStyle = 'rgba(90, 90, 90, 0.6)';
    for (let scratch = 0; scratch < 24; scratch++) {
      ctx.fillRect(random() * 128, random() * 128, 6 + random() * 26, 0.6);
    }
  });
  steelWear?.repeat.set(18, 18);
  return steelWear;
}

let chippedPaint: THREE.CanvasTexture | null | undefined;

/**
 * Worn military paint tinted by the material colour: soot and grime
 * clouding the field, chips knocked back to pale primer and bare steel, and
 * rust freckles bleeding from them. Extrusion and cylinder UVs are in
 * metres or wraps, so the repeat keeps the chips a few millimetres wide.
 */
export function chippedPaintTexture(): THREE.CanvasTexture | null {
  if (chippedPaint !== undefined) return chippedPaint;
  const random = seededRandom(1933);
  chippedPaint = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#d9d9d2';
    ctx.fillRect(0, 0, 256, 256);
    for (let cloud = 0; cloud < 40; cloud++) {
      ctx.fillStyle = `rgba(40, 38, 30, ${0.03 + random() * 0.07})`;
      ctx.fillRect(random() * 256, random() * 256, 20 + random() * 60, 10 + random() * 40);
    }
    for (let chip = 0; chip < 140; chip++) {
      const x = random() * 256;
      const y = random() * 256;
      const size = 1 + random() * 5;
      const bare = random() < 0.45;
      ctx.fillStyle = bare ? 'rgba(255, 255, 255, 0.95)' : 'rgba(240, 236, 214, 0.8)';
      ctx.fillRect(x, y, size * (0.6 + random()), size * (0.4 + random() * 0.8));
      if (bare && random() < 0.6) {
        ctx.fillStyle = `rgba(120, 58, 22, ${0.25 + random() * 0.35})`;
        ctx.fillRect(x + random() * size, y + size, 1 + random() * 2, 2 + random() * 7);
      }
    }
    for (let scratch = 0; scratch < 30; scratch++) {
      ctx.fillStyle = 'rgba(250, 250, 240, 0.35)';
      ctx.fillRect(random() * 256, random() * 256, 8 + random() * 30, 0.7);
    }
  });
  if (chippedPaint) {
    chippedPaint.colorSpace = THREE.SRGBColorSpace;
    chippedPaint.repeat.set(5, 5);
  }
  return chippedPaint;
}

/** A surface painted twice from one seed, so colour detail and relief line up. */
export interface SurfaceFinish {
  /** Colour detail, tinted by the material colour; null outside a DOM. */
  readonly color: THREE.CanvasTexture | null;
  /** Linear height, also usable as the roughness channel; null outside a DOM. */
  readonly surface: THREE.CanvasTexture | null;
}

/** Applies one metric tile size to both layers; UVs must be in metres (`projectMetricUVs`). */
function finishLayers(color: THREE.CanvasTexture | null, surface: THREE.CanvasTexture | null, tileU: number, tileV: number): SurfaceFinish {
  if (color) color.colorSpace = THREE.SRGBColorSpace;
  color?.repeat.set(1 / tileU, 1 / tileV);
  surface?.repeat.set(1 / tileU, 1 / tileV);
  return { color, surface };
}

interface ParkerizedInks {
  readonly base: string;
  readonly crystal: (level: number) => string;
  readonly cloud: (level: number, alpha: number) => string;
  readonly scratch: string;
}

const PARKERIZED_SIZE = 256;
/** Metres one tile covers: about 0.23 mm per texel, the size of the phosphate crystals. */
const PARKERIZED_TILE = 0.06;

/** Phosphate crystals over blotchy tone, with thin lengthwise wear from handling. */
function paintParkerized(ctx: CanvasRenderingContext2D, inks: ParkerizedInks): void {
  const size = PARKERIZED_SIZE;
  const random = seededRandom(1959);
  ctx.fillStyle = inks.base;
  ctx.fillRect(0, 0, size, size);
  for (let cloud = 0; cloud < 70; cloud++) {
    ctx.fillStyle = inks.cloud(random(), 0.03 + random() * 0.07);
    ctx.fillRect(random() * size, random() * size, 18 + random() * 70, 12 + random() * 50);
  }
  for (let crystal = 0; crystal < 5200; crystal++) {
    ctx.fillStyle = inks.crystal(random());
    ctx.fillRect(random() * size, random() * size, 1 + random() * 1.4, 1 + random() * 1.4);
  }
  ctx.fillStyle = inks.scratch;
  for (let scratch = 0; scratch < 16; scratch++) {
    ctx.fillRect(random() * size, random() * size, 14 + random() * 60, 0.7);
  }
}

let parkerized: SurfaceFinish | undefined;

/** Matte grey-green phosphate finish of military steel. */
export function parkerizedFinish(): SurfaceFinish {
  if (parkerized) return parkerized;
  const size = PARKERIZED_SIZE;
  const color = canvasTexture(size, size, (ctx) => paintParkerized(ctx, {
    base: 'rgb(238, 240, 234)',
    crystal: (level) => `rgb(${214 + Math.floor(level * 41)}, ${216 + Math.floor(level * 39)}, ${208 + Math.floor(level * 42)})`,
    cloud: (level, alpha) => `rgba(${level < 0.6 ? '70, 74, 66' : '255, 255, 250'}, ${alpha})`,
    scratch: 'rgba(255, 255, 255, 0.4)',
  }));
  // Scratches burnish the crystals flat, so they read smoother and lower.
  const surface = canvasTexture(size, size, (ctx) => paintParkerized(ctx, {
    base: 'rgb(180, 180, 180)',
    crystal: (level) => {
      const value = 138 + Math.floor(level * 88);
      return `rgb(${value}, ${value}, ${value})`;
    },
    cloud: (level, alpha) => `rgba(${level < 0.6 ? '110, 110, 110' : '215, 215, 215'}, ${alpha})`,
    scratch: 'rgba(92, 92, 92, 0.75)',
  }));
  parkerized = finishLayers(color, surface, PARKERIZED_TILE, PARKERIZED_TILE);
  return parkerized;
}

interface WalnutInks {
  readonly base: string;
  readonly band: (alpha: number) => string | null;
  readonly line: (alpha: number) => string;
  readonly streak: (alpha: number) => string;
  readonly pore: (alpha: number) => string;
  readonly ding: string | null;
}

const WALNUT_WIDTH = 1024;
const WALNUT_HEIGHT = 256;
/** Metres one tile covers: long enough that a stock shows little repetition. */
const WALNUT_TILE_U = 0.62;
const WALNUT_TILE_V = 0.155;

/**
 * Oiled walnut, tiling both ways: broad tone bands, nested cathedral arches,
 * straight latewood, a few black mineral streaks and the open pores that make
 * walnut read at arm's length. `scale` shrinks the canvas, never the layout.
 */
function paintWalnut(ctx: CanvasRenderingContext2D, scale: number, inks: WalnutInks): void {
  const width = WALNUT_WIDTH;
  const height = WALNUT_HEIGHT;
  const random = seededRandom(1957);
  /** Rect wrapped vertically so the tile has no seam across the grain. */
  const rect = (x: number, y: number, w: number, h: number): void => {
    const wrapped = ((y % height) + height) % height;
    ctx.fillRect(x * scale, wrapped * scale, w * scale, h * scale);
    if (wrapped + h > height) ctx.fillRect(x * scale, (wrapped - height) * scale, w * scale, h * scale);
  };
  /** A grain line across the whole tile, in short rects. */
  const trace = (thickness: number, yAt: (x: number) => number): void => {
    for (let x = 0; x < width; x += 4) rect(x, yAt(x) - thickness / 2, 4, thickness);
  };

  ctx.fillStyle = inks.base;
  ctx.fillRect(0, 0, width * scale, height * scale);
  for (let band = 0; band < 16; band++) {
    const style = inks.band(0.05 + random() * 0.13);
    const y = random() * height;
    const h = 6 + random() * 30;
    if (!style) continue;
    ctx.fillStyle = style;
    rect(0, y, width, h);
  }
  // Cathedrals: arches of nested lines meeting in points, repeating along the board.
  for (let group = 0; group < 6; group++) {
    const center = random() * height;
    const arches = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI;
    const rise = 12 + random() * 20;
    const spacing = 3.5 + random() * 4;
    for (let ring = 0; ring < 9; ring++) {
      const alpha = 0.1 + random() * 0.18;
      const thickness = 0.7 + random() * 1.3;
      const shrink = 1 - ring * 0.08;
      ctx.fillStyle = inks.line(alpha);
      trace(thickness, (x) => {
        const arch = 1 - Math.abs(Math.sin((Math.PI * arches * x) / width + phase));
        return center + ring * spacing - rise * shrink * arch * arch;
      });
    }
  }
  // Straight latewood wandering a little along the board.
  for (let line = 0; line < 120; line++) {
    const y0 = random() * height;
    const amplitude = 0.5 + random() * 2.4;
    const cycles = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    const thickness = 0.6 + random() * 1.5;
    ctx.fillStyle = inks.line(0.06 + random() * 0.2);
    trace(thickness, (x) => y0 + Math.sin((Math.PI * 2 * cycles * x) / width + phase) * amplitude);
  }
  // Mineral streaks taper in and out instead of crossing the whole tile.
  for (let streak = 0; streak < 9; streak++) {
    const y0 = random() * height;
    const start = random() * width;
    const length = 180 + random() * 420;
    const peak = 1.6 + random() * 2.8;
    ctx.fillStyle = inks.streak(0.22 + random() * 0.26);
    for (let step = 0; step < length; step += 4) {
      const thickness = peak * Math.sin((Math.PI * step) / length);
      rect((start + step) % width, y0 + Math.sin(step * 0.012) * 2.5 - thickness / 2, 4, thickness);
    }
  }
  for (let pore = 0; pore < 1500; pore++) {
    ctx.fillStyle = inks.pore(0.14 + random() * 0.3);
    rect(random() * width, random() * height, 4 + random() * 13, 0.9 + random() * 0.8);
  }
  if (inks.ding) ctx.fillStyle = inks.ding;
  for (let ding = 0; ding < 18; ding++) {
    const x = random() * width;
    const y = random() * height;
    const w = 3 + random() * 12;
    const h = 1 + random() * 1.5;
    if (inks.ding) rect(x, y, w, h);
  }
}

let walnut: SurfaceFinish | undefined;

/** Oiled walnut: `color` tinted by the material, `surface` for the open-pore relief. */
export function walnutFinish(): SurfaceFinish {
  if (walnut) return walnut;
  const color = canvasTexture(WALNUT_WIDTH, WALNUT_HEIGHT, (ctx) => paintWalnut(ctx, 1, {
    base: '#f3e6d6',
    band: (alpha) => `rgba(120, 72, 42, ${alpha})`,
    line: (alpha) => `rgba(84, 44, 22, ${alpha})`,
    streak: (alpha) => `rgba(40, 20, 10, ${alpha})`,
    pore: (alpha) => `rgba(36, 18, 9, ${alpha})`,
    ding: 'rgba(255, 238, 214, 0.22)',
  }));
  const surface = canvasTexture(WALNUT_WIDTH / 2, WALNUT_HEIGHT / 2, (ctx) => paintWalnut(ctx, 0.5, {
    base: 'rgb(205, 205, 205)',
    band: () => null,
    line: (alpha) => `rgba(0, 0, 0, ${alpha * 0.45})`,
    streak: (alpha) => `rgba(0, 0, 0, ${alpha * 0.3})`,
    pore: (alpha) => `rgba(0, 0, 0, ${Math.min(1, alpha * 1.7)})`,
    ding: null,
  }));
  walnut = finishLayers(color, surface, WALNUT_TILE_U, WALNUT_TILE_V);
  return walnut;
}

let woodGrain: THREE.CanvasTexture | null | undefined;

/**
 * Birch grain tinted by the material color: long wavy latewood lines,
 * broad growth bands and sparse pores. Extrusion UVs are in meters, so the
 * repeat maps one tile to 42 x 10.5 cm with the grain along the furniture.
 */
export function woodGrainTexture(): THREE.CanvasTexture | null {
  if (woodGrain !== undefined) return woodGrain;
  const random = seededRandom(47);
  woodGrain = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#efe6dc';
    ctx.fillRect(0, 0, 512, 128);
    for (let band = 0; band < 9; band++) {
      ctx.fillStyle = `rgba(150, 92, 55, ${0.04 + random() * 0.06})`;
      ctx.fillRect(0, random() * 128, 512, 4 + random() * 14);
    }
    for (let line = 0; line < 70; line++) {
      const y0 = random() * 128;
      const amplitude = 0.6 + random() * 2.6;
      const frequency = (Math.PI * 2 * (1 + Math.floor(random() * 3))) / 512;
      const phase = random() * Math.PI * 2;
      const thickness = 0.6 + random() * 1.8;
      ctx.fillStyle = `rgba(96, 52, 28, ${0.05 + random() * 0.16})`;
      // Short rects instead of paths: cheap, and smoothed by texture filtering.
      for (let x = 0; x < 512; x += 2) {
        const y = y0 + Math.sin(x * frequency + phase) * amplitude + Math.sin(x * frequency * 3.1 + phase) * amplitude * 0.3;
        ctx.fillRect(x, y - thickness / 2, 2, thickness);
      }
    }
    for (let pore = 0; pore < 260; pore++) {
      ctx.fillStyle = `rgba(70, 36, 18, ${0.08 + random() * 0.14})`;
      ctx.fillRect(random() * 512, random() * 128, 2 + random() * 5, 0.8);
    }
  });
  if (woodGrain) {
    woodGrain.colorSpace = THREE.SRGBColorSpace;
    woodGrain.repeat.set(1 / 0.42, 1 / 0.105);
  }
  return woodGrain;
}
