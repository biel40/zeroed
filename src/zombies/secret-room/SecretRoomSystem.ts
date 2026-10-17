import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import {
  MANSION_BUNKER_Y,
  MANSION_RITUAL_CIRCLE,
  MANSION_SECRET_ROOM,
  MANSION_SOUL_LAMPS,
  SOUL_LAMP_CAPTURE_RADIUS,
  SOUL_LAMP_REQUIRED_SOULS,
} from '../maps/BurnedMansionConfig';
import { SecretRoomState } from './SecretRoomState';

const MAX_TRAVELLING_SOULS = 24;
const TRAIL_POINTS_PER_SOUL = 2;
const MAX_SPARKS = 24;
const DOOR_OPEN_DURATION = 1.8;
const HIDDEN_POINT = -1000;
const RITUAL_TEXTURE_SIZE = 256;
/** Apparition art is drawn in 128x256 design units, rasterised at this scale. */
const APPARITION_DESIGN_WIDTH = 128;
const APPARITION_DESIGN_HEIGHT = 256;
const APPARITION_TEXTURE_SCALE = 2;
/** Sprite anchor on the figure's eye line (texture rows counted from the bottom). */
const APPARITION_EYE_ANCHOR = 1 - 55 / APPARITION_DESIGN_HEIGHT;
const APPARITION_WIDTH = 1.15;
const APPARITION_HEIGHT = 2.3;
/** The figure looms slightly above a standing player's eyes once risen. */
const APPARITION_RISEN_EYE_Y = MANSION_BUNKER_Y + 1.88;
const APPARITION_RISE_DURATION = 0.16;
/** Stops just beyond the near plane so the face fills the view. */
const APPARITION_FACE_DISTANCE = 0.4;
/** Closest the figure rises to the viewer, so the charge always covers ground. */
const APPARITION_MIN_CHARGE = 1.3;
const RITUAL_IDLE_EMISSIVE = new THREE.Color(0x4a0604);
const RITUAL_SCARE_EMISSIVE = new THREE.Color(0xff1a08);

/**
 * Ritual scare beats, seconds after activation; `playRitualScare` schedules
 * its sound on the same beats. Candles choke out until `strike`, the circle
 * erupts and the figure rises, it twitches until `lunge`, charges the viewer
 * to reach their face at `impact`, cuts to black at `vanish` and the circle
 * smoulders back to idle by `end`.
 */
export const RITUAL_SCARE_TIMELINE = {
  strike: 0.6,
  lunge: 0.98,
  impact: 1.2,
  vanish: 1.55,
  end: 2.9,
} as const;

export interface SecretRoomSnapshot {
  readonly lamps: readonly { readonly activated: boolean; readonly currentSouls: number;
    readonly completed: boolean }[];
  readonly unlocked: boolean;
  readonly doorOpen: boolean;
  readonly ritualScareTriggered: boolean;
}

function makeRitualTexture(): THREE.DataTexture {
  const size = RITUAL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  let seed = 0x51a7;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const stamp = (x: number, y: number, radius: number, strength: number): void => {
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(size - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(size - 1, Math.ceil(y + radius));
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const distance = Math.hypot(px - x, py - y);
        if (distance > radius) continue;
        const offset = (py * size + px) * 4;
        const worn = random() > 0.16 ? 1 : random() * 0.28;
        const alpha = Math.round((1 - distance / radius) * strength * worn);
        data[offset] = 84 + Math.round(random() * 28);
        data[offset + 1] = 14 + Math.round(random() * 11);
        data[offset + 2] = 10 + Math.round(random() * 8);
        data[offset + 3] = Math.max(data[offset + 3], alpha);
      }
    }
  };
  const line = (fromX: number, fromY: number, toX: number, toY: number, width: number): void => {
    const length = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.ceil(length * 1.35);
    for (let step = 0; step <= steps; step++) {
      if (random() < 0.075) continue;
      const t = step / steps;
      stamp(
        fromX + (toX - fromX) * t + (random() - 0.5) * 1.8,
        fromY + (toY - fromY) * t + (random() - 0.5) * 1.8,
        width * (0.65 + random() * 0.55),
        150 + random() * 90,
      );
    }
  };

  const center = size / 2;
  for (const radius of [102, 91]) {
    let previousX = center + radius;
    let previousY = center;
    for (let segment = 1; segment <= 96; segment++) {
      const angle = segment / 96 * Math.PI * 2;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      line(previousX, previousY, x, y, radius === 102 ? 3.2 : 2.2);
      previousX = x;
      previousY = y;
    }
  }
  const points = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    return [center + Math.cos(angle) * 84, center + Math.sin(angle) * 84] as const;
  });
  for (let index = 0; index < 5; index++) {
    const from = points[index];
    const to = points[(index + 2) % 5];
    line(from[0], from[1], to[0], to[1], 4.2);
  }
  for (let index = 0; index < 90; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 30 + random() * 82;
    stamp(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius, 0.8 + random() * 2.5, 30 + random() * 75);
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type Rgb = readonly [number, number, number];

/**
 * Gaunt, pale figure with blazing pupils, a gaping fanged mouth and long
 * clawed arms hanging at its sides, painted back to front in design units
 * (y grows downwards). Opaque on purpose: it must read in a dark bunker.
 */
function makeApparitionTexture(): THREE.DataTexture {
  const scale = APPARITION_TEXTURE_SCALE;
  const width = APPARITION_DESIGN_WIDTH * scale;
  const height = APPARITION_DESIGN_HEIGHT * scale;
  const red = new Float32Array(width * height);
  const green = new Float32Array(width * height);
  const blue = new Float32Array(width * height);
  const alpha = new Float32Array(width * height);
  let seed = 0x6a05;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  /** Visits every texel whose center lies in a design-unit rectangle. */
  const area = (minX: number, minY: number, maxX: number, maxY: number,
    visit: (x: number, y: number, index: number) => void): void => {
    const toX = Math.min(width - 1, Math.ceil(maxX * scale));
    const toY = Math.min(height - 1, Math.ceil(maxY * scale));
    for (let py = Math.max(0, Math.floor(minY * scale)); py <= toY; py++) {
      for (let px = Math.max(0, Math.floor(minX * scale)); px <= toX; px++) {
        visit((px + 0.5) / scale, (py + 0.5) / scale, py * width + px);
      }
    }
  };
  const blend = (index: number, color: Rgb, coverage: number): void => {
    if (coverage <= 0) return;
    const below = alpha[index] * (1 - coverage);
    const result = coverage + below;
    red[index] = (color[0] * coverage + red[index] * below) / result;
    green[index] = (color[1] * coverage + green[index] * below) / result;
    blue[index] = (color[2] * coverage + blue[index] * below) / result;
    alpha[index] = result;
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: Rgb, opacity: number,
    shade = 0): void => {
    area(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, index) => {
      const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (distance >= 1) return;
      const darken = 1 - shade * distance * distance;
      blend(index, [color[0] * darken, color[1] * darken, color[2] * darken],
        Math.min(1, (1 - distance) * Math.min(rx, ry) * scale / 1.2) * opacity);
    });
  };
  const stroke = (fromX: number, fromY: number, toX: number, toY: number, fromWidth: number, toWidth: number,
    color: Rgb, opacity: number): void => {
    const pad = Math.max(fromWidth, toWidth) + 1;
    const lengthSq = (toX - fromX) ** 2 + (toY - fromY) ** 2 || 1;
    area(Math.min(fromX, toX) - pad, Math.min(fromY, toY) - pad, Math.max(fromX, toX) + pad,
      Math.max(fromY, toY) + pad, (x, y, index) => {
        const t = THREE.MathUtils.clamp(((x - fromX) * (toX - fromX) + (y - fromY) * (toY - fromY)) / lengthSq, 0, 1);
        const distance = Math.hypot(x - (fromX + (toX - fromX) * t), y - (fromY + (toY - fromY) * t));
        const radius = (fromWidth + (toWidth - fromWidth) * t) / 2;
        blend(index, color, THREE.MathUtils.clamp((radius - distance) * scale + 0.5, 0, 1) * opacity);
      });
  };
  const strand = (x: number, fromY: number, toY: number, drift: number, thickness: number, color: Rgb): void => {
    const segments = 6;
    let previousX = x;
    let previousY = fromY;
    for (let segment = 1; segment <= segments; segment++) {
      const t = segment / segments;
      const nextX = x + drift * t * t + (random() - 0.5) * 3;
      const nextY = fromY + (toY - fromY) * t;
      stroke(previousX, previousY, nextX, nextY, thickness, thickness * 0.75, color, 0.92);
      previousX = nextX;
      previousY = nextY;
    }
  };

  const cx = APPARITION_DESIGN_WIDTH / 2;
  const hair: Rgb = [9, 7, 7];
  const robe: Rgb = [15, 11, 11];
  const limb: Rgb = [74, 74, 64];
  const skin: Rgb = [196, 192, 172];
  const socket: Rgb = [5, 2, 2];
  const blood: Rgb = [92, 8, 6];
  const bone: Rgb = [214, 204, 168];

  // Ragged shroud: shoulders widen into a torn hem that fades out.
  area(0, 112, APPARITION_DESIGN_WIDTH, APPARITION_DESIGN_HEIGHT, (x, y, index) => {
    const halfWidth = y < 128 ? 24 + (y - 112) : 40 + (y - 128) * 0.1;
    const offset = Math.abs(x - cx);
    const hem = 214 + Math.sin(x * 0.9) * 9 + Math.sin(x * 2.3) * 6;
    if (offset > halfWidth || y > hem) return;
    const fold = 0.75 + Math.sin(x * 0.55 + y * 0.02) * 0.25;
    blend(index, [robe[0] * (1 + fold), robe[1] * (1 + fold * 0.6), robe[2] * (1 + fold * 0.6)],
      0.96 * Math.min(1, (hem - y) / 22) * Math.min(1, (halfWidth - offset) * scale / 2));
  });
  stroke(cx, 96, cx, 122, 11, 15, limb, 1);

  // Hair mass behind the head, then strands falling past the shoulders.
  ellipse(cx, 58, 39, 46, hair, 0.98);
  for (let index = 0; index < 34; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    strand(cx + side * (12 + random() * 26), 24 + random() * 22, 120 + random() * 80, side * random() * 14,
      1.6 + random() * 1.6, hair);
  }

  // Overlong arms hanging at the sides, ending in splayed hooked claws.
  for (const side of [-1, 1]) {
    const elbowX = cx + side * 50;
    const wristX = cx + side * 46;
    stroke(cx + side * 34, 124, elbowX, 168, 9, 7, limb, 1);
    stroke(elbowX, 168, wristX, 204, 7, 5, limb, 1);
    ellipse(elbowX, 168, 4.5, 4.5, limb, 1);
    ellipse(wristX, 211, 5.5, 8, limb, 1, 0.3);
    for (let finger = 0; finger < 4; finger++) {
      const spread = finger - 1.5;
      const baseX = wristX + side * spread * 2.6;
      const tipX = baseX + side * spread * 3.4;
      const tipY = 238 - Math.abs(spread) * 5;
      stroke(baseX, 214, tipX, tipY, 2.5, 1.6, limb, 1);
      stroke(tipX, tipY, tipX + side * spread * 1.2 - side * 1.5, tipY + 8, 1.6, 0.4, socket, 1);
    }
    stroke(wristX - side * 4, 212, wristX - side * 9, 226, 2.4, 1.2, limb, 1);
  }

  // Elongated face: sunken cheeks, a heavy brow and hollow sockets.
  ellipse(cx, 64, 25, 35, skin, 1, 0.5);
  ellipse(cx, 47, 22, 5, [118, 114, 100], 0.5);
  for (const side of [-1, 1]) {
    ellipse(cx + side * 15, 76, 7, 11, [96, 92, 80], 0.55);
    ellipse(cx + side * 11, 55, 8.5, 7.5, socket, 1);
    stroke(cx + side * 11, 61, cx + side * 13, 94, 2.4, 1, blood, 0.85);
    ellipse(cx + side * 11, 55, 4.8, 4.8, [255, 26, 10], 0.45);
    ellipse(cx + side * 11, 55, 2.2, 2.2, [255, 70, 30], 1);
    ellipse(cx + side * 11, 55, 0.9, 0.9, [255, 235, 210], 1);
    // Split cheeks running up from the mouth corners.
    stroke(cx + side * 8, 82, cx + side * 17, 72, 1.6, 0.6, blood, 0.9);
    stroke(cx + side * 17, 72, cx + side * 21, 66, 0.9, 0.3, blood, 0.7);
  }

  // Unhinged jaw with uneven fangs on both rows.
  ellipse(cx, 88, 10.5, 17, socket, 1);
  ellipse(cx, 91, 6, 9, [62, 6, 5], 0.7);
  for (let tooth = -4; tooth <= 4; tooth++) {
    const x = cx + tooth * 2.25;
    const rowHeight = Math.cos(tooth / 4.5 * Math.PI / 2);
    stroke(x, 72 + (1 - rowHeight) * 3, x, 77 + rowHeight * 2 + random() * 3, 1.6, 0.3, bone, 1);
    stroke(x, 104 - (1 - rowHeight) * 3, x, 99 - rowHeight * 2 - random() * 3, 1.6, 0.3, bone, 1);
  }

  // Wet strands over the forehead and temples, leaving the eyes clear.
  for (let index = 0; index < 16; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    strand(cx + side * (4 + random() * 10), 26 + random() * 4, 52 + random() * 52, side * (10 + random() * 14),
      1.2 + random() * 1.1, hair);
  }

  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = y * width + x;
      // DataTexture rows start at the bottom of the sprite.
      const offset = ((height - 1 - y) * width + x) * 4;
      data[offset] = Math.round(red[source]);
      data[offset + 1] = Math.round(green[source]);
      data[offset + 2] = Math.round(blue[source]);
      data[offset + 3] = Math.round(alpha[source] * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

interface SoulSlot {
  active: boolean;
  lampIndex: number;
  elapsed: number;
  duration: number;
  startX: number;
  startY: number;
  startZ: number;
  controlX: number;
  controlY: number;
  controlZ: number;
}

interface SparkSlot {
  active: boolean;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface SoulLampView {
  readonly group: THREE.Group;
  readonly glassMaterial: THREE.MeshStandardMaterial;
  readonly coreMaterial: THREE.MeshBasicMaterial;
  readonly light: THREE.PointLight;
  pulseTime: number;
}

interface RitualCandleView {
  readonly flame: THREE.Mesh;
  readonly flameMaterial: THREE.MeshBasicMaterial;
  readonly phase: number;
  readonly baseY: number;
}

function makeGlowTexture(): THREE.DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const alpha = Math.max(0, 1 - Math.hypot(dx, dy));
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 220;
      data[offset + 2] = 125;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const glowTexture = makeGlowTexture();

/** Pooled visual adapter around the authoritative run-local ritual state. */
export class SecretRoomSystem {
  readonly state = new SecretRoomState(
    MANSION_SOUL_LAMPS,
    SOUL_LAMP_REQUIRED_SOULS,
    SOUL_LAMP_CAPTURE_RADIUS,
  );

  onSoulAbsorbed: ((position: THREE.Vector3) => void) | null = null;
  onLampCompleted: ((position: THREE.Vector3) => void) | null = null;
  onUnlocked: ((position: THREE.Vector3) => void) | null = null;
  onDoorOpened: (() => void) | null = null;
  onRitualScare: ((position: THREE.Vector3) => void) | null = null;
  /** The apparition reaches the viewer's face. */
  onRitualImpact: (() => void) | null = null;

  private readonly lamps: SoulLampView[] = [];
  private readonly souls: SoulSlot[] = [];
  private readonly sparks: SparkSlot[] = [];
  private readonly soulPositions = new Float32Array(MAX_TRAVELLING_SOULS * 3);
  private readonly trailPositions = new Float32Array(MAX_TRAVELLING_SOULS * TRAIL_POINTS_PER_SOUL * 3);
  private readonly sparkPositions = new Float32Array(MAX_SPARKS * 3);
  private readonly soulPositionAttribute: THREE.BufferAttribute;
  private readonly trailPositionAttribute: THREE.BufferAttribute;
  private readonly sparkPositionAttribute: THREE.BufferAttribute;
  private readonly soulPoints: THREE.Points;
  private readonly trailPoints: THREE.Points;
  private readonly sparkPoints: THREE.Points;
  private readonly doorStartY: number;
  private readonly revealMaterial: THREE.MeshBasicMaterial;
  private readonly revealLight: THREE.PointLight;
  private readonly ritualMaterial: THREE.MeshStandardMaterial;
  private readonly ritualCandles: RitualCandleView[] = [];
  private readonly ritualLights: THREE.PointLight[] = [];
  private readonly apparition: THREE.Sprite;
  private readonly apparitionMaterial: THREE.SpriteMaterial;
  private readonly scareOrigin = new THREE.Vector3();
  private readonly scareTarget = new THREE.Vector3();
  private doorProgress = 0;
  private doorOpening = false;
  private doorOpen = false;
  private ritualTime = 0;
  /** Seconds since the ritual scare started; negative while idle. */
  private ritualScareElapsed = -1;

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly secretWall: THREE.Mesh,
    private readonly profile: DeviceProfile,
  ) {
    this.doorStartY = secretWall.position.y;
    this.hideAll(this.soulPositions);
    this.hideAll(this.trailPositions);
    this.hideAll(this.sparkPositions);

    const soulGeometry = new THREE.BufferGeometry();
    this.soulPositionAttribute = new THREE.BufferAttribute(this.soulPositions, 3).setUsage(THREE.DynamicDrawUsage);
    soulGeometry.setAttribute('position', this.soulPositionAttribute);
    const souls = new THREE.Points(soulGeometry, new THREE.PointsMaterial({
      map: glowTexture,
      color: 0xffc36a,
      size: profile.useReducedEffects ? 0.2 : 0.27,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    souls.name = 'travelling-souls';
    souls.frustumCulled = false;
    souls.visible = false;
    this.soulPoints = souls;

    const trailGeometry = new THREE.BufferGeometry();
    this.trailPositionAttribute = new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage);
    trailGeometry.setAttribute('position', this.trailPositionAttribute);
    const trails = new THREE.Points(trailGeometry, new THREE.PointsMaterial({
      map: glowTexture,
      color: 0xe88a38,
      size: profile.useReducedEffects ? 0.08 : 0.12,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    trails.name = 'soul-trails';
    trails.frustumCulled = false;
    trails.visible = false;
    this.trailPoints = trails;

    const sparkGeometry = new THREE.BufferGeometry();
    this.sparkPositionAttribute = new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage);
    sparkGeometry.setAttribute('position', this.sparkPositionAttribute);
    const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
      map: glowTexture,
      color: 0xffa33d,
      size: profile.useReducedEffects ? 0.07 : 0.11,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    sparks.name = 'soul-completion-sparks';
    sparks.frustumCulled = false;
    sparks.visible = false;
    this.sparkPoints = sparks;
    parent.add(souls, trails, sparks);

    for (let index = 0; index < MAX_TRAVELLING_SOULS; index++) {
      this.souls.push({
        active: false,
        lampIndex: 0,
        elapsed: 0,
        duration: 0,
        startX: 0,
        startY: 0,
        startZ: 0,
        controlX: 0,
        controlY: 0,
        controlZ: 0,
      });
    }
    for (let index = 0; index < MAX_SPARKS; index++) {
      this.sparks.push({ active: false, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }

    for (let index = 0; index < MANSION_SOUL_LAMPS.length; index++) {
      this.lamps.push(this.buildLamp(index));
    }

    this.revealMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8a2c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const reveal = new THREE.Mesh(
      new THREE.PlaneGeometry(MANSION_SECRET_ROOM.entranceWidth * 0.86, 2.6),
      this.revealMaterial,
    );
    reveal.position.set(
      MANSION_SECRET_ROOM.entranceX + 0.16,
      MANSION_BUNKER_Y + 1.5,
      MANSION_SECRET_ROOM.entranceZ,
    );
    reveal.rotation.y = Math.PI / 2;
    reveal.name = 'secret-wall-reveal-glow';
    parent.add(reveal);

    this.revealLight = new THREE.PointLight(0xff7a25, 0, 5, 2);
    this.revealLight.position.set(
      MANSION_SECRET_ROOM.entranceX + 0.5,
      MANSION_BUNKER_Y + 1.4,
      MANSION_SECRET_ROOM.entranceZ,
    );
    parent.add(this.revealLight);
    this.ritualMaterial = this.buildRitualCircle();
    this.apparitionMaterial = new THREE.SpriteMaterial({
      map: makeApparitionTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.apparition = new THREE.Sprite(this.apparitionMaterial);
    this.apparition.name = 'ritual-apparition';
    this.apparition.center.set(0.5, APPARITION_EYE_ANCHOR);
    this.apparition.renderOrder = 10;
    this.apparition.frustumCulled = false;
    this.apparition.visible = false;
    this.apparition.userData.mapRole = 'ritual-jumpscare-apparition';
    parent.add(this.apparition);
    this.syncAllLampVisuals();
  }

  get isDoorOpen(): boolean {
    return this.doorOpen;
  }

  snapshot(): SecretRoomSnapshot {
    return {
      lamps: this.state.lamps.map(({ activated, currentSouls, completed }) =>
        ({ activated, currentSouls, completed })),
      unlocked: this.state.unlocked,
      doorOpen: this.doorOpen,
      ritualScareTriggered: this.state.ritualScareTriggered,
    };
  }

  /** Guest-only snapshot reconciliation, including late joins after the wall opens. */
  applySnapshot(snapshot: SecretRoomSnapshot): void {
    for (let index = 0; index < this.state.lamps.length; index++) {
      const source = snapshot.lamps[index];
      if (!source) continue;
      const lamp = this.state.lamps[index];
      if (lamp.activated !== source.activated || lamp.currentSouls !== source.currentSouls
        || lamp.completed !== source.completed) {
        const absorbed = source.currentSouls > lamp.currentSouls;
        const completed = source.completed && !lamp.completed;
        lamp.activated = source.activated;
        lamp.currentSouls = source.currentSouls;
        lamp.pendingSouls = 0;
        lamp.completed = source.completed;
        this.syncLampVisual(index);
        const position = this.state.definitions[index].position;
        if (absorbed) this.onSoulAbsorbed?.(new THREE.Vector3(position.x, position.y, position.z));
        if (completed) this.onLampCompleted?.(new THREE.Vector3(position.x, position.y, position.z));
      }
    }
    if (snapshot.unlocked && !this.state.unlocked) {
      this.state.unlocked = true;
      if (!snapshot.doorOpen) this.doorOpening = true;
      this.onUnlocked?.(new THREE.Vector3(MANSION_SECRET_ROOM.entranceX,
        MANSION_BUNKER_Y + 1.4, MANSION_SECRET_ROOM.entranceZ));
    }
    if (snapshot.doorOpen && !this.doorOpen) {
      this.doorOpen = true;
      this.doorOpening = false;
      this.doorProgress = 1;
      this.secretWall.position.y = this.doorStartY - 3.5;
      this.onDoorOpened?.();
    }
    if (snapshot.ritualScareTriggered) this.state.ritualScareTriggered = true;
  }

  activateLamp(lampIndex: number): boolean {
    if (!this.state.activateLamp(lampIndex)) return false;
    this.lamps[lampIndex].pulseTime = 0.8;
    this.syncLampVisual(lampIndex);
    return true;
  }

  /** Shared reveal path for the completed ritual and developer access. */
  unlockDoor(): boolean {
    if (this.doorOpening || this.doorOpen) return false;
    this.state.unlocked = true;
    this.doorOpening = true;
    this.spawnSparks(
      MANSION_SECRET_ROOM.entranceX + 0.3,
      MANSION_BUNKER_Y + 1.4,
      MANSION_SECRET_ROOM.entranceZ,
      this.profile.useReducedEffects ? 8 : 16,
    );
    this.onUnlocked?.(new THREE.Vector3(
      MANSION_SECRET_ROOM.entranceX,
      MANSION_BUNKER_Y + 1.4,
      MANSION_SECRET_ROOM.entranceZ,
    ));
    return true;
  }

  triggerRitualScare(): boolean {
    if (!this.state.triggerRitualScare()) return false;
    this.ritualScareElapsed = 0;
    this.onRitualScare?.(new THREE.Vector3(
      MANSION_RITUAL_CIRCLE.position.x,
      MANSION_BUNKER_Y + 0.8,
      MANSION_RITUAL_CIRCLE.position.z,
    ));
    return true;
  }

  captureSoul(position: { readonly x: number; readonly y: number; readonly z: number }, floor: number): boolean {
    const slotIndex = this.souls.findIndex((slot) => !slot.active);
    if (slotIndex < 0) return false;
    const lampIndex = this.state.beginSoul(position.x, position.z, floor);
    if (lampIndex === null) return false;

    const target = MANSION_SOUL_LAMPS[lampIndex].position;
    const slot = this.souls[slotIndex];
    slot.active = true;
    slot.lampIndex = lampIndex;
    slot.elapsed = 0;
    slot.duration = THREE.MathUtils.clamp(Math.hypot(target.x - position.x, target.z - position.z) / 7, 0.55, 0.95);
    slot.startX = position.x;
    slot.startY = position.y + 0.85;
    slot.startZ = position.z;
    slot.controlX = (position.x + target.x) * 0.5 + (lampIndex % 2 === 0 ? 0.45 : -0.45);
    slot.controlY = Math.max(position.y, target.y) + 1.35;
    slot.controlZ = (position.z + target.z) * 0.5;
    this.soulPoints.visible = true;
    this.trailPoints.visible = true;
    return true;
  }

  /** `observerPosition` is the local player's eye; the apparition lunges at it. */
  update(dt: number, observerPosition?: THREE.Vector3): void {
    this.updateSouls(dt);
    this.updateSparks(dt);
    this.updateLampPulses(dt);
    this.updateDoor(dt);
    this.updateRitual(dt, observerPosition);
  }

  reset(): void {
    this.state.reset();
    for (let index = 0; index < this.souls.length; index++) {
      this.souls[index].active = false;
      this.hidePoint(this.soulPositions, index);
      for (let trail = 0; trail < TRAIL_POINTS_PER_SOUL; trail++) {
        this.hidePoint(this.trailPositions, index * TRAIL_POINTS_PER_SOUL + trail);
      }
    }
    for (let index = 0; index < this.sparks.length; index++) {
      this.sparks[index].active = false;
      this.hidePoint(this.sparkPositions, index);
    }
    this.soulPositionAttribute.needsUpdate = true;
    this.trailPositionAttribute.needsUpdate = true;
    this.sparkPositionAttribute.needsUpdate = true;
    this.doorOpening = false;
    this.doorOpen = false;
    this.doorProgress = 0;
    this.secretWall.position.y = this.doorStartY;
    this.revealMaterial.opacity = 0;
    this.revealLight.intensity = 0;
    this.ritualScareElapsed = -1;
    this.ritualTime = 0;
    this.updateRitual(0);
    this.soulPoints.visible = false;
    this.trailPoints.visible = false;
    this.sparkPoints.visible = false;
    for (const lamp of this.lamps) lamp.pulseTime = 0;
    this.syncAllLampVisuals();
  }

  private buildLamp(index: number): SoulLampView {
    const definition = MANSION_SOUL_LAMPS[index];
    const group = new THREE.Group();
    group.name = `soul-lamp:${definition.id}`;
    group.position.set(definition.position.x, definition.position.y - 0.46, definition.position.z);
    group.rotation.y = definition.yaw;
    group.userData.mapRole = 'soul-lamp';
    group.userData.lampId = definition.id;

    const agedBrass = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, metalness: 0.78, roughness: 0.58 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x181512, metalness: 0.72, roughness: 0.66 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b371d,
      emissive: 0xff6b20,
      emissiveIntensity: 0.02,
      transparent: true,
      opacity: 0.34,
      roughness: 0.18,
      metalness: 0.05,
      depthWrite: false,
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8a32,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.16, 10), agedBrass);
    base.position.y = 0.08;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.58, 12, 1, true), glassMaterial);
    glass.position.y = 0.45;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), coreMaterial);
    core.position.y = 0.45;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.14, 10), agedBrass);
    cap.position.y = 0.81;
    group.add(base, glass, core, cap);

    const cageGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.68, 6);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cage = new THREE.Mesh(cageGeometry, darkMetal);
      cage.position.set(Math.cos(angle) * 0.245, 0.45, Math.sin(angle) * 0.245);
      group.add(cage);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 12, Math.PI), darkMetal);
    handle.position.y = 0.92;
    handle.rotation.z = Math.PI;
    group.add(handle);

    const bracketArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.42), darkMetal);
    bracketArm.position.set(0, 0.88, 0.19);
    const bracketPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.07), darkMetal);
    bracketPlate.position.set(0, 0.75, 0.43);
    group.add(bracketArm, bracketPlate);

    const light = new THREE.PointLight(0xff7a2f, 0.02, 3.2, 2);
    light.position.y = 0.48;
    light.castShadow = false;
    group.add(light);
    group.traverse((object) => {
      object.castShadow = false;
      object.receiveShadow = !this.profile.useReducedEffects;
    });
    this.parent.add(group);
    return { group, glassMaterial, coreMaterial, light, pulseTime: 0 };
  }

  private buildRitualCircle(): THREE.MeshStandardMaterial {
    const texture = makeRitualTexture();
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0x795049,
      emissive: 0x4a0604,
      emissiveMap: texture,
      emissiveIntensity: 0.06,
      transparent: true,
      opacity: 0.88,
      roughness: 0.96,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const ritual = new THREE.Mesh(new THREE.PlaneGeometry(3.35, 3.35), material);
    ritual.name = 'secret-room-ritual-circle';
    ritual.position.set(
      MANSION_RITUAL_CIRCLE.position.x,
      MANSION_RITUAL_CIRCLE.position.y,
      MANSION_RITUAL_CIRCLE.position.z,
    );
    ritual.rotation.x = -Math.PI / 2;
    ritual.receiveShadow = true;
    ritual.renderOrder = 2;
    ritual.userData.mapRole = 'ritual-circle';
    this.parent.add(ritual);

    const waxMaterial = new THREE.MeshStandardMaterial({ color: 0x651612, roughness: 0.92 });
    const wickMaterial = new THREE.MeshStandardMaterial({ color: 0x140c09, roughness: 1 });
    const flameGeometry = new THREE.SphereGeometry(0.035, 6, 5);
    const bodyGeometry = new THREE.CylinderGeometry(0.07, 0.085, 0.32, 8);
    const wickGeometry = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 5);
    for (let index = 0; index < 5; index++) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
      const x = MANSION_SECRET_ROOM.centerX + Math.cos(angle) * 1.72;
      const z = MANSION_SECRET_ROOM.centerZ + Math.sin(angle) * 1.72;
      const candleHeight = 0.27 + (index % 3) * 0.055;
      const candle = new THREE.Group();
      candle.name = `ritual-candle-${index}`;
      candle.position.set(x, MANSION_BUNKER_Y, z);
      candle.userData.mapRole = 'ritual-candle';
      const body = new THREE.Mesh(bodyGeometry, waxMaterial);
      body.scale.y = candleHeight / 0.32;
      body.position.y = candleHeight / 2;
      const waxPool = new THREE.Mesh(new THREE.CircleGeometry(0.11 + (index % 2) * 0.025, 9), waxMaterial);
      waxPool.rotation.x = -Math.PI / 2;
      waxPool.position.y = 0.008;
      const wick = new THREE.Mesh(wickGeometry, wickMaterial);
      wick.position.y = candleHeight + 0.018;
      const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false });
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.scale.set(0.75, 1.65, 0.75);
      const flameY = candleHeight + 0.095;
      flame.position.y = flameY;
      candle.add(waxPool, body, wick, flame);
      this.parent.add(candle);
      this.ritualCandles.push({ flame, flameMaterial, phase: index * 1.71, baseY: flameY });

      if ((!this.profile.useReducedEffects && index % 2 === 0) || (this.profile.useReducedEffects && index === 0)) {
        const light = new THREE.PointLight(0xff6b24, this.profile.useReducedEffects ? 0.32 : 0.52, 2.7, 2);
        light.position.set(
          this.profile.useReducedEffects ? MANSION_SECRET_ROOM.centerX : x,
          MANSION_BUNKER_Y + 0.42,
          this.profile.useReducedEffects ? MANSION_SECRET_ROOM.centerZ : z,
        );
        light.intensity = 0;
        light.castShadow = false;
        light.name = `ritual-candle-light-${index}`;
        this.ritualLights.push(light);
        this.parent.add(light);
      }
    }

    const stoneGeometry = new THREE.DodecahedronGeometry(0.055, 0);
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x211c19, roughness: 1 });
    const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, 12);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 12; index++) {
      const angle = index * 2.399 + 0.4;
      const radius = 1.22 + (index % 4) * 0.2;
      transform.position.set(
        MANSION_SECRET_ROOM.centerX + Math.cos(angle) * radius,
        MANSION_BUNKER_Y + 0.035,
        MANSION_SECRET_ROOM.centerZ + Math.sin(angle) * radius,
      );
      transform.rotation.set(index * 0.31, angle, index * 0.17);
      transform.scale.setScalar(0.7 + (index % 3) * 0.22);
      transform.updateMatrix();
      stones.setMatrixAt(index, transform.matrix);
    }
    stones.name = 'ritual-debris-stones';
    stones.userData.mapRole = 'ritual-debris';
    stones.receiveShadow = !this.profile.useReducedEffects;
    this.parent.add(stones);
    return material;
  }

  private updateRitual(dt: number, observerPosition?: THREE.Vector3): void {
    this.ritualTime += dt;
    const beats = RITUAL_SCARE_TIMELINE;
    let elapsed = -1;
    if (this.ritualScareElapsed >= 0) {
      this.ritualScareElapsed += dt;
      if (this.ritualScareElapsed >= beats.end) this.ritualScareElapsed = -1;
      else elapsed = this.ritualScareElapsed;
    }
    if (elapsed >= beats.impact && elapsed - dt < beats.impact) this.onRitualImpact?.();

    // Flame and light multipliers plus the circle's glow (0 idle, 1 blazing).
    let flameScale = 1;
    let lightScale = 1;
    let heat = 0;
    const erupted = elapsed >= beats.strike && elapsed < beats.vanish;
    if (elapsed >= 0 && elapsed < beats.strike) {
      // The candles choke out while the circle starts to throb.
      const progress = elapsed / beats.strike;
      flameScale = Math.max(0, 1 - progress * 2.2);
      lightScale = flameScale;
      heat = progress * progress * 0.35 * (0.6 + Math.sin(elapsed * 22) * 0.4);
    } else if (erupted) {
      // Tall red flames and a strobing glow while the figure is out.
      const strobe = Math.sin(elapsed * 71) > -0.35 ? 1 : 0.2;
      flameScale = 2.6 + Math.sin(elapsed * 37) * 0.4;
      lightScale = 5 * strobe;
      heat = Math.max(0.65, 1 - (elapsed - beats.strike) * 0.7) * strobe;
    } else if (elapsed >= beats.vanish) {
      // Pitch black for a heartbeat, then the circle smoulders back to idle.
      const settle = THREE.MathUtils.clamp((elapsed - beats.vanish - 0.2) / (beats.end - beats.vanish - 0.2), 0, 1);
      flameScale = settle;
      lightScale = settle;
      heat = settle > 0 ? (1 - settle) * 0.55 : 0;
    }

    this.ritualMaterial.emissiveIntensity = 0.06 + heat * 3.4;
    this.ritualMaterial.emissive.copy(RITUAL_IDLE_EMISSIVE).lerp(RITUAL_SCARE_EMISSIVE, Math.min(1, heat * 1.5));
    for (let index = 0; index < this.ritualCandles.length; index++) {
      const candle = this.ritualCandles[index];
      const flicker = 0.88 + Math.sin(this.ritualTime * 13 + candle.phase) * 0.09
        + Math.sin(this.ritualTime * 23 + candle.phase * 0.7) * 0.035;
      candle.flame.visible = flameScale > 0.02;
      candle.flame.scale.set(0.75 * Math.min(1.5, flameScale), 1.65 * flicker * flameScale,
        0.75 * Math.min(1.5, flameScale));
      // Keep the flame's base on the wick as it grows.
      candle.flame.position.y = candle.baseY + (flicker - 0.88) * 0.03 + (flameScale - 1) * 0.055;
      candle.flameMaterial.color.setHex(erupted ? 0xff2414 : 0xff8a2a);
    }
    const baseLight = this.profile.useReducedEffects ? 0.32 : 0.52;
    for (let index = 0; index < this.ritualLights.length; index++) {
      const light = this.ritualLights[index];
      light.intensity = this.doorOpen
        ? baseLight * (0.88 + Math.sin(this.ritualTime * 11.5 + index * 2.3) * 0.12) * lightScale
        : 0;
      light.color.setHex(erupted ? 0xff160c : 0xff6b24);
    }
    this.updateApparition(elapsed, observerPosition);
  }

  /** Rises out of the circle, twitches, then charges the viewer's face and cuts out. */
  private updateApparition(elapsed: number, observerPosition?: THREE.Vector3): void {
    const beats = RITUAL_SCARE_TIMELINE;
    if (elapsed < beats.strike || elapsed >= beats.vanish) {
      this.apparition.visible = false;
      this.apparitionMaterial.opacity = 0;
      return;
    }
    this.resolveScarePath(observerPosition);
    const position = this.apparition.position;
    let scale = 1;
    let jitter = 0.012;
    if (elapsed < beats.lunge) {
      const rise = Math.min(1, (elapsed - beats.strike) / APPARITION_RISE_DURATION);
      const eased = 1 - (1 - rise) ** 3;
      scale = 0.35 + eased * 0.65;
      position.copy(this.scareOrigin);
      position.y = MANSION_BUNKER_Y + 0.2 + eased * (APPARITION_RISEN_EYE_Y - MANSION_BUNKER_Y - 0.2);
      // Broken, glitching flicker while it stares.
      this.apparition.visible = rise < 1 || Math.sin(elapsed * 53) > -0.8;
    } else {
      const charge = Math.min(1, (elapsed - beats.lunge) / (beats.impact - beats.lunge));
      const eased = charge * charge * charge;
      position.copy(this.scareOrigin).lerp(this.scareTarget, eased);
      scale = 1 + (elapsed >= beats.impact ? Math.sin(elapsed * 60) * 0.05 : 0);
      jitter = elapsed >= beats.impact ? 0.03 : 0.012 + eased * 0.02;
      this.apparition.visible = true;
    }
    position.x += Math.sin(elapsed * 97) * jitter;
    position.y += Math.sin(elapsed * 83 + 1.3) * jitter;
    position.z += Math.sin(elapsed * 89 + 2.1) * jitter;
    this.apparition.scale.set(APPARITION_WIDTH * scale, APPARITION_HEIGHT * scale, 1);
    this.apparitionMaterial.rotation = Math.sin(elapsed * 41) * (elapsed >= beats.impact ? 0.12 : 0.05);
    this.apparitionMaterial.opacity = 1;
  }

  /**
   * Rises on the circle at least a short charge away from the local viewer
   * and ends just in front of their eyes. A viewer outside the room gets the
   * path towards the entrance.
   */
  private resolveScarePath(observerPosition?: THREE.Vector3): void {
    const centerX = MANSION_SECRET_ROOM.centerX;
    const centerZ = MANSION_SECRET_ROOM.centerZ;
    const height = observerPosition ? observerPosition.y - MANSION_BUNKER_Y : 0;
    const inRoom = observerPosition !== undefined && height > 0.6 && height < 2.6
      && Math.hypot(observerPosition.x - centerX, observerPosition.z - centerZ) < 4;
    const eye = this.scareTarget;
    if (inRoom) eye.copy(observerPosition);
    else eye.set(MANSION_SECRET_ROOM.entranceX - 0.6, MANSION_BUNKER_Y + 1.7, MANSION_SECRET_ROOM.entranceZ);
    let dx = centerX - eye.x;
    let dz = centerZ - eye.z;
    const distance = Math.hypot(dx, dz);
    // Standing on the center: rise towards the back wall, away from the entrance.
    if (distance < 1e-3) {
      dx = -1;
      dz = 0;
    } else {
      dx /= distance;
      dz /= distance;
    }
    const originDistance = Math.max(distance, APPARITION_MIN_CHARGE);
    this.scareOrigin.set(eye.x + dx * originDistance, APPARITION_RISEN_EYE_Y, eye.z + dz * originDistance);
    eye.x += dx * APPARITION_FACE_DISTANCE;
    eye.z += dz * APPARITION_FACE_DISTANCE;
  }

  private updateSouls(dt: number): void {
    let changed = false;
    for (let index = 0; index < this.souls.length; index++) {
      const slot = this.souls[index];
      if (!slot.active) continue;
      changed = true;
      slot.elapsed += dt;
      const progress = Math.min(1, slot.elapsed / slot.duration);
      this.writeSoulPoint(index, slot, progress);
      for (let trail = 0; trail < TRAIL_POINTS_PER_SOUL; trail++) {
        this.writeSoulPoint(
          index * TRAIL_POINTS_PER_SOUL + trail,
          slot,
          Math.max(0, progress - (trail + 1) * 0.08),
          this.trailPositions,
        );
      }
      if (progress >= 1) this.finishSoul(index, slot);
    }
    if (!changed) return;
    this.soulPositionAttribute.needsUpdate = true;
    this.trailPositionAttribute.needsUpdate = true;
    const hasActiveSoul = this.souls.some((slot) => slot.active);
    this.soulPoints.visible = hasActiveSoul;
    this.trailPoints.visible = hasActiveSoul;
  }

  private writeSoulPoint(index: number, slot: SoulSlot, progress: number, targetArray = this.soulPositions): void {
    const target = MANSION_SOUL_LAMPS[slot.lampIndex].position;
    const inverse = 1 - progress;
    const offset = index * 3;
    targetArray[offset] = inverse * inverse * slot.startX + 2 * inverse * progress * slot.controlX + progress * progress * target.x;
    targetArray[offset + 1] = inverse * inverse * slot.startY + 2 * inverse * progress * slot.controlY + progress * progress * target.y;
    targetArray[offset + 2] = inverse * inverse * slot.startZ + 2 * inverse * progress * slot.controlZ + progress * progress * target.z;
  }

  private finishSoul(index: number, slot: SoulSlot): void {
    const lampIndex = slot.lampIndex;
    const target = MANSION_SOUL_LAMPS[lampIndex].position;
    slot.active = false;
    this.hidePoint(this.soulPositions, index);
    for (let trail = 0; trail < TRAIL_POINTS_PER_SOUL; trail++) {
      this.hidePoint(this.trailPositions, index * TRAIL_POINTS_PER_SOUL + trail);
    }
    const result = this.state.absorbSoul(lampIndex);
    this.syncLampVisual(lampIndex);
    this.onSoulAbsorbed?.(new THREE.Vector3(target.x, target.y, target.z));
    if (result.lampCompleted) {
      this.lamps[lampIndex].pulseTime = 0.8;
      this.spawnSparks(target.x, target.y, target.z, this.profile.useReducedEffects ? 5 : 10);
      this.onLampCompleted?.(new THREE.Vector3(target.x, target.y, target.z));
    }
    if (result.unlocked) this.unlockDoor();
  }

  private updateLampPulses(dt: number): void {
    for (let index = 0; index < this.lamps.length; index++) {
      const view = this.lamps[index];
      if (view.pulseTime <= 0) continue;
      view.pulseTime = Math.max(0, view.pulseTime - dt);
      this.syncLampVisual(index);
    }
  }

  private syncAllLampVisuals(): void {
    for (let index = 0; index < this.lamps.length; index++) this.syncLampVisual(index);
  }

  private syncLampVisual(index: number): void {
    const lamp = this.state.lamps[index];
    const view = this.lamps[index];
    const progress = lamp.currentSouls / this.state.requiredSouls;
    const pulse = view.pulseTime > 0 ? Math.sin((view.pulseTime / 0.8) * Math.PI) : 0;
    const activeGlow = lamp.activated ? 0.1 : 0;
    view.glassMaterial.emissiveIntensity = 0.02 + activeGlow + progress * 1.25 + pulse * 1.5;
    view.glassMaterial.opacity = 0.3 + activeGlow + progress * 0.3;
    view.coreMaterial.opacity = 0.03 + activeGlow + progress * 0.72 + pulse * 0.2;
    const maxLight = this.profile.useReducedEffects ? 0.38 : 0.72;
    view.light.intensity = 0.015 + activeGlow + progress * maxLight + pulse * 1.1;
    view.group.userData.activated = lamp.activated;
    view.group.userData.souls = lamp.currentSouls;
    view.group.userData.completed = lamp.completed;
  }

  private spawnSparks(x: number, y: number, z: number, count: number): void {
    this.sparkPoints.visible = true;
    let spawned = 0;
    for (const spark of this.sparks) {
      if (spark.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.45 + Math.random() * 0.8;
      spark.active = true;
      spark.life = 0.45 + Math.random() * 0.35;
      spark.x = x;
      spark.y = y;
      spark.z = z;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = 0.5 + Math.random() * 1.1;
      spark.vz = Math.sin(angle) * speed;
      if (++spawned >= count) return;
    }
  }

  private updateSparks(dt: number): void {
    let changed = false;
    for (let index = 0; index < this.sparks.length; index++) {
      const spark = this.sparks[index];
      if (!spark.active) continue;
      changed = true;
      spark.life -= dt;
      if (spark.life <= 0) {
        spark.active = false;
        this.hidePoint(this.sparkPositions, index);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.z += spark.vz * dt;
      spark.vy -= 1.8 * dt;
      const offset = index * 3;
      this.sparkPositions[offset] = spark.x;
      this.sparkPositions[offset + 1] = spark.y;
      this.sparkPositions[offset + 2] = spark.z;
    }
    if (changed) this.sparkPositionAttribute.needsUpdate = true;
    if (!this.sparks.some((spark) => spark.active)) this.sparkPoints.visible = false;
  }

  private updateDoor(dt: number): void {
    if (!this.doorOpening || this.doorOpen) return;
    this.doorProgress = Math.min(1, this.doorProgress + dt / DOOR_OPEN_DURATION);
    const eased = this.doorProgress * this.doorProgress * (3 - 2 * this.doorProgress);
    this.secretWall.position.y = this.doorStartY - eased * 3.5;
    this.revealMaterial.opacity = Math.sin(this.doorProgress * Math.PI) * 0.68;
    this.revealLight.intensity = Math.sin(this.doorProgress * Math.PI) * (this.profile.useReducedEffects ? 0.55 : 1.4);
    if (this.doorProgress < 1) return;
    this.doorOpen = true;
    this.doorOpening = false;
    this.revealMaterial.opacity = 0;
    this.revealLight.intensity = 0;
    this.onDoorOpened?.();
  }

  private hideAll(array: Float32Array): void {
    for (let index = 0; index < array.length; index += 3) {
      array[index] = HIDDEN_POINT;
      array[index + 1] = HIDDEN_POINT;
      array[index + 2] = HIDDEN_POINT;
    }
  }

  private hidePoint(array: Float32Array, index: number): void {
    const offset = index * 3;
    array[offset] = HIDDEN_POINT;
    array[offset + 1] = HIDDEN_POINT;
    array[offset + 2] = HIDDEN_POINT;
  }
}
