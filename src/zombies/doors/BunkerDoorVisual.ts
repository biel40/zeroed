import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { projectBoxUVs } from '../maps/BurnedMansionMaterials';
import { makeSoftDotTexture } from './BuyableDoorVisual';
import type { DoorOpeningState } from './PointDoorView';

/** Burned Mansion walls are 0.3 m thick; leaf details stay inside so it can pocket into the wall. */
const WALL_HALF_THICK = 0.15;
const FRAME_WIDTH = 0.12;
const FRAME_DEPTH = 0.04;
const BORDER = 0.07;
const WHEEL_Y = -0.06;
const SLOT_Y = 0.8;
const PLATE_Y = -0.56;
const BEACON_Y_OFFSET = 0.24;

/** Opening timeline as fractions of the sealed door's opening progress. */
const WHEEL_START = 0.04;
const WHEEL_END = 0.42;
const STEAM_AT = 0.4;
const SLIDE_START = 0.48;
const STEAM_LIFE = 1.3;

const RED = new THREE.Color(0xff2a14);
const AMBER = new THREE.Color(0xffa224);
const GREEN = new THREE.Color(0x3cff72);

export interface BunkerDoorVisualOptions {
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly cost: number;
  readonly reducedEffects?: boolean;
}

interface SteamPuff {
  readonly sprite: THREE.Sprite;
  readonly velocity: THREE.Vector3;
  life: number;
}

/**
 * Presentation for the sealed nuclear bunker door: a painted blast door with
 * a red valve wheel, locking bolts and a red-lit vision slot on both faces,
 * inside a hazard-striped frame with a warning beacon. Opening spins the
 * wheel, retracts the bolts, vents steam and pockets the leaf into the wall.
 * The leaf is the door collider owned by `PointDoorView`; the frame, beacons
 * and steam live in `group` and never move.
 */
export class BunkerDoorVisual {
  readonly group = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly bolts: THREE.Mesh[] = [];
  private readonly beaconMaterial: THREE.MeshBasicMaterial;
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly slotMaterial: THREE.MeshBasicMaterial;
  private readonly plateMaterial: THREE.MeshBasicMaterial;
  private readonly steam: SteamPuff[] = [];
  private readonly leafBaseY: number;
  private time = 0;
  private steamReleased = false;

  constructor(private readonly leaf: THREE.Mesh, private readonly options: BunkerDoorVisualOptions) {
    const { width, height, thickness } = options;
    this.leafBaseY = leaf.position.y;
    const face = thickness / 2;

    const edgeSteel = new THREE.MeshStandardMaterial({ color: 0x4a5154, roughness: 0.45, metalness: 0.6 });
    const paint = new THREE.MeshStandardMaterial({
      map: makePaintTexture(),
      roughness: 0.78,
      metalness: 0.22,
    });
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z. Both faces read correctly.
    leaf.material = [edgeSteel, edgeSteel, edgeSteel, edgeSteel, paint, paint];

    const detailSteel = new THREE.MeshStandardMaterial({ color: 0x5b6264, roughness: 0.5, metalness: 0.5 });
    const leafDetails = new THREE.Mesh(this.buildLeafDetailGeometry(), detailSteel);
    leafDetails.castShadow = true;
    leafDetails.receiveShadow = true;

    this.slotMaterial = new THREE.MeshBasicMaterial({ color: 0x9a1208, toneMapped: false });
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, thickness + 0.05), this.slotMaterial);
    slot.position.y = SLOT_Y;
    slot.userData.mapRole = 'bunker-red-leak';

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x9a2d1d, roughness: 0.55, metalness: 0.3 });
    const boltMaterial = new THREE.MeshStandardMaterial({ color: 0xa3a9ab, roughness: 0.32, metalness: 0.65 });
    this.plateMaterial = new THREE.MeshBasicMaterial({
      map: makeCostPlateTexture(options.cost),
      transparent: true,
      toneMapped: false,
    });
    const wheelGeometry = buildWheelGeometry();
    const boltGeometry = buildBoltGeometry(width);
    const plateGeometry = new THREE.PlaneGeometry(0.5, 0.2);
    leaf.add(leafDetails, slot);
    for (const side of [1, -1]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(0, WHEEL_Y, side * (face + 0.05));
      wheel.castShadow = true;
      this.wheels.push(wheel);

      const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
      bolt.position.set(0, WHEEL_Y, side * (face + 0.02));
      this.bolts.push(bolt);

      const plate = new THREE.Mesh(plateGeometry, this.plateMaterial);
      plate.position.set(0, PLATE_Y, side * (face + 0.004));
      if (side < 0) plate.rotation.y = Math.PI;
      leaf.add(wheel, bolt, plate);
    }

    const frame = new THREE.Mesh(
      buildFrameGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: makeHazardTexture(), roughness: 0.7, metalness: 0.2 }),
    );
    frame.receiveShadow = true;
    const housing = new THREE.Mesh(buildBeaconHousingGeometry(height), edgeSteel);
    this.beaconMaterial = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
    this.haloMaterial = new THREE.SpriteMaterial({
      map: makeSoftDotTexture(),
      color: RED,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const lensGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12);
    this.group.add(frame, housing);
    for (const side of [1, -1]) {
      const lensY = height + BEACON_Y_OFFSET + 0.085;
      const lensZ = side * (WALL_HALF_THICK + 0.05);
      const lens = new THREE.Mesh(lensGeometry, this.beaconMaterial);
      lens.position.set(0, lensY, lensZ);
      const halo = new THREE.Sprite(this.haloMaterial);
      halo.position.set(0, lensY, lensZ + side * 0.03);
      halo.scale.setScalar(0.5);
      this.group.add(lens, halo);
    }

    const steamMaterial = new THREE.SpriteMaterial({
      map: makeSoftDotTexture(),
      color: 0xb9bebe,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const steamCount = options.reducedEffects ? 4 : 10;
    for (let index = 0; index < steamCount; index++) {
      const sprite = new THREE.Sprite(steamMaterial.clone());
      sprite.visible = false;
      this.steam.push({ sprite, velocity: new THREE.Vector3(), life: 0 });
      this.group.add(sprite);
    }
  }

  update(dt: number, state: DoorOpeningState, progress: number): void {
    this.time += dt;
    this.updateSteam(dt);
    if (state === 'CLOSED') {
      this.updateIdle();
      return;
    }
    if (state === 'OPEN') {
      this.setBeacon(GREEN, 0.9);
      return;
    }

    const flash = 0.45 + 0.55 * Math.max(0, Math.sin(this.time * 15));
    this.setBeacon(AMBER, flash);
    const unlock = smoothstep(WHEEL_START, WHEEL_END, progress);
    for (const wheel of this.wheels) wheel.rotation.z = -unlock * Math.PI * 3;
    for (const bolt of this.bolts) bolt.scale.x = 1 - unlock * 0.58;
    this.slotMaterial.color.setRGB(0.6 + unlock * 0.4, 0.07 + unlock * 0.12, 0.03);
    if (!this.steamReleased && progress >= STEAM_AT) this.releaseSteam();

    // The seal shudders while the bolts work, then the leaf rolls into the wall pocket.
    const shake = progress < SLIDE_START ? 0.004 * Math.sin(progress * 40) : 0;
    const slide = smoothstep(SLIDE_START, 1, progress);
    this.leaf.position.set(
      slide * (this.options.width + 0.04) + shake * Math.sin(this.time * 83),
      this.leafBaseY + shake * Math.cos(this.time * 71),
      0,
    );
  }

  reset(): void {
    this.time = 0;
    this.steamReleased = false;
    this.leaf.position.set(0, this.leafBaseY, 0);
    for (const wheel of this.wheels) wheel.rotation.z = 0;
    for (const bolt of this.bolts) bolt.scale.x = 1;
    for (const puff of this.steam) puff.sprite.visible = false;
    this.updateIdle();
  }

  /** Slow warning blink, a flickering red slot and a faint plate pulse while sealed. */
  private updateIdle(): void {
    const blink = Math.pow(Math.max(0, Math.sin(this.time * 2.8)), 3);
    this.setBeacon(RED, 0.3 + blink * 0.7);
    const flicker = 0.8 + 0.2 * Math.sin(this.time * 7.3) * Math.sin(this.time * 2.1);
    this.slotMaterial.color.setRGB(0.6 * flicker, 0.07 * flicker, 0.03 * flicker);
    const plateLevel = 0.85 + 0.15 * Math.max(0, Math.sin(this.time * 2.2));
    this.plateMaterial.color.setRGB(plateLevel, plateLevel, plateLevel);
  }

  private setBeacon(color: THREE.Color, level: number): void {
    this.beaconMaterial.color.copy(color).multiplyScalar(0.25 + level * 0.75);
    this.haloMaterial.color.copy(color);
    this.haloMaterial.opacity = level * 0.65;
  }

  /** Pressure vents from the top seam and the jambs on both faces. */
  private releaseSteam(): void {
    this.steamReleased = true;
    const { width, height } = this.options;
    for (let index = 0; index < this.steam.length; index++) {
      const puff = this.steam[index];
      const side = index % 2 === 0 ? -1 : 1;
      const onTopSeam = index % 4 < 2;
      if (onTopSeam) {
        puff.sprite.position.set(randomRange(-width * 0.4, width * 0.4), height - 0.04, side * 0.2);
      } else {
        puff.sprite.position.set((index % 3 === 0 ? -1 : 1) * width / 2, randomRange(0.4, height - 0.4), side * 0.2);
      }
      puff.velocity.set(randomRange(-0.15, 0.15), randomRange(0.25, 0.5), side * randomRange(0.35, 0.75));
      puff.life = 0;
      puff.sprite.scale.setScalar(0.25);
      puff.sprite.visible = true;
    }
  }

  private updateSteam(dt: number): void {
    for (const puff of this.steam) {
      if (!puff.sprite.visible) continue;
      puff.life += dt;
      const k = Math.min(1, puff.life / STEAM_LIFE);
      puff.sprite.position.addScaledVector(puff.velocity, dt);
      puff.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.4));
      puff.sprite.scale.setScalar(0.25 + k * 0.95);
      (puff.sprite.material as THREE.SpriteMaterial).opacity = 0.42 * (1 - k) * Math.min(1, puff.life * 8);
      if (k >= 1) puff.sprite.visible = false;
    }
  }

  /** Raised border, rivets, slot bezel, wheel boss and bolt keepers for both faces. */
  private buildLeafDetailGeometry(): THREE.BufferGeometry {
    const { width, height, thickness } = this.options;
    const parts: THREE.BufferGeometry[] = [];
    const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number): void => {
      parts.push(geometry.translate(x, y, z));
    };
    const rivet = (): THREE.BufferGeometry => new THREE.CylinderGeometry(0.014, 0.016, 0.014, 6).rotateX(Math.PI / 2);
    for (const side of [1, -1]) {
      const face = side * thickness / 2;
      const borderZ = face + side * 0.0125;
      add(new THREE.BoxGeometry(width, BORDER, 0.025), 0, height / 2 - BORDER / 2, borderZ);
      add(new THREE.BoxGeometry(width, BORDER, 0.025), 0, -height / 2 + BORDER / 2, borderZ);
      add(new THREE.BoxGeometry(BORDER, height - BORDER * 2, 0.025), width / 2 - BORDER / 2, 0, borderZ);
      add(new THREE.BoxGeometry(BORDER, height - BORDER * 2, 0.025), -width / 2 + BORDER / 2, 0, borderZ);

      const rivetZ = face + side * 0.031;
      const insetX = width / 2 - BORDER / 2;
      const insetY = height / 2 - BORDER / 2;
      for (let index = 0; index <= 6; index++) {
        const x = -insetX + (insetX * 2 * index) / 6;
        add(rivet(), x, insetY, rivetZ);
        add(rivet(), x, -insetY, rivetZ);
      }
      for (let index = 1; index < 8; index++) {
        const y = -insetY + (insetY * 2 * index) / 8;
        add(rivet(), insetX, y, rivetZ);
        add(rivet(), -insetX, y, rivetZ);
      }

      add(new THREE.BoxGeometry(0.54, 0.16, 0.02), 0, SLOT_Y, face + side * 0.01);
      add(new THREE.CylinderGeometry(0.13, 0.14, 0.02, 20).rotateX(Math.PI / 2), 0, WHEEL_Y, face + side * 0.01);
      for (const x of [-1, 1]) {
        add(new THREE.BoxGeometry(0.07, 0.13, 0.05), x * (width / 2 - BORDER - 0.04), WHEEL_Y, face + side * 0.025);
      }
    }
    return mergeGeometries(parts);
  }
}

function buildWheelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.27, 0.028, 8, 28)];
  for (let index = 0; index < 3; index++) {
    parts.push(new THREE.BoxGeometry(0.54, 0.032, 0.028).rotateZ((index * Math.PI) / 3));
  }
  parts.push(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 14).rotateX(Math.PI / 2));
  for (let index = 0; index < 6; index++) {
    // Grip knobs make the spin readable at a glance.
    const angle = (index * Math.PI) / 3 + Math.PI / 6;
    parts.push(new THREE.SphereGeometry(0.036, 8, 6).translate(Math.cos(angle) * 0.27, Math.sin(angle) * 0.27, 0));
  }
  return mergeGeometries(parts);
}

/** Two locking bars from the wheel rim to the keepers; x-scale retracts them into the hub. */
function buildBoltGeometry(width: number): THREE.BufferGeometry {
  const inner = 0.24;
  const outer = width / 2 - BORDER - 0.04;
  const length = outer - inner;
  const center = (inner + outer) / 2;
  return mergeGeometries([
    new THREE.BoxGeometry(length, 0.07, 0.03).translate(center, 0, 0),
    new THREE.BoxGeometry(length, 0.07, 0.03).translate(-center, 0, 0),
  ]);
}

/** Hazard-striped trim around the opening on both wall faces. */
function buildFrameGeometry(width: number, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, x: number, y: number, z: number, offset: number): void => {
    const geometry = new THREE.BoxGeometry(w, h, FRAME_DEPTH);
    projectBoxUVs(geometry, w, h, FRAME_DEPTH, 0.32, offset, 0);
    parts.push(geometry.translate(x, y, z));
  };
  for (const side of [1, -1]) {
    const z = side * (WALL_HALF_THICK + FRAME_DEPTH / 2);
    const jambHeight = height + FRAME_WIDTH;
    add(FRAME_WIDTH, jambHeight, -(width + FRAME_WIDTH) / 2, jambHeight / 2, z, 0);
    add(FRAME_WIDTH, jambHeight, (width + FRAME_WIDTH) / 2, jambHeight / 2, z, 0.5);
    add(width, FRAME_WIDTH, 0, height + FRAME_WIDTH / 2, z, 0.25);
  }
  return mergeGeometries(parts);
}

function buildBeaconHousingGeometry(height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const z = side * (WALL_HALF_THICK + 0.05);
    parts.push(new THREE.BoxGeometry(0.16, 0.06, 0.1).translate(0, height + BEACON_Y_OFFSET + 0.02, z));
    // Cage bars around the lens.
    for (const x of [-0.05, 0.05]) {
      parts.push(new THREE.BoxGeometry(0.012, 0.09, 0.012).translate(x, height + BEACON_Y_OFFSET + 0.095, z));
    }
    parts.push(new THREE.BoxGeometry(0.12, 0.012, 0.012).translate(0, height + BEACON_Y_OFFSET + 0.14, z));
  }
  return mergeGeometries(parts);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Deterministic hash noise so every reset and session paints the same wear. */
function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

let paintTexture: THREE.CanvasTexture | null = null;

/** Worn military paint with a radiation emblem and a hazard band, 250 px per metre. */
function makePaintTexture(): THREE.CanvasTexture {
  if (paintTexture) return paintTexture;
  const width = 400;
  const height = 525;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = '#4b5243';
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 90; index++) {
    const shade = hash(index) > 0.5 ? '255,255,240' : '20,18,12';
    ctx.fillStyle = `rgba(${shade},${0.015 + hash(index + 400) * 0.025})`;
    ctx.beginPath();
    ctx.arc(hash(index + 100) * width, hash(index + 200) * height, 14 + hash(index + 300) * 46, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grime builds up towards the floor.
  for (let band = 0; band < 12; band++) {
    ctx.fillStyle = 'rgba(40,28,16,0.05)';
    ctx.fillRect(0, height * (0.55 + band * 0.0375), width, height);
  }
  ctx.fillStyle = 'rgba(190,190,170,0.22)';
  for (let index = 0; index < 26; index++) {
    ctx.fillRect(hash(index + 500) * width, hash(index + 600) * height, 10 + hash(index + 700) * 40, 1);
  }
  // Inner weld seam.
  ctx.strokeStyle = 'rgba(16,16,12,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, width - 68, height - 68);

  // Radiation trefoil above the wheel.
  const cx = width / 2;
  const cy = (1.05 - 0.46) * 250;
  ctx.fillStyle = '#d9b234';
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#191712';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#191712';
  for (let blade = 0; blade < 3; blade++) {
    const center = -Math.PI / 2 + (blade * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 36, center - Math.PI / 6, center + Math.PI / 6);
    ctx.arc(cx, cy, 10, center + Math.PI / 6, center - Math.PI / 6, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  // Hazard band along the bottom.
  const bandTop = (1.05 + 0.79) * 250;
  const bandHeight = 34;
  ctx.fillStyle = '#c9a12d';
  ctx.fillRect(18, bandTop, width - 36, bandHeight);
  ctx.fillStyle = '#1a1a17';
  fillDiagonalStripes(ctx, 18, bandTop, width - 36, bandHeight, 36);

  paintTexture = new THREE.CanvasTexture(canvas);
  paintTexture.colorSpace = THREE.SRGBColorSpace;
  paintTexture.anisotropy = 4;
  return paintTexture;
}

/** 45 degree stripes, half of each period filled, drawn row by row so they clip to the rect. */
function fillDiagonalStripes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  period: number,
): void {
  for (let row = 0; row < height; row++) {
    const shift = (height - row) % period;
    for (let start = x - period + shift; start < x + width; start += period) {
      const left = Math.max(x, start);
      const right = Math.min(x + width, start + period / 2);
      if (right > left) ctx.fillRect(left, y + row, right - left, 1);
    }
  }
}

let hazardTexture: THREE.CanvasTexture | null = null;

/** Seamless 45 degree yellow/black stripes. */
function makeHazardTexture(): THREE.CanvasTexture {
  if (hazardTexture) return hazardTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.fillStyle = '#c29b2c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1b1a17';
  fillDiagonalStripes(ctx, 0, 0, size, size, size / 2);
  hazardTexture = new THREE.CanvasTexture(canvas);
  hazardTexture.wrapS = THREE.RepeatWrapping;
  hazardTexture.wrapT = THREE.RepeatWrapping;
  hazardTexture.colorSpace = THREE.SRGBColorSpace;
  return hazardTexture;
}

/** Riveted stencil plate with the price, readable in the dark hall. */
function makeCostPlateTexture(cost: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 102;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.fillStyle = 'rgba(20, 20, 17, 0.95)';
  ctx.fillRect(0, 0, 256, 102);
  ctx.strokeStyle = '#e0b43c';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 244, 90);
  ctx.fillStyle = '#8a8f88';
  for (const [x, y] of [[16, 16], [240, 16], [16, 86], [240, 86]]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd25e';
  ctx.shadowColor = 'rgba(255, 160, 40, 0.8)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 58px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${cost}`, 128, 54, 220);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
