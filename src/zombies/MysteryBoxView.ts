import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import { damp } from '../utils/math';
import { buildWeaponDisplayModel } from '../weapons/WeaponView';
import type { WeaponId } from '../weapons/WeaponTypes';
import type { MysteryBoxEntry, MysteryBoxMachine, MysteryBoxPhase } from './MysteryBox';

const GLOW_COLOR = 0x8f6bff;
const RAYGUN_COLOR = WEAPON_DEFINITIONS.raygun.energy?.color ?? 0x63f2a4;
export const LEGENDARY_MYSTERY_BOX_COLOR = 0xffc928;

const BOX_WIDTH = 1.55;
const BOX_DEPTH = 0.88;
const BODY_HEIGHT = 0.68;
const LID_OPEN_ANGLE = 1.72;
const ANCHOR_HEIGHT = 1.38;
const PARTICLE_COUNT = 58;
const PARTICLE_TOP = 2.15;
const WEAPON_EXIT_TIME = 0.72;

export function getMysteryBoxResultColor(
  weaponId: WeaponId,
  rarity: MysteryBoxEntry['rarity'] | undefined,
): number {
  if (rarity === 'legendary') return LEGENDARY_MYSTERY_BOX_COLOR;
  if (weaponId === 'raygun' && rarity === 'rare') return RAYGUN_COLOR;
  return GLOW_COLOR;
}

/**
 * Procedural Mystery Box prop. Gameplay remains in MysteryBoxMachine; this
 * class only turns its phases into geometry, light and animation.
 */
export class MysteryBoxView {
  readonly group = new THREE.Group();

  private readonly lid = new THREE.Group();
  private readonly glowLight: THREE.PointLight;
  private readonly interiorMaterial: THREE.MeshStandardMaterial;
  private readonly glowMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly auraMaterial: THREE.MeshBasicMaterial;
  private readonly anchor = new THREE.Group();
  private readonly displays = new Map<WeaponId, THREE.Object3D>();
  private readonly rarityByWeapon = new Map<WeaponId, MysteryBoxEntry['rarity']>();
  private readonly particles: THREE.Points;
  private readonly particleMaterial: THREE.PointsMaterial;
  private lidOpen = 0;
  private time = 0;
  private shown: WeaponId | null = null;
  private previousPhase: MysteryBoxPhase = 'closed';
  private weaponExit = 1;
  private weaponScale = 1;

  constructor(
    assets: AssetManager,
    placement: { x: number; y: number; z: number; yaw?: number },
    pool: readonly MysteryBoxEntry[],
  ) {
    this.group.position.set(placement.x, placement.y, placement.z);
    this.group.rotation.y = placement.yaw ?? 0;

    const wood = assets.getTextureSet('brown_planks_03');
    const metal = assets.getTextureSet('metal_plate');
    const woodMaterial = new THREE.MeshStandardMaterial({
      map: wood.map,
      normalMap: wood.normalMap,
      roughnessMap: wood.roughnessMap,
      color: 0x8b7155,
      roughness: 0.88,
      metalness: 0,
    });
    const darkWoodMaterial = woodMaterial.clone();
    darkWoodMaterial.color.setHex(0x493827);
    const metalMaterial = new THREE.MeshStandardMaterial({
      map: metal.map,
      normalMap: metal.normalMap,
      roughnessMap: metal.roughnessMap,
      color: 0x30343b,
      roughness: 0.38,
      metalness: 0.92,
    });
    const brassMaterial = new THREE.MeshStandardMaterial({
      color: 0x8e6727,
      roughness: 0.34,
      metalness: 0.82,
    });

    const addBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    // A recessed wooden body framed by heavy rails reads as a crafted chest,
    // rather than one textured cuboid.
    addBox(
      this.group,
      [BOX_WIDTH - 0.12, BODY_HEIGHT - 0.08, BOX_DEPTH - 0.1],
      [0, BODY_HEIGHT / 2 + 0.08, 0],
      darkWoodMaterial,
    );
    addBox(
      this.group,
      [BOX_WIDTH - 0.2, BODY_HEIGHT - 0.19, 0.045],
      [0, BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.012],
      woodMaterial,
    );
    for (const x of [-BOX_WIDTH / 2 - 0.012, BOX_WIDTH / 2 + 0.012]) {
      addBox(
        this.group,
        [0.045, BODY_HEIGHT - 0.19, BOX_DEPTH - 0.2],
        [x, BODY_HEIGHT / 2 + 0.08, 0],
        woodMaterial,
      );
    }

    // Base, top lip, corner posts and front rails.
    addBox(this.group, [BOX_WIDTH + 0.18, 0.1, BOX_DEPTH + 0.16], [0, 0.08, 0], metalMaterial);
    addBox(this.group, [BOX_WIDTH + 0.1, 0.09, BOX_DEPTH + 0.08], [0, BODY_HEIGHT + 0.08, 0], metalMaterial);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBox(
          this.group,
          [0.1, BODY_HEIGHT + 0.08, 0.1],
          [sx * BOX_WIDTH / 2, BODY_HEIGHT / 2 + 0.08, sz * BOX_DEPTH / 2],
          metalMaterial,
        );
      }
      addBox(
        this.group,
        [0.11, BODY_HEIGHT - 0.11, 0.05],
        [sx * (BOX_WIDTH / 2 - 0.03), BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.04],
        metalMaterial,
      );
      addBox(this.group, [0.18, 0.08, BOX_DEPTH - 0.16], [sx * 0.55, 0.025, 0], metalMaterial);
    }
    addBox(this.group, [BOX_WIDTH - 0.06, 0.08, 0.06], [0, 0.18, -BOX_DEPTH / 2 - 0.04], metalMaterial);
    addBox(this.group, [BOX_WIDTH - 0.06, 0.08, 0.06], [0, BODY_HEIGHT - 0.02, -BOX_DEPTH / 2 - 0.04], metalMaterial);

    // Three front planks, separated by narrow shadow lines.
    for (const x of [-0.43, 0, 0.43]) {
      addBox(this.group, [0.026, BODY_HEIGHT - 0.23, 0.018], [x, BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.047], darkWoodMaterial);
    }

    // Brass lock plate and a procedural glowing question-mark emblem.
    addBox(
      this.group,
      [0.25, 0.29, 0.035],
      [0, BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.07],
      brassMaterial,
    );
    const emblemMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a102c,
      emissive: GLOW_COLOR,
      emissiveIntensity: 1.8,
      roughness: 0.45,
      metalness: 0.25,
    });
    this.glowMaterials.push(emblemMaterial);
    const questionArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.068, 0.014, 8, 20, Math.PI * 1.45),
      emblemMaterial,
    );
    questionArc.position.set(-0.012, BODY_HEIGHT / 2 + 0.125, -BOX_DEPTH / 2 - 0.092);
    questionArc.rotation.z = -0.18;
    this.group.add(questionArc);
    addBox(
      this.group,
      [0.025, 0.065, 0.018],
      [0.035, BODY_HEIGHT / 2 + 0.055, -BOX_DEPTH / 2 - 0.093],
      emblemMaterial,
    ).rotation.z = -0.2;
    const questionDot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), emblemMaterial);
    questionDot.position.set(0.045, BODY_HEIGHT / 2 - 0.005, -BOX_DEPTH / 2 - 0.105);
    this.group.add(questionDot);

    // Rivets catch highlights along the frame and break up the straight rails.
    const rivetGeometry = new THREE.SphereGeometry(0.018, 8, 6);
    for (const x of [-0.68, -0.5, 0.5, 0.68]) {
      for (const y of [0.2, BODY_HEIGHT - 0.04]) {
        const rivet = new THREE.Mesh(rivetGeometry, brassMaterial);
        rivet.position.set(x, y, -BOX_DEPTH / 2 - 0.082);
        this.group.add(rivet);
      }
    }

    // The lid pivots at its rear edge. Its front edge rises on positive X rotation.
    this.lid.position.set(0, BODY_HEIGHT + 0.13, BOX_DEPTH / 2);
    addBox(this.lid, [BOX_WIDTH + 0.08, 0.16, BOX_DEPTH + 0.06], [0, 0.08, -BOX_DEPTH / 2], darkWoodMaterial);
    for (const x of [-0.58, -0.29, 0, 0.29, 0.58]) {
      addBox(this.lid, [0.255, 0.025, BOX_DEPTH - 0.04], [x, 0.174, -BOX_DEPTH / 2], woodMaterial);
    }
    for (const x of [-0.55, 0.55]) {
      addBox(this.lid, [0.09, 0.08, BOX_DEPTH + 0.1], [x, 0.19, -BOX_DEPTH / 2], metalMaterial);
    }
    addBox(this.lid, [BOX_WIDTH + 0.13, 0.09, 0.09], [0, 0.1, -BOX_DEPTH - 0.01], metalMaterial);
    this.group.add(this.lid);

    // The open chest reveals a lit well and a soft cone of energy.
    this.interiorMaterial = new THREE.MeshStandardMaterial({
      color: 0x090611,
      emissive: GLOW_COLOR,
      emissiveIntensity: 0.45,
      roughness: 0.72,
      metalness: 0.1,
    });
    addBox(this.group, [BOX_WIDTH - 0.2, 0.045, BOX_DEPTH - 0.16], [0, BODY_HEIGHT + 0.135, 0], this.interiorMaterial);

    this.auraMaterial = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.62, 1.45, 20, 1, true),
      this.auraMaterial,
    );
    aura.position.y = BODY_HEIGHT + 0.8;
    this.group.add(aura);

    this.glowLight = new THREE.PointLight(GLOW_COLOR, 0.35, 8, 1.7);
    this.glowLight.position.set(0, 0.96, -0.04);
    this.group.add(this.glowLight);

    this.anchor.position.y = ANCHOR_HEIGHT;
    this.anchor.visible = false;
    this.group.add(this.anchor);
    for (const entry of pool) {
      this.rarityByWeapon.set(entry.weaponId, entry.rarity);
      const display = buildWeaponDisplayModel(
        WEAPON_DEFINITIONS[entry.weaponId],
        assets.getWeaponModel(entry.weaponId),
      );
      display.visible = false;
      this.anchor.add(display);
      this.displays.set(entry.weaponId, display);
    }

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (BOX_WIDTH + 0.15);
      positions[i * 3 + 1] = 0.18 + Math.random() * PARTICLE_TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOX_DEPTH;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleMaterial = new THREE.PointsMaterial({
      color: GLOW_COLOR,
      size: 0.027,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.group.add(this.particles);

    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  /** Mirrors the machine every frame; owns only presentation. */
  update(dt: number, machine: MysteryBoxMachine): void {
    this.time += dt;
    const phase = machine.state;
    const isOpen = phase === 'opening' || phase === 'rolling' || phase === 'awaitingPickup';

    this.lidOpen = damp(this.lidOpen, isOpen ? 1 : 0, isOpen ? 5.2 : 6.5, dt);
    const lidEase = THREE.MathUtils.smoothstep(this.lidOpen, 0, 1);
    this.lid.rotation.x = lidEase * LID_OPEN_ANGLE;

    const highlighted = phase === 'rolling' || phase === 'awaitingPickup';
    const rarity = highlighted ? this.rarityByWeapon.get(machine.displayWeapon) : undefined;
    const jackpot = rarity === 'rare' || rarity === 'legendary';
    const color = highlighted
      ? getMysteryBoxResultColor(machine.displayWeapon, rarity)
      : GLOW_COLOR;
    this.glowLight.color.setHex(color);
    this.interiorMaterial.emissive.setHex(color);
    this.particleMaterial.color.setHex(color);
    this.auraMaterial.color.setHex(color);
    for (const material of this.glowMaterials) material.emissive.setHex(color);

    let glow = 0.28 + Math.sin(this.time * 1.7) * 0.07;
    if (phase === 'opening') glow = 0.55 + lidEase * 1.1;
    else if (phase === 'rolling') glow = 1.55 + Math.sin(this.time * 24) * 0.38;
    else if (phase === 'awaitingPickup') glow = jackpot ? 2.8 : 1.85;
    else if (phase === 'closing') glow = 0.95 * this.lidOpen;
    this.glowLight.intensity = glow;
    this.interiorMaterial.emissiveIntensity = 0.22 + glow * 0.58;
    this.particleMaterial.opacity = Math.min(0.9, 0.18 + glow * 0.23);
    this.auraMaterial.opacity = Math.max(0, this.lidOpen * Math.min(0.16, glow * 0.065));
    for (const material of this.glowMaterials) material.emissiveIntensity = 0.8 + glow * 0.75;

    const activeId = highlighted ? machine.displayWeapon : null;
    if (activeId && activeId !== this.shown) {
      if (this.shown) this.displays.get(this.shown)!.visible = false;
      this.shown = activeId;
      this.displays.get(activeId)!.visible = true;
      this.weaponScale = 0.68;
      this.weaponExit = 0;
    }

    if (phase === 'closing' && this.previousPhase !== 'closing') this.weaponExit = 0;

    if (this.shown) {
      if (phase === 'closing') {
        this.weaponExit = Math.min(1, this.weaponExit + dt / WEAPON_EXIT_TIME);
        const exitEase = THREE.MathUtils.smoothstep(this.weaponExit, 0, 1);
        this.anchor.rotation.y += dt * (2.2 + exitEase * 8);
        this.anchor.position.y = ANCHOR_HEIGHT + 0.16 + exitEase * 0.72;
        const exitScale = Math.max(0, 1 - exitEase);
        this.anchor.scale.setScalar(exitScale);
        this.anchor.visible = exitScale > 0.025;
      } else if (highlighted) {
        this.weaponScale = damp(this.weaponScale, 1, 12, dt);
        this.anchor.scale.setScalar(this.weaponScale);
        this.anchor.visible = true;
        this.anchor.rotation.y += dt * (phase === 'rolling' ? 2.8 : 0.85);
        const hover = phase === 'awaitingPickup' ? 0.13 : 0;
        this.anchor.position.y =
          ANCHOR_HEIGHT + hover + Math.sin(this.time * 2.1) * 0.045 + lidEase * 0.1;
      } else if (phase === 'closed') {
        this.displays.get(this.shown)!.visible = false;
        this.shown = null;
        this.anchor.visible = false;
        this.anchor.scale.setScalar(1);
      }
    }

    const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const speed = phase === 'closed' ? 0.08 : 0.5;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let y = positions.getY(i) + dt * speed * (0.58 + (i % 5) * 0.12);
      if (y > PARTICLE_TOP) y = 0.16;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    this.previousPhase = phase;
  }
}
