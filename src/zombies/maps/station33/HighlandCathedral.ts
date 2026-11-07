import * as THREE from 'three';
import { placement, StaticMeshBatch } from '../shared/StaticMeshBatch';
import { makeSoftSpot } from './Station33Atmosphere';

/** One snowed ridge of the highlands: a skyline across the whole span at `z`. */
export interface HighlandRidge {
  readonly z: number;
  /** Metres over the ground its skyline wanders between. */
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Peaks above this height carry snow. */
  readonly snowLine: number;
  readonly color: number;
  readonly snowColor: number;
  readonly seed: number;
}

/** The mountains on the horizon of a filmed ending, and the cathedral that crowns one of them (`PROTOCOL33_HIGHLANDS`). */
export interface HighlandsConfig {
  /** World X the ridges run across. */
  readonly span: { readonly minX: number; readonly maxX: number };
  /** Ground height every ridge rises from. */
  readonly ground: number;
  /** Far to near. */
  readonly ridges: ReadonlyArray<HighlandRidge>;
  readonly cathedral: {
    /** Index of the ridge it stands on; the ridges behind it dip so it stands against the sky. */
    readonly ridge: number;
    readonly x: number;
    /** Metres over the ground of the flat summit it stands on, above every other point of its ridge. */
    readonly summit: number;
    /** Width of that flat summit, and of the slope either side where it falls back into the ridge. */
    readonly plateau: number;
    readonly shoulder: number;
  };
  /** Moonlit haze over the skyline, fading upwards. */
  readonly sky: { readonly z: number; readonly height: number; readonly color: number };
  /** The moon's halo behind the cathedral, off its centre by `offsetX`. */
  readonly halo: { readonly offsetX: number; readonly height: number; readonly size: number; readonly color: number };
}

/** Metres between two skyline samples. */
const RIDGE_STEP = 6;
/** How far below the ground each ridge's face reaches, under the horizon. */
const RIDGE_FOOT = 30;
/** Coarse and fine noise of a skyline: cell widths in metres, and the fine jag's share of the height range. */
const RIDGE_NOISE = { coarse: 95, fine: 15, jag: 0.14 } as const;
/** How much the ridges behind the cathedral sink around it, and over how wide a span. */
const RIDGE_SADDLE = { depth: 0.6, width: 110 } as const;

const STONE_COLOR = 0x0b1116;
const ROOF_COLOR = 0x2a3644;
const DOME_COLOR = 0x1b252e;
const WINDOW_COLOR = 0xc98a40;

/** Where the cathedral's floor sits: on its summit, on its ridge's line. */
export function cathedralSite(config: HighlandsConfig): { x: number; y: number; z: number } {
  const { cathedral, ridges, ground } = config;
  return { x: cathedral.x, y: ground + cathedral.summit, z: ridges[cathedral.ridge].z };
}

/**
 * Height over the ground of ridge `index` at `x`: smooth peaks with a
 * jagged edge, flattened into the cathedral's summit on its own ridge and
 * sunk into a saddle behind it on the ridges further back.
 */
export function ridgeHeight(config: HighlandsConfig, index: number, x: number): number {
  const ridge = config.ridges[index];
  const range = ridge.maxHeight - ridge.minHeight;
  const coarse = valueNoise(x / RIDGE_NOISE.coarse, ridge.seed);
  const fine = valueNoise(x / RIDGE_NOISE.fine, ridge.seed + 17) - 0.5;
  const natural = ridge.minHeight + range * ((1 - RIDGE_NOISE.jag) * coarse + RIDGE_NOISE.jag * (fine + 0.5));
  const { cathedral } = config;
  const fromSummit = Math.abs(x - cathedral.x);
  if (index === cathedral.ridge) {
    const slope = smoothstep((fromSummit - cathedral.plateau / 2) / cathedral.shoulder);
    return THREE.MathUtils.lerp(cathedral.summit, Math.min(natural, cathedral.summit), slope);
  }
  if (index < cathedral.ridge) {
    const saddle = Math.exp(-((fromSummit / RIDGE_SADDLE.width) ** 2));
    return natural * (1 - RIDGE_SADDLE.depth * saddle);
  }
  return natural;
}

/**
 * The highlands of a filmed ending, far past the fog and drawn without it
 * in flat night tones: the ridges' snowed skylines under a moonlit haze,
 * and a great cathedral on the summit, bell tower west, five onion domes,
 * apse east, a few windows still lit. Hidden until `show`.
 */
export class HighlandCathedral {
  private readonly group = new THREE.Group();

  public constructor(parent: THREE.Object3D, private readonly config: HighlandsConfig) {
    this.group.name = 'highland-cathedral';
    this.group.visible = false;
    const batch = new StaticMeshBatch();
    config.ridges.forEach((ridge, index) => this.addRidge(batch, ridge, index));
    this.addCathedral(batch);
    batch.build(this.group, 'highland-cathedral-static', { castShadow: false, receiveShadow: false });
    this.addSky();
    parent.add(this.group);
  }

  public get visible(): boolean {
    return this.group.visible;
  }

  public show(): void {
    this.group.visible = true;
  }

  public hide(): void {
    this.group.visible = false;
  }

  private addRidge(batch: StaticMeshBatch, ridge: HighlandRidge, index: number): void {
    const { span, ground } = this.config;
    const samples = Math.ceil((span.maxX - span.minX) / RIDGE_STEP);
    const skyline: number[] = [];
    const snowEdge: number[] = [];
    for (let sample = 0; sample <= samples; sample++) {
      const x = span.minX + sample * RIDGE_STEP;
      const height = ridgeHeight(this.config, index, x);
      skyline.push(ground + height);
      const cover = Math.max(0, height - ridge.snowLine) * (0.35 + 0.3 * hash01(sample, ridge.seed + 31));
      snowEdge.push(ground + height - cover);
    }
    const foot = skyline.map(() => ground - RIDGE_FOOT);
    batch.add(stripGeometry(span.minX, RIDGE_STEP, foot, skyline, ridge.z), flatMaterial(`highland_ridge_${index}`, ridge.color));
    // Snow just proud of the face, from the skyline down its ragged edge.
    batch.add(stripGeometry(span.minX, RIDGE_STEP, snowEdge, skyline, ridge.z + 0.5), flatMaterial(`highland_snow_${index}`, ridge.snowColor));
  }

  private addCathedral(batch: StaticMeshBatch): void {
    const site = cathedralSite(this.config);
    const stone = flatMaterial('highland_cathedral_stone', STONE_COLOR);
    const roof = flatMaterial('highland_cathedral_roof', ROOF_COLOR);
    const dome = flatMaterial('highland_cathedral_dome', DOME_COLOR);
    const glass = flatMaterial('highland_cathedral_window', WINDOW_COLOR);
    const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void => {
      batch.add(new THREE.BoxGeometry(width, height, depth), material, placement(site.x + x, site.y + y + height / 2, site.z + z));
    };
    const drum = (x: number, y: number, z: number, radius: number, height: number): void => {
      batch.add(new THREE.CylinderGeometry(radius, radius, height, 16), stone, placement(site.x + x, site.y + y + height / 2, site.z + z));
    };
    const onion = (x: number, y: number, z: number, radius: number, height: number, cross: number): void => {
      batch.add(onionGeometry(radius, height), dome, placement(site.x + x, site.y + y, site.z + z));
      const top = y + height;
      box(stone, x, top, z, cross * 0.09, cross, cross * 0.09);
      box(stone, x, top + cross * 0.62, z, cross * 0.5, cross * 0.08, cross * 0.08);
      batch.add(new THREE.BoxGeometry(cross * 0.32, cross * 0.06, cross * 0.06), stone,
        placement(site.x + x, site.y + top + cross * 0.25, site.z + z, 0, 0, 0.35));
    };
    const gable = (x: number, y: number, z: number, length: number, width: number, rise: number, alongX: boolean): void => {
      const radius = width / Math.sqrt(3);
      const prism = new THREE.CylinderGeometry(radius, radius, length, 3).rotateX(-Math.PI / 2).scale(1, rise / (1.5 * radius), 1);
      if (alongX) prism.rotateY(Math.PI / 2);
      batch.add(prism, roof, placement(site.x + x, site.y + y + rise / 3, site.z + z));
    };

    // The summit's terrace, then the nave along X with the crossing standing taller across it.
    box(stone, 0, -4, 0, 96, 6, 46);
    box(stone, 0, 2, 0, 64, 22, 26);
    gable(0, 24, 0, 64, 26, 7, true);
    box(stone, 4, 2, 0, 26, 26, 40);
    gable(4, 28, 0, 40, 26, 7, false);
    // The apse's half-drum on the east end, under its half-dome.
    drum(32, 2, 0, 11, 18);
    batch.add(new THREE.SphereGeometry(11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), roof, placement(site.x + 32, site.y + 20, site.z));
    // Five domes: the great one over the crossing, four around it on the roofs.
    drum(4, 28, 0, 8.5, 13);
    onion(4, 41, 0, 10.5, 20, 10);
    for (const dx of [-17, 17]) {
      for (const dz of [-9, 9]) {
        drum(4 + dx, 24, dz, 4.5, 8);
        onion(4 + dx, 32, dz, 5.8, 11, 6);
      }
    }
    // The bell tower on the west end: shaft, belfry, tented spire with its own small dome.
    box(stone, -38, 2, 0, 13, 30, 13);
    box(stone, -38, 32, 0, 10, 9, 10);
    batch.add(new THREE.ConeGeometry(7, 20, 4).rotateY(Math.PI / 4), roof, placement(site.x - 38, site.y + 51, site.z));
    onion(-38, 61, 0, 2.6, 5, 6);

    // The few lit windows, all on the side turned to the road: someone keeps a light up there.
    const southPane = (x: number, y: number, faceZ: number, width: number, height: number): void => {
      box(glass, x, y, faceZ + 0.15, width, height, 0.3);
    };
    for (const x of [-26, -18, 18, 26]) southPane(x, 8, 13, 2.2, 6);
    for (const x of [-2, 4, 10]) southPane(x, 10, 20, 2.4, 7);
    for (const x of [-40.5, -35.5]) southPane(x, 34, 5, 2, 5);
    southPane(-38, 18, 6.5, 1.5, 3);
    for (const angle of [-0.9, -0.3, 0.3, 0.9]) {
      batch.add(new THREE.BoxGeometry(1.4, 5, 0.3), glass,
        placement(site.x + 4 + Math.sin(angle) * 8.6, site.y + 32.5, site.z + Math.cos(angle) * 8.6, 0, angle, 0));
    }
  }

  /** The haze over the skyline, brightest at the horizon, and the moon's halo behind the cathedral. */
  private addSky(): void {
    const { span, ground, sky, halo } = this.config;
    const site = cathedralSite(this.config);
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(span.maxX - span.minX, sky.height), glowMaterial('highland_sky', sky.color, verticalFade(64)));
    haze.position.set((span.minX + span.maxX) / 2, ground - RIDGE_FOOT + sky.height / 2, sky.z);
    haze.name = 'highland-sky';
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(halo.size, halo.size), glowMaterial('highland_halo', halo.color, makeSoftSpot(64)));
    moon.position.set(site.x + halo.offsetX, ground + halo.height, sky.z + 5);
    moon.name = 'highland-halo';
    this.group.add(haze, moon);
  }
}

/** A vertical face between `bottom` and `top` (one height per sample, `step` apart from `startX`), facing south. */
function stripGeometry(startX: number, step: number, bottom: ReadonlyArray<number>, top: ReadonlyArray<number>, z: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let sample = 0; sample < top.length - 1; sample++) {
    const x0 = startX + sample * step;
    const x1 = x0 + step;
    positions.push(
      x0, bottom[sample], z, x1, bottom[sample + 1], z, x1, top[sample + 1], z,
      x0, bottom[sample], z, x1, top[sample + 1], z, x0, top[sample], z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, index) => (index % 3 === 2 ? 1 : 0)), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  return geometry;
}

/** An onion dome from its base ring (radius) up to its tip. */
function onionGeometry(radius: number, height: number): THREE.LatheGeometry {
  const profile: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [1.12, 0.18], [1.15, 0.33], [1, 0.5], [0.65, 0.68], [0.3, 0.82], [0.1, 0.93], [0, 1],
  ];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius, y * height)), 16);
}

/** Unlit and untouched by fog: the highlands keep their own night tones however thick the yard's air is. */
function flatMaterial(name: string, color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ name, color, fog: false });
}

function glowMaterial(name: string, color: number, map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name, color, map, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** White texture, opaque along its bottom row and fading out towards its top. */
function verticalFade(rows: number): THREE.DataTexture {
  const data = new Uint8Array(rows * 4);
  for (let row = 0; row < rows; row++) {
    data.fill(255, row * 4, row * 4 + 3);
    data[row * 4 + 3] = Math.round((1 - row / (rows - 1)) ** 1.8 * 255);
  }
  const texture = new THREE.DataTexture(data, 1, rows, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Smooth noise in 0..1 along `position` (cell units), repeatable per `seed`. */
function valueNoise(position: number, seed: number): number {
  const cell = Math.floor(position);
  const t = position - cell;
  return THREE.MathUtils.lerp(hash01(cell, seed), hash01(cell + 1, seed), t * t * (3 - 2 * t));
}

function hash01(index: number, seed: number): number {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
