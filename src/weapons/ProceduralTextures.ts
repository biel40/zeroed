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
