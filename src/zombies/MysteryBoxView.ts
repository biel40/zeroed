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

const BOX_WIDTH = 1.9;
const BOX_DEPTH = 0.88;
const BODY_HEIGHT = 0.6;
const LID_OPEN_ANGLE = 1.72;
const ANCHOR_HEIGHT = 1.3;
const PARTICLE_COUNT = 48;
const PARTICLE_TOP = 2.05;
const WEAPON_EXIT_TIME = 0.72;

export const MYSTERY_BOX_VISUAL_SIZE = Object.freeze({
  width: BOX_WIDTH,
  depth: BOX_DEPTH,
  bodyHeight: BODY_HEIGHT,
});

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

    // A low, elongated wooden body framed by heavy rails reads as a military
    // field chest rather than one textured cuboid.
    addBox(
      this.group,
      [BOX_WIDTH - 0.14, BODY_HEIGHT - 0.08, BOX_DEPTH - 0.1],
      [0, BODY_HEIGHT / 2 + 0.08, 0],
      darkWoodMaterial,
    );
    for (const y of [0.23, 0.37, 0.51]) {
      addBox(
        this.group,
        [BOX_WIDTH - 0.22, 0.125, 0.055],
        [0, y, -BOX_DEPTH / 2 - 0.025],
        woodMaterial,
      );
    }
    for (const x of [-BOX_WIDTH / 2 - 0.014, BOX_WIDTH / 2 + 0.014]) {
      addBox(
        this.group,
        [0.055, BODY_HEIGHT - 0.19, BOX_DEPTH - 0.2],
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
          [0.12, BODY_HEIGHT + 0.08, 0.12],
          [sx * BOX_WIDTH / 2, BODY_HEIGHT / 2 + 0.08, sz * BOX_DEPTH / 2],
          metalMaterial,
        );
      }
      addBox(
        this.group,
        [0.11, BODY_HEIGHT - 0.11, 0.05],
        [sx * (BOX_WIDTH / 2 - 0.04), BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.055],
        metalMaterial,
      );
      addBox(this.group, [0.2, 0.08, BOX_DEPTH - 0.16], [sx * 0.72, 0.025, 0], metalMaterial);
    }
    addBox(this.group, [BOX_WIDTH - 0.06, 0.09, 0.07], [0, 0.17, -BOX_DEPTH / 2 - 0.05], metalMaterial);
    addBox(this.group, [BOX_WIDTH - 0.06, 0.09, 0.07], [0, BODY_HEIGHT, -BOX_DEPTH / 2 - 0.05], metalMaterial);

    // Vertical straps divide the front while the raised boards retain visible depth.
    for (const x of [-0.62, 0.62]) {
      addBox(this.group, [0.045, BODY_HEIGHT - 0.19, 0.025], [x, BODY_HEIGHT / 2 + 0.08, -BOX_DEPTH / 2 - 0.065], metalMaterial);
    }

    // Brass lock plate and a front-facing question mark built as geometry.
    // Local X is mirrored here because the playable front is viewed from local -Z.
    addBox(
      this.group,
      [0.27, 0.3, 0.04],
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
    const questionCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.065, 0.055, 0),
      new THREE.Vector3(0.07, 0.11, 0),
      new THREE.Vector3(0.035, 0.15, 0),
      new THREE.Vector3(-0.025, 0.16, 0),
      new THREE.Vector3(-0.07, 0.13, 0),
      new THREE.Vector3(-0.075, 0.085, 0),
      new THREE.Vector3(-0.045, 0.045, 0),
      new THREE.Vector3(-0.01, 0.02, 0),
      new THREE.Vector3(0, -0.025, 0),
    ]);
    const questionMark = new THREE.Mesh(
      new THREE.TubeGeometry(questionCurve, 24, 0.014, 7, false),
      emblemMaterial,
    );
    questionMark.position.set(0, BODY_HEIGHT / 2 + 0.105, -BOX_DEPTH / 2 - 0.1);
    this.group.add(questionMark);
    const questionDot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), emblemMaterial);
    questionDot.position.set(0, BODY_HEIGHT / 2 + 0.01, -BOX_DEPTH / 2 - 0.105);
    this.group.add(questionDot);

    // Rivets catch highlights along the frame and break up the straight rails.
    const rivetGeometry = new THREE.SphereGeometry(0.018, 8, 6);
    for (const x of [-0.86, -0.66, 0.66, 0.86]) {
      for (const y of [0.21, BODY_HEIGHT - 0.01]) {
        const rivet = new THREE.Mesh(rivetGeometry, brassMaterial);
        rivet.position.set(x, y, -BOX_DEPTH / 2 - 0.09);
        this.group.add(rivet);
      }
    }

    // Compact front latches and rear hinge barrels add readable hardware.
    for (const x of [-0.38, 0.38]) {
      addBox(this.group, [0.11, 0.14, 0.06], [x, BODY_HEIGHT + 0.015, -BOX_DEPTH / 2 - 0.075], metalMaterial);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), metalMaterial);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(x, BODY_HEIGHT + 0.11, BOX_DEPTH / 2 + 0.035);
      this.group.add(hinge);
    }

    // The lid pivots at its rear edge. Its front edge rises on positive X rotation.
    this.lid.position.set(0, BODY_HEIGHT + 0.13, BOX_DEPTH / 2);
    addBox(this.lid, [BOX_WIDTH + 0.08, 0.15, BOX_DEPTH + 0.06], [0, 0.075, -BOX_DEPTH / 2], darkWoodMaterial);
    for (const x of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
      addBox(this.lid, [0.265, 0.035, BOX_DEPTH - 0.04], [x, 0.168, -BOX_DEPTH / 2], woodMaterial);
    }
    for (const x of [-0.72, 0.72]) {
      addBox(this.lid, [0.09, 0.08, BOX_DEPTH + 0.1], [x, 0.19, -BOX_DEPTH / 2], metalMaterial);
    }
    addBox(this.lid, [BOX_WIDTH + 0.13, 0.09, 0.09], [0, 0.1, -BOX_DEPTH - 0.01], metalMaterial);
    this.group.add(this.lid);

    // The open chest reveals a lit well and a soft cone of energy.
    this.interiorMaterial = new THREE.MeshStandardMaterial({
      color: 0x090611,
      emissive: GLOW_COLOR,
      emissiveIntensity: 0.62,
      roughness: 0.72,
      metalness: 0.1,
    });
    addBox(this.group, [BOX_WIDTH - 0.2, 0.045, BOX_DEPTH - 0.16], [0, BODY_HEIGHT + 0.135, 0], this.interiorMaterial);
    for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
      addBox(
        this.lid,
        [0.035, 0.012, BOX_DEPTH - 0.12],
        [x, 0.19, -BOX_DEPTH / 2],
        this.interiorMaterial,
      );
    }

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

    this.glowLight = new THREE.PointLight(GLOW_COLOR, 0.42, 7, 1.8);
    this.glowLight.position.set(0, 0.82, -0.04);
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
      positions[i * 3] = (Math.random() - 0.5) * (BOX_WIDTH - 0.28);
      positions[i * 3 + 1] = BODY_HEIGHT + 0.08 + Math.random() * (PARTICLE_TOP - BODY_HEIGHT);
      positions[i * 3 + 2] = (Math.random() - 0.5) * (BOX_DEPTH - 0.18);
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
      if (y > PARTICLE_TOP) y = BODY_HEIGHT + 0.08;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    this.previousPhase = phase;
  }
}
