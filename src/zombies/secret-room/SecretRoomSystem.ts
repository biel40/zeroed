import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import {
  MANSION_BUNKER_Y,
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
  private doorProgress = 0;
  private doorOpening = false;
  private doorOpen = false;

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
    this.syncAllLampVisuals();
  }

  get isDoorOpen(): boolean {
    return this.doorOpen;
  }

  activateLamp(lampIndex: number): boolean {
    if (!this.state.activateLamp(lampIndex)) return false;
    this.lamps[lampIndex].pulseTime = 0.8;
    this.syncLampVisual(lampIndex);
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
