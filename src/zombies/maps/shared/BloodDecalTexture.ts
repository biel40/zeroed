import * as THREE from 'three';
import { seededRandom, valueNoise } from './ProceduralNoise';

/** Wall blood shapes: an impact spray with runs, or a dragged handprint. */
export type BloodDecalKind = 'splatter' | 'smear';

type Rgb = readonly [number, number, number];

const SIZE = 256;
/** Thin film where blood spread out: dried red-brown. */
const THIN_BLOOD: Rgb = [98, 16, 11];
/** Pooled, clotted blood: almost black maroon. */
const THICK_BLOOD: Rgb = [34, 4, 4];
/** Overlapping strokes pile up as thicker blood, capped here. */
const MAX_DENSITY = 1.6;
/** Texels per cell of the low-frequency noise that blotches the film. */
const MOTTLE_CELL = 14;

/** Blood thickness per texel; row 0 is the bottom of the wall patch. */
class BloodField {
  readonly density = new Float32Array(SIZE * SIZE);

  private deposit(x: number, y: number, amount: number, additive: boolean): void {
    const index = y * SIZE + x;
    // Max keeps one stroke uniform; only crossing blobs thicken.
    this.density[index] = additive
      ? Math.min(MAX_DENSITY, this.density[index] + amount)
      : Math.max(this.density[index], amount);
  }

  /** Adds a soft-edged drop of blood. Coordinates and radius in texels. */
  drop(cx: number, cy: number, radius: number, amount: number): void {
    const minX = Math.max(0, Math.floor(cx - radius - 1));
    const maxX = Math.min(SIZE - 1, Math.ceil(cx + radius + 1));
    const minY = Math.max(0, Math.floor(cy - radius - 1));
    const maxY = Math.min(SIZE - 1, Math.ceil(cy + radius + 1));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const coverage = THREE.MathUtils.clamp(radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5, 0, 1);
        if (coverage > 0) this.deposit(x, y, coverage * amount, false);
      }
    }
  }

  /** Drop along a segment, radius and amount interpolated end to end. */
  stroke(ax: number, ay: number, bx: number, by: number, radiusA: number, radiusB: number, amountA: number, amountB: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.6));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      this.drop(ax + (bx - ax) * t, ay + (by - ay) * t, radiusA + (radiusB - radiusA) * t, amountA + (amountB - amountA) * t);
    }
  }

  /** Irregular lobed pool, thicker towards its middle; stacks on what is there. */
  blob(cx: number, cy: number, radius: number, amount: number, random: () => number): void {
    const phases = [random(), random(), random()].map((value) => value * Math.PI * 2);
    const reach = radius * 1.5;
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(SIZE - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(SIZE - 1, Math.ceil(cx + reach)); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const angle = Math.atan2(dy, dx);
        const edge = radius * (1 + 0.22 * Math.sin(3 * angle + phases[0]) + 0.13 * Math.sin(5 * angle + phases[1])
          + 0.07 * Math.sin(11 * angle + phases[2]));
        const inside = edge - Math.hypot(dx, dy);
        if (inside > 0) this.deposit(x, y, amount * Math.min(1, inside / 4) * (0.7 + 0.5 * Math.min(1, inside / edge)), true);
      }
    }
  }

  /** Gravity run: wobbles down, thins out and ends in a heavier bead. */
  run(x: number, y: number, length: number, radius: number, random: () => number): void {
    let currentX = x;
    const segments = Math.ceil(length / 6);
    for (let segment = 0; segment < segments; segment++) {
      const t = segment / segments;
      const nextX = currentX + (random() - 0.5) * 1.4;
      const nextY = y - length * (segment + 1) / segments;
      const width = radius * (1 - t * 0.5);
      this.stroke(currentX, y - length * t, nextX, nextY, width, width * 0.95, 0.95, 0.95);
      currentX = nextX;
    }
    this.drop(currentX, y - length, radius * 1.25, 1);
  }
}

/** Impact spray: irregular pool, short tapered spatter, flecks and runs. */
function paintSplatter(field: BloodField, random: () => number): void {
  const cx = SIZE * (0.47 + random() * 0.06);
  const cy = SIZE * 0.64;
  const baseRadius = SIZE * 0.11;
  field.blob(cx, cy, baseRadius, 1, random);
  for (let lobe = 0; lobe < 3; lobe++) {
    const angle = random() * Math.PI * 2;
    field.blob(cx + Math.cos(angle) * baseRadius * 0.8, cy + Math.sin(angle) * baseRadius * 0.7, baseRadius * (0.35 + random() * 0.2), 0.8, random);
  }

  for (let spike = 0; spike < 9; spike++) {
    const angle = random() * Math.PI * 2;
    const startX = cx + Math.cos(angle) * baseRadius * 0.7;
    const startY = cy + Math.sin(angle) * baseRadius * 0.7;
    const length = baseRadius * (0.5 + random() * 0.8);
    const tipX = startX + Math.cos(angle) * length;
    const tipY = startY + Math.sin(angle) * length;
    field.stroke(startX, startY, tipX, tipY, 2.5 + random() * 2.5, 0.5, 0.9, 0.55);
    field.drop(tipX + Math.cos(angle) * 3, tipY + Math.sin(angle) * 3, 1 + random() * 1.8, 0.8);
  }

  for (let droplet = 0; droplet < 55; droplet++) {
    const angle = random() * Math.PI * 2;
    const distance = baseRadius * (1.1 + Math.pow(random(), 1.6) * 2.6);
    field.drop(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance * 0.85, 0.6 + random() * 1.8, 0.75);
  }

  const runs = 5 + Math.floor(random() * 3);
  for (let index = 0; index < runs; index++) {
    const startX = cx + (random() - 0.5) * baseRadius * 1.6;
    field.run(startX, cy - baseRadius * (0.3 + random() * 0.4), SIZE * (0.1 + random() * 0.4), 1.4 + random() * 1.4, random);
  }
}

/** A bloodied hand dragged sideways down the wall, fingers fading out. */
function paintSmear(field: BloodField, random: () => number): void {
  const startX = SIZE * 0.22;
  const startY = SIZE * 0.64;
  const endX = SIZE * 0.86;
  const endY = SIZE * 0.5;
  const length = Math.hypot(endX - startX, endY - startY);
  const normalX = -(endY - startY) / length;
  const normalY = (endX - startX) / length;

  // Palm print where the hand first hit the wall.
  field.blob(startX, startY, 17, 1, random);

  const fingers = 4;
  for (let finger = 0; finger < fingers; finger++) {
    const offset = (finger - (fingers - 1) / 2) * 8.5 + (random() - 0.5) * 2;
    const reach = 0.75 + random() * 0.25;
    const segments = 80;
    for (let segment = 0; segment <= segments; segment++) {
      const t = (segment / segments) * reach;
      const sag = Math.sin(t * Math.PI) * 6;
      const x = startX + (endX - startX) * t + normalX * offset;
      const y = startY + (endY - startY) * t + normalY * offset - sag;
      field.drop(x, y, 5 - t * 2.4, 1 - t * 0.8);
    }
  }

  const runs = 4 + Math.floor(random() * 3);
  for (let index = 0; index < runs; index++) {
    const t = random() * 0.35;
    const x = startX + (endX - startX) * t + normalX * (random() - 0.5) * 24;
    const y = startY + (endY - startY) * t - 12;
    field.run(x, y, SIZE * (0.08 + random() * 0.3), 1.4 + random() * 1.1, random);
  }
}

/** Procedural blood decal: thin edges read red-brown, pooled blood near black. */
export function makeBloodDecalTexture(kind: BloodDecalKind, seed: number): THREE.DataTexture {
  const random = seededRandom(seed);
  const field = new BloodField();
  if (kind === 'splatter') paintSplatter(field, random);
  else paintSmear(field, random);

  // Blood never dries evenly: blotch the film so thin areas break up.
  const mottle = valueNoise(random, MOTTLE_CELL, SIZE);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let index = 0; index < field.density.length; index++) {
    const density = field.density[index] * (0.65 + 0.55 * mottle(index % SIZE, Math.floor(index / SIZE)));
    const thickness = THREE.MathUtils.smoothstep(density, 0.35, 1.3);
    const grain = 0.88 + random() * 0.24;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel++) {
      const value = THIN_BLOOD[channel] + (THICK_BLOOD[channel] - THIN_BLOOD[channel]) * thickness;
      data[offset + channel] = Math.round(THREE.MathUtils.clamp(value * grain, 0, 255));
    }
    data[offset + 3] = Math.round(THREE.MathUtils.smoothstep(density, 0.06, 0.45) * 235);
  }

  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Smooth drips: DataTexture defaults to nearest sampling without mipmaps.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
