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
const RITUAL_SCARE_DURATION = 0.82;

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

function makeApparitionTexture(): THREE.DataTexture {
  const width = 48;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5 - width / 2) / (width / 2);
      const head = Math.hypot(nx / 0.46, (y - 24) / 19) < 1;
      const shoulders = y >= 40 && y < 76 && Math.abs(nx) < 0.38 + (y - 40) * 0.013;
      const robe = y >= 70 && Math.abs(nx) < 0.84 - (y - 70) * 0.012;
      if (!head && !shoulders && !robe) continue;
      const offset = (y * width + x) * 4;
      const eye = y >= 21 && y <= 25 && Math.abs(Math.abs(nx) - 0.17) < 0.07;
      data[offset] = eye ? 255 : 24;
      data[offset + 1] = eye ? 30 : 0;
      data[offset + 2] = eye ? 18 : 0;
      data[offset + 3] = eye ? 245 : Math.round(205 * (0.82 + Math.sin(x * 9 + y * 5) * 0.18));
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
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
  private doorProgress = 0;
  private doorOpening = false;
  private doorOpen = false;
  private ritualTime = 0;
  private ritualScareTime = 0;

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
    const apparitionMaterial = new THREE.SpriteMaterial({
      map: makeApparitionTexture(),
      color: 0x4b0705,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.apparition = new THREE.Sprite(apparitionMaterial);
    this.apparition.name = 'ritual-apparition';
    this.apparition.position.set(
      MANSION_SECRET_ROOM.centerX - 1.25,
      MANSION_BUNKER_Y + 1.28,
      MANSION_SECRET_ROOM.centerZ,
    );
    this.apparition.scale.set(1.05, 2.1, 1);
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

  triggerRitualScare(): boolean {
    if (!this.state.triggerRitualScare()) return false;
    this.ritualScareTime = RITUAL_SCARE_DURATION;
    this.apparition.visible = true;
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

  update(dt: number): void {
    this.updateSouls(dt);
    this.updateSparks(dt);
    this.updateLampPulses(dt);
    this.updateDoor(dt);
    this.updateRitual(dt);
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
    this.ritualScareTime = 0;
    this.ritualTime = 0;
    this.ritualMaterial.emissiveIntensity = 0.06;
    this.apparition.visible = false;
    (this.apparition.material as THREE.SpriteMaterial).opacity = 0;
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

  private updateRitual(dt: number): void {
    this.ritualTime += dt;
    const scareActive = this.ritualScareTime > 0;
    if (scareActive) this.ritualScareTime = Math.max(0, this.ritualScareTime - dt);
    const scareProgress = scareActive ? 1 - this.ritualScareTime / RITUAL_SCARE_DURATION : 1;
    const flash = scareActive ? Math.max(0, 1 - scareProgress * 4.5) : 0;
    this.ritualMaterial.emissiveIntensity = 0.06 + flash * 2.6;
    for (let index = 0; index < this.ritualCandles.length; index++) {
      const candle = this.ritualCandles[index];
      const flicker = 0.88 + Math.sin(this.ritualTime * 13 + candle.phase) * 0.09
        + Math.sin(this.ritualTime * 23 + candle.phase * 0.7) * 0.035;
      candle.flame.scale.y = 1.65 * flicker;
      candle.flame.position.y = candle.baseY + (flicker - 0.88) * 0.03;
      candle.flameMaterial.color.setHex(flash > 0.15 ? 0xff2414 : 0xff8a2a);
    }
    for (let index = 0; index < this.ritualLights.length; index++) {
      const light = this.ritualLights[index];
      const base = this.profile.useReducedEffects ? 0.32 : 0.52;
      light.intensity = this.doorOpen
        ? base * (0.88 + Math.sin(this.ritualTime * 11.5 + index * 2.3) * 0.12) + flash * 1.7
        : 0;
      light.color.setHex(flash > 0.15 ? 0xff160c : 0xff6b24);
    }
    if (!scareActive) {
      this.apparition.visible = false;
      (this.apparition.material as THREE.SpriteMaterial).opacity = 0;
      return;
    }
    const apparitionOpacity = Math.sin(scareProgress * Math.PI);
    this.apparition.visible = apparitionOpacity > 0.01;
    (this.apparition.material as THREE.SpriteMaterial).opacity = apparitionOpacity * 0.9;
    this.apparition.scale.set(1.05 + flash * 0.4, 2.1 + flash * 0.65, 1);
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
    if (result.unlocked) {
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
    }
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
