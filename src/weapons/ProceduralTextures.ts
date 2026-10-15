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
