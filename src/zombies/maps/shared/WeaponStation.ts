import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../../config/weapons';
import type { TranslationKey } from '../../../i18n/i18n';
import type { WeaponId } from '../../../weapons/WeaponTypes';
import { buildWeaponDisplayModel } from '../../../weapons/WeaponView';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { ArenaWeaponStation } from '../ZombieArena';
import type { LockerMaterials } from './LockerBank';
import type { MapBuildKit } from './MapBuildKit';
import type { MapPower } from './MapPower';
import { addSolidProxy } from './SolidProxy';
import { placement } from './StaticMeshBatch';

/** Open equipment cabinet, metres: the weapon hangs at eye level, its spare charges on a tray below. */
const CABINET = { width: 1.15, height: 2.05, depth: 0.42, plinth: 0.1 } as const;
const WEAPON_Y = 1.32;
const WEAPON_LENGTH = 0.92;
const TRAY_Y = 0.78;
const SPARE_SPACING = 0.16;
const SPARE = { radius: 0.024, length: 0.1 } as const;
/** Brightness of the spares and lamp: dark without power, alive on it, blazing on the mains. */
const GLOW = { off: 0, powered: 1.1, flash: 3 } as const;
const GLOW_EASE = 4;
const FLASH_DECAY = 2.5;

/** Where a map puts a weapon station and what it sells. */
export interface WeaponStationPlacement {
  readonly id: string;
  readonly weaponId: WeaponId;
  readonly price: number;
  readonly ammoPrice: number;
  readonly ammoPromptKey?: TranslationKey;
  /** Centre of the cabinet's back on its wall, and the way its open front faces. */
  readonly x: number;
  readonly z: number;
  readonly facingX: number;
  readonly facingZ: number;
  /** Sells only once the map's power is on (dark until then). */
  readonly requiresPower: boolean;
  readonly requiresStartupCrystal?: boolean;
}

/** A map's weapon-station look: its steel, the plate over the cabinet and the colour of the weapon's charge. */
export interface WeaponStationLook {
  readonly materials: LockerMaterials;
  /** Plate fixed above the opening, already sized; it faces +Z. */
  readonly plate: { readonly geometry: THREE.BufferGeometry; readonly material: THREE.Material };
  /** Emissive colour of the spare charges and the lamp. */
  readonly glowColor: number;
  /** Spare charges shown on the tray (the refill stock). */
  readonly spares: number;
  /** Glow multiplier once the power switch feeds the map. */
  readonly mainsGlowBoost: number;
}

/**
 * Special-weapon station for any map: an open steel equipment cabinet with
 * its weapon hung on two hooks, a tray of spare charges under it (what the
 * refill sells) and a lamp on top. A station that needs the map's power
 * waits dark (weapon on show, no glow) until it comes on; then the spares
 * and the lamp glow in the weapon's colour, brighter on the mains. Once
 * bought the hooks stay empty; a purchase or refill flares the spares. The
 * carcass is static (shared batch) and solid; the weapon, spares and lamp
 * are animated here, lit by their own emissive materials, never a light.
 * Stands on the ground floor (floor 0, y 0).
 */
export class WeaponStation implements ArenaWeaponStation {
  readonly id: string;
  readonly weaponId: WeaponId;
  readonly price: number;
  readonly ammoPrice: number;
  readonly ammoPromptKey?: TranslationKey;
  readonly requiresStartupCrystal: boolean;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor = 0;
  readonly useRange = 2;
  readonly lookDotMin = 0.5;
  private readonly group = new THREE.Group();
  private readonly weapon: THREE.Group;
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly lamp: THREE.MeshBasicMaterial;
  private readonly halo: THREE.SpriteMaterial;
  private readonly glowColor: THREE.Color;
  private readonly requiresPower: boolean;
  private level = 0;
  private flash = 0;
  private time = 0;
  private locked = false;

  constructor(
    kit: MapBuildKit,
    config: WeaponStationPlacement,
    private readonly look: WeaponStationLook,
    private readonly power: MapPower,
  ) {
    this.id = config.id;
    this.weaponId = config.weaponId;
    this.price = config.price;
    this.ammoPrice = config.ammoPrice;
    this.ammoPromptKey = config.ammoPromptKey;
    this.requiresPower = config.requiresPower;
    this.requiresStartupCrystal = config.requiresStartupCrystal ?? false;
    const front = CABINET.depth + 0.05;
    this.position = { x: config.x + config.facingX * front, y: WEAPON_Y, z: config.z + config.facingZ * front };
    this.glowColor = new THREE.Color(look.glowColor);
    this.glow = new THREE.MeshStandardMaterial({
      name: 'weapon_station_charge', color: this.glowColor.clone().multiplyScalar(0.35), emissive: this.glowColor,
      emissiveIntensity: 0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85,
    });
    this.lamp = new THREE.MeshBasicMaterial({ name: 'weapon_station_lamp', color: this.glowColor.clone() });
    this.halo = new THREE.SpriteMaterial({
      name: 'weapon_station_halo', map: makeSoftDotTexture(), color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });

    this.group.name = `weapon-station:${config.id}`;
    this.group.position.set(config.x, 0, config.z);
    this.group.rotation.y = Math.atan2(config.facingX, config.facingZ);
    kit.group.add(this.group);
    this.buildCabinet(kit);
    this.weapon = this.buildWeapon();
    this.buildSpares();
    this.reset();
  }

  get powered(): boolean {
    return !this.requiresPower || this.power.on;
  }

  setOwned(owned: boolean): void {
    this.weapon.visible = !owned;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  activate(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.flash = Math.max(0, this.flash - FLASH_DECAY * dt);
    const target = this.powered ? GLOW.powered * (this.locked ? 0.15 : 1) : GLOW.off;
    this.level += (target - this.level) * (1 - Math.exp(-GLOW_EASE * dt));
    const mains = this.power.on ? this.look.mainsGlowBoost : 1;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 1.7);
    const glow = this.level * pulse * mains + this.flash * GLOW.flash;
    this.glow.emissiveIntensity = glow;
    this.lamp.color.copy(this.glowColor).multiplyScalar(0.04 + glow * 0.9);
    this.halo.opacity = Math.min(0.9, glow * 0.3);
  }

  reset(): void {
    this.time = 0;
    this.flash = 0;
    this.locked = this.requiresStartupCrystal;
    this.setOwned(false);
    this.level = this.powered ? GLOW.powered : GLOW.off;
    this.update(0);
  }

  /** Steel carcass, dark back, plinth, hooks, tray and the plate overhead: static and solid. */
  private buildCabinet(kit: MapBuildKit): void {
    const { materials } = this.look;
    const { width, height, depth, plinth } = CABINET;
    const world = placement(this.group.position.x, 0, this.group.position.z, 0, this.group.rotation.y, 0).clone();
    const local = new THREE.Matrix4();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): void => {
      local.makeTranslation(x, y, z);
      kit.batch.add(geometry, material, world.clone().multiply(local));
    };
    const half = width / 2;
    for (const side of [-1, 1]) part(new THREE.BoxGeometry(0.03, height, depth), materials.greySteel, side * (half - 0.015), height / 2, depth / 2);
    part(new THREE.BoxGeometry(width, 0.05, depth + 0.04), materials.greySteel, 0, height + 0.025, depth / 2 + 0.01);
    part(new THREE.BoxGeometry(width, plinth, depth), materials.paintedSteel, 0, plinth / 2, depth / 2);
    part(new THREE.BoxGeometry(width - 0.06, height - plinth, 0.02), materials.rubber, 0, plinth + (height - plinth) / 2, 0.01);
    // Tray for the spares and the two hooks the weapon hangs from.
    part(new THREE.BoxGeometry(width - 0.08, 0.025, depth * 0.7), materials.greySteel, 0, TRAY_Y - 0.03, depth * 0.4);
    part(new THREE.BoxGeometry(width - 0.08, 0.06, 0.012), materials.paintedSteel, 0, TRAY_Y - 0.005, depth * 0.75);
    for (const x of [-0.26, 0.26]) {
      part(new THREE.BoxGeometry(0.025, 0.025, depth * 0.55), materials.greySteel, x, WEAPON_Y - 0.075, depth * 0.3);
      part(new THREE.BoxGeometry(0.025, 0.05, 0.025), materials.greySteel, x, WEAPON_Y - 0.05, depth * 0.56);
    }
    kit.batch.add(this.look.plate.geometry, this.look.plate.material,
      world.clone().multiply(local.makeTranslation(0, height + 0.22, depth + 0.012)));
    const corners = [
      new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0),
      new THREE.Vector3(-half, 0, depth), new THREE.Vector3(half, 0, depth),
    ].map((corner) => corner.applyMatrix4(world));
    const min = { x: Math.min(...corners.map((c) => c.x)), y: 0, z: Math.min(...corners.map((c) => c.z)) };
    const max = { x: Math.max(...corners.map((c) => c.x)), y: height + 0.05, z: Math.max(...corners.map((c) => c.z)) };
    addSolidProxy(kit, `weapon-station-${this.id}`, min, max, 'metal');
  }

  /** The weapon itself on its hooks, its left flank (where a ФАКЕЛ-33 shows its crystal) to the room. */
  private buildWeapon(): THREE.Group {
    const model = buildWeaponDisplayModel(WEAPON_DEFINITIONS[this.weaponId], null, WEAPON_LENGTH);
    model.rotation.y = Math.PI / 2;
    model.position.set(0, WEAPON_Y, CABINET.depth * 0.45);
    model.name = 'weapon-station-weapon';
    this.group.add(model);
    const halo = new THREE.Sprite(this.halo);
    halo.position.set(0, WEAPON_Y, 0.06);
    halo.scale.set(1.3, 0.7, 1);
    this.group.add(halo);
    return model;
  }

  /** Spare charges standing in the tray and the lamp over the opening. */
  private buildSpares(): void {
    const { spares } = this.look;
    const geometry = new THREE.CylinderGeometry(SPARE.radius, SPARE.radius, SPARE.length, 6);
    for (let spare = 0; spare < spares; spare++) {
      const mesh = new THREE.Mesh(geometry, this.glow);
      mesh.name = 'weapon-station-spare';
      mesh.position.set((spare - (spares - 1) / 2) * SPARE_SPACING, TRAY_Y + SPARE.length / 2 - 0.015, CABINET.depth * 0.45);
      this.group.add(mesh);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), this.lamp);
    lamp.name = 'weapon-station-lamp';
    lamp.position.set(CABINET.width / 2 - 0.12, CABINET.height + 0.1, CABINET.depth * 0.6);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 10), this.look.materials.greySteel);
    cage.position.set(lamp.position.x, CABINET.height + 0.06, lamp.position.z);
    this.group.add(lamp, cage);
  }
}
