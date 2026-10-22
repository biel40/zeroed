import * as THREE from 'three';
import { RING_DEFINITIONS, type RingId } from '../../../game/rings/RingCatalog';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import { placement } from '../shared/StaticMeshBatch';
import { CONSIGNA_LOCKER, type Station33RingLocker } from '../Station33Config';
import type { ArenaRingMachine, RingMachineDisplay } from '../ZombieArena';
import type { Station33BuildContext } from './Station33BuildContext';

const SHELF_Y = 1.05;
const DOOR_SWING = 2.6;
/** Glow level per display: the ring calls loudest while for sale, softly once it needs a recharge. */
const GLOW_LEVEL: Readonly<Record<RingMachineDisplay, number>> = { stocked: 1, empty: 0.05, recharge: 0.55 };
const GLOW_EASE = 4;

/**
 * Ring machine of the luggage office: one tall locker left open, a velvet
 * cushion on its shelf and an evacuee's wedding ring glowing on it in the
 * ring's own cold enamel colour. The cabinet is static (shared batch); the
 * ring, its halo and the inner trim are animated here and lit only by
 * their own emissive materials, never by a light.
 */
export class RingLocker implements ArenaRingMachine {
  readonly id: string;
  readonly ringId: RingId;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor = 0;
  readonly useRange = 1.8;
  readonly lookDotMin = 0.55;
  private readonly group = new THREE.Group();
  private readonly ring = new THREE.Group();
  private readonly enamel: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshBasicMaterial;
  private readonly halo: THREE.SpriteMaterial;
  private readonly glowColor: THREE.Color;
  private display: RingMachineDisplay = 'stocked';
  private level = GLOW_LEVEL.stocked;
  private time = 0;

  constructor(context: Station33BuildContext, config: Station33RingLocker) {
    this.id = config.id;
    this.ringId = config.ringId;
    this.position = { x: config.x, y: SHELF_Y + 0.1, z: config.z };
    this.glowColor = new THREE.Color(RING_DEFINITIONS[config.ringId].glowColor);
    this.enamel = new THREE.MeshStandardMaterial({
      name: 'station33_ring_enamel', color: this.glowColor, emissive: this.glowColor, roughness: 0.25, metalness: 0.1,
    });
    this.trim = new THREE.MeshBasicMaterial({ name: 'station33_ring_locker_trim', color: this.glowColor.clone() });
    this.halo = new THREE.SpriteMaterial({
      name: 'station33_ring_halo', map: makeSoftDotTexture(), color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });

    this.group.name = `ring-locker:${config.id}`;
    this.group.position.set(config.x, 0, config.z);
    this.group.rotation.y = Math.atan2(config.facingX, config.facingZ);
    context.group.add(this.group);
    this.buildCabinet(context);
    this.buildGlow();
    this.buildRing();
    this.update(0);
  }

  setDisplay(display: RingMachineDisplay): void {
    this.display = display;
    this.ring.visible = display === 'stocked';
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.level += (GLOW_LEVEL[this.display] - this.level) * (1 - Math.exp(-GLOW_EASE * dt));
    const pulse = this.display === 'recharge'
      ? 0.55 + 0.45 * Math.sin(this.time * 1.4)
      : 0.85 + 0.15 * Math.sin(this.time * 2.3);
    const glow = this.level * pulse;
    this.trim.color.copy(this.glowColor).multiplyScalar(0.15 + glow * 0.85);
    this.enamel.emissiveIntensity = 0.4 + glow * 1.6;
    this.halo.opacity = glow * 0.55;
    this.ring.rotation.y = Math.sin(this.time * 0.6) * 0.25;
  }

  reset(): void {
    this.time = 0;
    this.setDisplay('stocked');
    this.level = GLOW_LEVEL.stocked;
    this.update(0);
  }

  /** Steel carcass, dark back, shelf and open door: all static. */
  private buildCabinet(context: Station33BuildContext): void {
    const { batch, materials } = context;
    const world = placement(this.group.position.x, 0, this.group.position.z, 0, this.group.rotation.y, 0).clone();
    const local = new THREE.Matrix4();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0): void => {
      local.makeRotationY(yaw).setPosition(x, y, z);
      batch.add(geometry, material, world.clone().multiply(local));
    };
    const { depth, height, ringLockerWidth } = CONSIGNA_LOCKER;
    const half = ringLockerWidth / 2;
    for (const side of [-1, 1]) part(new THREE.BoxGeometry(0.02, height, depth), materials.greySteel, side * (half - 0.01), height / 2, -depth / 2);
    part(new THREE.BoxGeometry(ringLockerWidth, 0.04, depth + 0.04), materials.greySteel, 0, height + 0.02, -depth / 2 + 0.01);
    part(new THREE.BoxGeometry(ringLockerWidth, 0.12, depth), materials.greySteel, 0, 0.06, -depth / 2);
    part(new THREE.BoxGeometry(ringLockerWidth - 0.04, height - 0.16, 0.01), materials.rubber, 0, height / 2, -depth + 0.01);
    part(new THREE.BoxGeometry(ringLockerWidth - 0.04, 0.02, depth - 0.04), materials.greySteel, 0, SHELF_Y, -depth / 2);
    // The door hangs open on its left hinge, folded back in front of the neighbouring lockers.
    const doorWidth = ringLockerWidth - 0.03;
    const doorHeight = height - 0.18;
    const door = new THREE.BoxGeometry(doorWidth, doorHeight, 0.015).translate(doorWidth / 2, 0, 0);
    part(door, materials.paintedSteel, -half, 0.12 + doorHeight / 2, 0.01, -DOOR_SWING);
  }

  /** Cold trim along the inside of the opening and a soft halo behind the ring. */
  private buildGlow(): void {
    const { depth, height, ringLockerWidth } = CONSIGNA_LOCKER;
    const half = ringLockerWidth / 2;
    const strip = (width: number, stripHeight: number, x: number, y: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, stripHeight, 0.01), this.trim);
      mesh.position.set(x, y, -0.03);
      this.group.add(mesh);
    };
    for (const side of [-1, 1]) strip(0.012, height - 0.3, side * (half - 0.03), height / 2 + 0.05);
    strip(ringLockerWidth - 0.06, 0.012, 0, height - 0.06);
    strip(ringLockerWidth - 0.06, 0.008, 0, SHELF_Y + 0.015);
    const halo = new THREE.Sprite(this.halo);
    halo.position.set(0, SHELF_Y + 0.18, -depth * 0.55);
    halo.scale.setScalar(0.55);
    this.group.add(halo);
  }

  /** Velvet cushion with the ring standing in its fold: worn silver band and an enamel bezel. */
  private buildRing(): void {
    const { depth } = CONSIGNA_LOCKER;
    const velvet = new THREE.MeshStandardMaterial({ name: 'station33_ring_cushion', color: 0x1b2633, roughness: 1 });
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.17, 0.045, 0.13), velvet);
    cushion.position.set(0, SHELF_Y + 0.05, -depth / 2);
    this.group.add(cushion);
    const silver = new THREE.MeshStandardMaterial({ name: 'station33_ring_band', color: 0xb9b4a8, roughness: 0.3, metalness: 1 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.007, 10, 32), silver);
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16), this.enamel);
    bezel.position.y = 0.041;
    this.ring.add(band, bezel);
    this.ring.name = 'locker-ring';
    this.ring.position.set(0, SHELF_Y + 0.115, -depth / 2);
    this.group.add(this.ring);
  }
}
