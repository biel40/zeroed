import * as THREE from 'three';
import { RING_DEFINITIONS, type RingId } from '../../../game/rings/RingCatalog';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { ArenaRingMachine, RingMachineDisplay } from '../ZombieArena';
import type { LockerFront, LockerMaterials, LockerSize } from './LockerBank';
import type { MapBuildKit } from './MapBuildKit';
import type { MapPower } from './MapPower';
import { placement } from './StaticMeshBatch';

const SHELF_Y = 1.05;
const DOOR_SWING = 2.6;
/** Glow level per display: the ring calls loudest while for sale, softly once it needs a recharge. */
const GLOW_LEVEL: Readonly<Record<RingMachineDisplay, number>> = { stocked: 1, empty: 0.05, recharge: 0.55 };
/** Without power the locker's trim and the ring's enamel go dark. */
const UNPOWERED_GLOW = 0;
const GLOW_EASE = 4;
/** Last seconds of a temporary charge, when the glow stutters to warn it is running out. */
const CHARGE_WARNING = 10;
const CHARGE_FLICKER_HZ = 7;
/** Brightness of the marquee bulb over the locker: dark on batteries, blazing on the mains. */
const BULB_LEVEL = { off: 0.03, mains: 2.2 } as const;
/** On the mains the bulb flares and casts a pool of its colour on the floor (additive, no real light). */
const MAINS_FLARE = { opacity: 0.85, scale: 0.9 } as const;
const MAINS_POOL = { opacity: 0.4, width: 1.8, depth: 1.5 } as const;

/** Where a map puts a ring locker and what it sells. */
export interface RingLockerPlacement extends LockerFront {
  readonly id: string;
  readonly ringId: RingId;
  /** Sells only once the map's power is on (dark and silent until then). */
  readonly requiresPower: boolean;
}

/** A map's ring-locker look: its lockers' size and materials, and how much brighter it blazes on the mains. */
export interface RingLockerLook {
  readonly size: LockerSize;
  readonly materials: LockerMaterials;
  /** Glow multiplier once the power switch feeds the map. */
  readonly mainsGlowBoost: number;
}

/**
 * Ring machine for any map: one tall locker left open in a bank of
 * lockers (`addLockerBank` leaves its gap), a velvet cushion on its shelf
 * and a wedding ring glowing on it in the ring's own enamel colour. A
 * locker that needs the map's power waits dark (ring on show, no glow)
 * until it comes on, or until a ZEUS-77 bolt charges it for a while. Once
 * the power switch feeds the map, every locker blazes
 * (`RingLockerLook.mainsGlowBoost`) under a bulb of its ring's colour. The
 * cabinet is static (shared batch); the ring, its halo, the inner trim and
 * the bulb are animated here and lit only by their own emissive materials,
 * never by a light. Stands on the ground floor (floor 0, y 0).
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
  private readonly haloSprite: THREE.Sprite;
  private readonly bulb: THREE.MeshBasicMaterial;
  private readonly flare: THREE.SpriteMaterial;
  private readonly pool: THREE.MeshBasicMaterial;
  private readonly glowColor: THREE.Color;
  private readonly requiresPower: boolean;
  private display: RingMachineDisplay = 'stocked';
  private level = GLOW_LEVEL.stocked;
  private time = 0;
  /** Seconds of temporary power left from a ZEUS-77 bolt (0 when none). */
  private charge = 0;

  constructor(
    kit: MapBuildKit,
    config: RingLockerPlacement,
    private readonly look: RingLockerLook,
    /** The map's power: it unlocks the lockers that need it and makes every locker blaze. */
    private readonly power: MapPower,
  ) {
    this.id = config.id;
    this.requiresPower = config.requiresPower;
    this.ringId = config.ringId;
    this.position = { x: config.x, y: SHELF_Y + 0.1, z: config.z };
    this.glowColor = new THREE.Color(RING_DEFINITIONS[config.ringId].glowColor);
    this.enamel = new THREE.MeshStandardMaterial({
      name: 'ring_locker_enamel', color: this.glowColor, emissive: this.glowColor, roughness: 0.25, metalness: 0.1,
    });
    this.trim = new THREE.MeshBasicMaterial({ name: 'ring_locker_trim', color: this.glowColor.clone() });
    this.halo = new THREE.SpriteMaterial({
      name: 'ring_locker_halo', map: makeSoftDotTexture(), color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    this.haloSprite = new THREE.Sprite(this.halo);
    this.bulb = new THREE.MeshBasicMaterial({ name: 'ring_locker_bulb', color: this.glowColor.clone() });
    const softDot = makeSoftDotTexture();
    this.flare = new THREE.SpriteMaterial({
      name: 'ring_locker_flare', map: softDot, color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    this.pool = new THREE.MeshBasicMaterial({
      name: 'ring_locker_pool', map: softDot, color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });

    this.group.name = `ring-locker:${config.id}`;
    this.group.position.set(config.x, 0, config.z);
    this.group.rotation.y = Math.atan2(config.facingX, config.facingZ);
    kit.group.add(this.group);
    this.buildCabinet(kit);
    this.buildGlow();
    this.buildRing();
    this.reset();
  }

  get powered(): boolean {
    return !this.requiresPower || this.power.on || this.charge > 0;
  }

  energize(seconds: number): boolean {
    if (!this.requiresPower || this.power.on) return false;
    this.charge = Math.max(0, seconds);
    return true;
  }

  setDisplay(display: RingMachineDisplay): void {
    this.display = display;
    this.ring.visible = display === 'stocked';
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.charge = Math.max(0, this.charge - Math.max(0, dt));
    const target = this.powered ? GLOW_LEVEL[this.display] : UNPOWERED_GLOW;
    this.level += (target - this.level) * (1 - Math.exp(-GLOW_EASE * dt));
    const pulse = this.display === 'recharge'
      ? 0.55 + 0.45 * Math.sin(this.time * 1.4)
      : 0.85 + 0.15 * Math.sin(this.time * 2.3);
    const mains = this.power.on ? this.look.mainsGlowBoost : 1;
    const glow = this.level * pulse * this.chargeFlicker() * mains;
    // Unlit trim and enamel keep a faint floor only while powered: without power the locker is dead.
    const floor = this.powered ? 1 : 0;
    this.trim.color.copy(this.glowColor).multiplyScalar(0.15 * floor + glow * 0.85);
    this.enamel.emissiveIntensity = 0.4 * floor + glow * 1.6;
    this.halo.opacity = Math.min(1, glow * 0.55);
    this.haloSprite.scale.setScalar(0.55 * Math.sqrt(mains));
    this.bulb.color.copy(this.glowColor).multiplyScalar(this.power.on ? BULB_LEVEL.mains : BULB_LEVEL.off);
    this.flare.opacity = this.power.on ? MAINS_FLARE.opacity * pulse : 0;
    this.pool.opacity = this.power.on ? MAINS_POOL.opacity * Math.min(1, this.level + 0.4) : 0;
    this.ring.rotation.y = Math.sin(this.time * 0.6) * 0.25;
  }

  /** 1, or a stutter through the last seconds of a temporary charge running on its own. */
  private chargeFlicker(): number {
    if (this.power.on || this.charge <= 0 || this.charge > CHARGE_WARNING) return 1;
    return Math.sin(this.time * Math.PI * 2 * CHARGE_FLICKER_HZ) > -0.3 ? 1 : 0.25;
  }

  reset(): void {
    this.time = 0;
    this.charge = 0;
    this.setDisplay('stocked');
    this.level = this.powered ? GLOW_LEVEL.stocked : UNPOWERED_GLOW;
    this.update(0);
  }

  /** Steel carcass, dark back, shelf and open door: all static. */
  private buildCabinet(kit: MapBuildKit): void {
    const { materials, size } = this.look;
    const world = placement(this.group.position.x, 0, this.group.position.z, 0, this.group.rotation.y, 0).clone();
    const local = new THREE.Matrix4();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0): void => {
      local.makeRotationY(yaw).setPosition(x, y, z);
      kit.batch.add(geometry, material, world.clone().multiply(local));
    };
    const { depth, height, ringLockerWidth } = size;
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

  /** Trim along the inside of the opening, a soft halo behind the ring and the marquee bulb on top. */
  private buildGlow(): void {
    const { depth, height, ringLockerWidth } = this.look.size;
    const half = ringLockerWidth / 2;
    const strip = (width: number, stripHeight: number, x: number, y: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, stripHeight, 0.01), this.trim);
      mesh.position.set(x, y, -0.03);
      this.group.add(mesh);
    };
    for (const side of [-1, 1]) strip(0.012, height - 0.3, side * (half - 0.03), height / 2 + 0.05);
    strip(ringLockerWidth - 0.06, 0.012, 0, height - 0.06);
    strip(ringLockerWidth - 0.06, 0.008, 0, SHELF_Y + 0.015);
    this.haloSprite.position.set(0, SHELF_Y + 0.18, -depth * 0.55);
    this.group.add(this.haloSprite);
    // Marquee bulb on the locker's top edge, under a little steel hood.
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), this.bulb);
    bulb.name = 'locker-bulb';
    bulb.position.set(0, height + 0.11, -0.08);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.11, 0.06, 12), this.look.materials.greySteel);
    hood.position.set(0, height + 0.2, -0.08);
    const flare = new THREE.Sprite(this.flare);
    flare.position.copy(bulb.position);
    flare.scale.setScalar(MAINS_FLARE.scale);
    // Just above the floor in front of the locker, under any floor decal's offset.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(MAINS_POOL.width, MAINS_POOL.depth).rotateX(-Math.PI / 2), this.pool);
    pool.position.set(0, 0.012, MAINS_POOL.depth / 2 - 0.1);
    pool.renderOrder = 1;
    this.group.add(bulb, hood, flare, pool);
  }

  /** Velvet cushion with the ring standing in its fold: worn silver band and an enamel bezel. */
  private buildRing(): void {
    const { depth } = this.look.size;
    const velvet = new THREE.MeshStandardMaterial({ name: 'ring_locker_cushion', color: 0x1b2633, roughness: 1 });
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.17, 0.045, 0.13), velvet);
    cushion.position.set(0, SHELF_Y + 0.05, -depth / 2);
    this.group.add(cushion);
    const silver = new THREE.MeshStandardMaterial({ name: 'ring_locker_band', color: 0xb9b4a8, roughness: 0.3, metalness: 1 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.007, 10, 32), silver);
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16), this.enamel);
    bezel.position.y = 0.041;
    this.ring.add(band, bezel);
    this.ring.name = 'locker-ring';
    this.ring.position.set(0, SHELF_Y + 0.115, -depth / 2);
    this.group.add(this.ring);
  }
}
