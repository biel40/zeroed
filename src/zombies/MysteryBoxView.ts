import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import { damp } from '../utils/math';
import { buildWeaponDisplayModel } from '../weapons/WeaponView';
import type { WeaponId } from '../weapons/WeaponTypes';
import type { MysteryBoxEntry, MysteryBoxMachine, MysteryBoxPhase } from './MysteryBox';

/** Interior glow: an arcane violet at rest, the bolt-green of the Ray Gun as a jackpot tell. */
const GLOW_COLOR = 0x8f6bff;
const RAYGUN_COLOR = WEAPON_DEFINITIONS.raygun.energy?.color ?? 0x63f2a4;
const LID_OPEN_ANGLE = -1.85;
const ANCHOR_HEIGHT = 1.12;
const PARTICLE_COUNT = 42;
const PARTICLE_TOP = 1.7;

/**
 * The Mystery Box prop: an original design — a weathered plank crate with a
 * riveted metal frame, a rear-hinged lid, glowing seam lines and a slow
 * ember drift. Nothing here is ripped from any game; textures come from the
 * project's own PBR sets and every light/particle is procedural.
 *
 * The view is a pure reflection of MysteryBoxMachine state: it never owns
 * game logic, it only reads the machine each frame.
 */
export class MysteryBoxView {
  readonly group = new THREE.Group();

  private readonly lid = new THREE.Group();
  private readonly glowLight: THREE.PointLight;
  private readonly interiorMaterial: THREE.MeshStandardMaterial;
  private readonly seamMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly anchor = new THREE.Group();
  private readonly displays = new Map<WeaponId, THREE.Object3D>();
  private readonly particles: THREE.Points;
  private readonly particleMaterial: THREE.PointsMaterial;
  private lidOpen = 0;
  private time = 0;
  private shown: WeaponId | null = null;

  constructor(
    assets: AssetManager,
    placement: { x: number; y: number; z: number },
    pool: readonly MysteryBoxEntry[],
  ) {
    this.group.position.set(placement.x, placement.y, placement.z);

    const wood = assets.getTextureSet('brown_planks_03');
    const metal = assets.getTextureSet('metal_plate');
    const woodMaterial = new THREE.MeshStandardMaterial({
      map: wood.map,
      normalMap: wood.normalMap,
      roughnessMap: wood.roughnessMap,
      color: 0xb8a88f,
      roughness: 0.85,
      metalness: 0,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      map: metal.map,
      normalMap: metal.normalMap,
      roughnessMap: metal.roughnessMap,
      color: 0x6a6f78,
      roughness: 0.45,
      metalness: 0.85,
    });

    // Crate body and lid (lid pivots on its rear edge).
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.52, 0.62), woodMaterial);
    body.position.y = 0.26;
    this.group.add(body);

    this.lid.position.set(0, 0.52, 0.31);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.62), woodMaterial);
    lidMesh.position.set(0, 0.08, -0.31);
    this.lid.add(lidMesh);
    // Metal lid band with the glowing seams.
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.64), metalMaterial);
    band.position.set(0, 0.02, -0.31);
    this.lid.add(band);
    this.group.add(this.lid);

    // Corner protectors + base skid.
    const cornerGeometry = new THREE.BoxGeometry(0.07, 0.56, 0.07);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new THREE.Mesh(cornerGeometry, metalMaterial);
        corner.position.set(sx * 0.53, 0.28, sz * 0.29);
        this.group.add(corner);
      }
    }
    const skid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.68), metalMaterial);
    skid.position.y = 0.03;
    this.group.add(skid);

    // Luminous interior, revealed when the lid swings open.
    this.interiorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0a14,
      emissive: GLOW_COLOR,
      emissiveIntensity: 0.4,
      roughness: 0.9,
      metalness: 0,
    });
    const interior = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.42, 0.54), this.interiorMaterial);
    interior.position.y = 0.28;
    this.group.add(interior);

    // Glowing seam strips along the front face — the "something is inside" tell.
    const seamGeometry = new THREE.BoxGeometry(1.04, 0.014, 0.014);
    for (const y of [0.14, 0.42]) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x0c0a14,
        emissive: GLOW_COLOR,
        emissiveIntensity: 1,
        roughness: 0.8,
        metalness: 0,
      });
      this.seamMaterials.push(material);
      const seam = new THREE.Mesh(seamGeometry, material);
      seam.position.set(0, y, -0.318);
      this.group.add(seam);
    }

    this.glowLight = new THREE.PointLight(GLOW_COLOR, 0.35, 7, 1.8);
    this.glowLight.position.set(0, 0.75, 0);
    this.group.add(this.glowLight);

    // Floating weapon anchor above the crate.
    this.anchor.position.y = ANCHOR_HEIGHT;
    this.anchor.visible = false;
    this.group.add(this.anchor);
    for (const entry of pool) {
      const display = buildWeaponDisplayModel(
        WEAPON_DEFINITIONS[entry.weaponId],
        assets.getWeaponModel(entry.weaponId),
      );
      display.visible = false;
      this.anchor.add(display);
      this.displays.set(entry.weaponId, display);
    }

    // Ember drift: a handful of additive sparks slowly rising out of the seams.
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.2;
      positions[i * 3 + 1] = Math.random() * PARTICLE_TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleMaterial = new THREE.PointsMaterial({
      color: GLOW_COLOR,
      size: 0.022,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.group.add(this.particles);
  }

  /** Mirrors the machine every frame; owns only presentation. */
  update(dt: number, machine: MysteryBoxMachine): void {
    this.time += dt;
    const phase: MysteryBoxPhase = machine.state;

    // Lid: eased swing towards the phase's target angle.
    const lidTarget = phase === 'opening' || phase === 'rolling' || phase === 'awaitingPickup' ? 1 : 0;
    this.lidOpen = damp(this.lidOpen, lidTarget, 7, dt);
    this.lid.rotation.x = this.lidOpen * LID_OPEN_ANGLE;

    // Jackpot tell: the Ray Gun turns the whole glow bolt-green.
    const jackpot = machine.displayWeapon === 'raygun' && (phase === 'rolling' || phase === 'awaitingPickup');
    const color = jackpot ? RAYGUN_COLOR : GLOW_COLOR;
    this.glowLight.color.setHex(color);
    this.interiorMaterial.emissive.setHex(color);
    this.particleMaterial.color.setHex(color);
    for (const seam of this.seamMaterials) seam.emissive.setHex(color);

    // Glow behaviour per phase: breathing at rest, agitated while rolling,
    // a strong steady burn while the result floats.
    let glow = 0.3 + Math.sin(this.time * 1.7) * 0.08;
    if (phase === 'rolling') glow = 1.4 + Math.sin(this.time * 26) * 0.5;
    else if (phase === 'awaitingPickup') glow = jackpot ? 2.6 : 1.7;
    else if (phase === 'opening' || phase === 'closing') glow = 0.9;
    this.glowLight.intensity = glow;
    this.interiorMaterial.emissiveIntensity = 0.25 + glow * 0.55;
    this.particleMaterial.opacity = Math.min(0.85, 0.22 + glow * 0.22);

    // Weapon carousel: only visible while the machine offers something.
    const activeId = phase === 'rolling' || phase === 'awaitingPickup' ? machine.displayWeapon : null;
    if (activeId !== this.shown) {
      if (this.shown) this.displays.get(this.shown)!.visible = false;
      this.shown = activeId;
      if (this.shown) this.displays.get(this.shown)!.visible = true;
    }
    this.anchor.visible = this.shown !== null;
    if (this.shown) {
      // Slow levitating spin; the result hovers a touch higher than the roll.
      this.anchor.rotation.y += dt * (phase === 'rolling' ? 2.6 : 0.9);
      const hover = phase === 'awaitingPickup' ? 0.1 : 0;
      this.anchor.position.y =
        ANCHOR_HEIGHT + hover + Math.sin(this.time * 2.1) * 0.035 + this.lidOpen * 0.12;
    }

    // Embers drift upwards and wrap; cheap loop over 42 points.
    const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const speed = phase === 'closed' ? 0.1 : 0.45;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let y = positions.getY(i) + dt * speed * (0.6 + (i % 5) * 0.12);
      if (y > PARTICLE_TOP) y = 0.05;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }
}
