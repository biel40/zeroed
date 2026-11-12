import * as THREE from 'three';
import { WeaponFinishLayer, type WeaponFinish } from '../../../weapons/WeaponFinish';
import type { WeaponCatalog, WeaponId } from '../../../weapons/WeaponTypes';
import { buildWeaponDisplayModel } from '../../../weapons/WeaponView';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { ArenaUpgradeMachine } from '../ZombieArena';
import type { MapBuildKit } from './MapBuildKit';
import type { MapPower } from './MapPower';
import { addSolidProxy } from './SolidProxy';
import { placement } from './StaticMeshBatch';

/** Machine body, metres, in its own frame (front towards +Z, centred on its footprint). */
const BASE = { width: 2.1, height: 0.95, depth: 1.05 } as const;
/** The forge chamber across the top: a glowing tube between two copper coils. */
const CHAMBER = { y: 1.38, radius: 0.3, length: 1.2, coilRadius: 0.42, coilLength: 0.32 } as const;
const ELECTRODE = { x: 0.62, z: -0.32, top: 2.05 } as const;
/** Glow of the chamber: dark without power, a slow pulse on it, a stuttering blaze while forging. */
const GLOW = { off: 0, idle: 0.9, forging: 4.2, flash: 5 } as const;
const GLOW_EASE = 5;
const FLASH_DECAY = 1.6;
/** The weapon on show in the chamber while it forges: its length, and how fast it turns about its own axis. */
const DISPLAY = { length: 0.95, spin: 1.1 } as const;
/**
 * Share of the forge over which the finish paints itself onto the weapon on
 * show: it goes in bare, the finish spreads from stock to muzzle, and it
 * turns fully dressed for the last moments.
 */
const PAINT = { start: 0.1, end: 0.85 } as const;
/** While forging the glass clears and its glow is held down, so the weapon inside shows. */
const GLASS = { opacity: 0.8, forgingOpacity: 0.28, forgingGlowCap: 1.3, forgingHaloCap: 0.4 } as const;

/** Where a map puts its upgrade machine and what it charges. */
export interface UpgradeMachinePlacement {
  readonly id: string;
  /** Centre of the machine's footprint and the way its front faces. */
  readonly x: number;
  readonly z: number;
  readonly facingX: number;
  readonly facingZ: number;
  readonly cost: number;
  readonly damageMultiplier: number;
  /** Seconds a forge runs. */
  readonly forgeSeconds: number;
  /** Takes orders only once the map's power is on (dark until then). */
  readonly requiresPower: boolean;
}

/** A map's dressing of the machine: its steel and copper, the plate on its front, its glow and the finish it leaves. */
export interface UpgradeMachineLook {
  readonly materials: {
    readonly greySteel: THREE.Material;
    readonly paintedSteel: THREE.Material;
    readonly rubber: THREE.Material;
    readonly copper: THREE.Material;
  };
  /** Plate on the front of the base, already sized; it faces +Z. */
  readonly plate: { readonly geometry: THREE.BufferGeometry; readonly material: THREE.Material };
  readonly glowColor: number;
  /** Glow multiplier once the power switch feeds the map. */
  readonly mainsGlowBoost: number;
  readonly finish: WeaponFinish;
  /** The map's weapons, so the one on show in the chamber looks as it does in hand. */
  readonly weapons: WeaponCatalog;
}

/**
 * Weapon upgrade machine for any map: a heavy steel cabinet carrying a
 * forge chamber (a glowing tube between two copper coils) under two
 * electrodes. Dark until the map's power reaches it, then the chamber
 * pulses in the map's glow colour; paying for a forge makes it blaze and
 * stutter for `forgeSeconds` with the weapon turning inside its cleared
 * glass as the map's finish paints itself onto it, then flash as the
 * weapon is done. The
 * carcass is static batch geometry with one solid proxy; the chamber,
 * halo and lamp animate their own emissive materials, never a light.
 * Stands on the ground floor (floor 0, y 0).
 */
export class UpgradeMachine implements ArenaUpgradeMachine {
  public readonly id: string;
  public readonly position: { readonly x: number; readonly y: number; readonly z: number };
  public readonly floor = 0;
  public readonly useRange = 2.2;
  public readonly lookDotMin = 0.5;
  public readonly cost: number;
  public readonly damageMultiplier: number;
  public readonly finish: WeaponFinish;
  public readonly standPoint: { readonly x: number; readonly z: number; readonly yaw: number };
  private readonly forgeSeconds: number;
  private readonly requiresPower: boolean;
  private readonly group = new THREE.Group();
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly lamp: THREE.MeshBasicMaterial;
  private readonly halo: THREE.SpriteMaterial;
  private readonly glowColor: THREE.Color;
  private level = 0;
  private flash = 0;
  private time = 0;
  /** Seconds left of the running forge (0 when idle). */
  private forging = 0;
  /** Holder of the weapon on show in the chamber, turning while it forges. */
  private readonly display = new THREE.Group();
  /** Display models built so far, one per weapon forged here, each with the finish that paints it. */
  private readonly displayModels = new Map<WeaponId, { readonly model: THREE.Group; readonly finish: WeaponFinishLayer }>();
  /** Finish of the weapon on show, painted as the forge runs. */
  private shownFinish: WeaponFinishLayer | null = null;
  /** Called as a forge starts, so the map can voice it. */
  public onForge: ((weaponId: WeaponId) => void) | null = null;

  public constructor(
    kit: MapBuildKit,
    config: UpgradeMachinePlacement,
    private readonly look: UpgradeMachineLook,
    private readonly power: MapPower,
  ) {
    this.id = config.id;
    this.cost = config.cost;
    this.damageMultiplier = config.damageMultiplier;
    this.forgeSeconds = config.forgeSeconds;
    this.requiresPower = config.requiresPower;
    this.finish = look.finish;
    const front = BASE.depth / 2 + 0.1;
    this.position = { x: config.x + config.facingX * front, y: 1.2, z: config.z + config.facingZ * front };
    const stand = front + 0.9;
    this.standPoint = { x: config.x + config.facingX * stand, z: config.z + config.facingZ * stand, yaw: Math.atan2(config.facingX, config.facingZ) };
    this.glowColor = new THREE.Color(look.glowColor);
    this.glow = new THREE.MeshStandardMaterial({
      name: 'upgrade_machine_chamber', color: this.glowColor.clone().multiplyScalar(0.2), emissive: this.glowColor,
      emissiveIntensity: 0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8,
    });
    this.lamp = new THREE.MeshBasicMaterial({ name: 'upgrade_machine_lamp', color: this.glowColor.clone() });
    this.halo = new THREE.SpriteMaterial({
      name: 'upgrade_machine_halo', map: makeSoftDotTexture(), color: this.glowColor, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    this.group.name = `upgrade-machine:${config.id}`;
    this.group.position.set(config.x, 0, config.z);
    this.group.rotation.y = Math.atan2(config.facingX, config.facingZ);
    kit.group.add(this.group);
    this.buildCarcass(kit);
    this.buildChamber();
    this.reset();
  }

  public get powered(): boolean {
    return !this.requiresPower || this.power.on;
  }

  public get busy(): boolean {
    return this.forging > 0;
  }

  public forge(weaponId: WeaponId): void {
    this.forging = this.forgeSeconds;
    this.showWeapon(weaponId);
    this.onForge?.(weaponId);
  }

  public update(dt: number): void {
    const step = Math.max(0, dt);
    this.time += step;
    if (this.forging > 0) {
      this.forging = Math.max(0, this.forging - step);
      this.display.rotation.x += DISPLAY.spin * step;
      const progress = 1 - this.forging / Math.max(this.forgeSeconds, 1e-6);
      const reveal = THREE.MathUtils.smoothstep(progress, PAINT.start, PAINT.end);
      this.shownFinish?.setReveal(reveal);
      // Its arcs wake as the finish takes hold.
      this.shownFinish?.update(step, reveal);
      if (this.forging === 0) {
        this.flash = 1;
        this.display.visible = false;
      }
    }
    this.flash = Math.max(0, this.flash - FLASH_DECAY * step);
    const target = !this.powered ? GLOW.off : this.forging > 0 ? GLOW.forging : GLOW.idle;
    this.level += (target - this.level) * (1 - Math.exp(-GLOW_EASE * step));
    const mains = this.power.on ? this.look.mainsGlowBoost : 1;
    // Idle: a slow breath. Forging: the arc stutters like a failing starter.
    const pulse = this.forging > 0
      ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 23) * Math.sin(this.time * 7.1))
      : 0.8 + 0.2 * Math.sin(this.time * 1.4);
    const glow = this.level * pulse * mains + this.flash * GLOW.flash;
    const forging = this.forging > 0;
    this.glow.emissiveIntensity = forging ? Math.min(GLASS.forgingGlowCap, glow) : glow;
    this.glow.opacity = forging ? GLASS.forgingOpacity : GLASS.opacity;
    this.lamp.color.copy(this.glowColor).multiplyScalar(0.04 + Math.min(1.5, glow * 0.6));
    this.halo.opacity = Math.min(forging ? GLASS.forgingHaloCap : 0.95, glow * 0.22);
  }

  public reset(): void {
    this.time = 0;
    this.flash = 0;
    this.forging = 0;
    this.display.visible = false;
    this.display.rotation.x = 0;
    this.level = this.powered ? GLOW.idle : GLOW.off;
    this.update(0);
  }

  /**
   * Puts `weaponId` on show in the chamber, its barrel along the tube and
   * still bare of the finish, building its model the first time.
   */
  private showWeapon(weaponId: WeaponId): void {
    let shown = this.displayModels.get(weaponId);
    if (!shown) {
      const model = buildWeaponDisplayModel(this.look.weapons[weaponId], null, DISPLAY.length);
      model.rotation.y = Math.PI / 2;
      model.traverse((object) => { object.castShadow = false; });
      const finish = new WeaponFinishLayer(model, [], { paint: true });
      finish.apply(this.look.finish);
      shown = { model, finish };
      this.displayModels.set(weaponId, shown);
    }
    shown.finish.setReveal(0);
    this.shownFinish = shown.finish;
    this.display.clear();
    this.display.add(shown.model);
    this.display.rotation.x = 0;
    this.display.visible = true;
  }

  /** Cabinet, sloping control panel, coil housings, electrodes and plate: static and solid. */
  private buildCarcass(kit: MapBuildKit): void {
    const { materials, plate } = this.look;
    const world = placement(this.group.position.x, 0, this.group.position.z, 0, this.group.rotation.y, 0).clone();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotationX = 0, rotationZ = 0): void => {
      kit.batch.add(geometry, material, world.clone().multiply(placement(x, y, z, rotationX, 0, rotationZ)));
    };
    const { width, height, depth } = BASE;
    part(new THREE.BoxGeometry(width, height, depth), materials.paintedSteel, 0, height / 2, 0);
    part(new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.1), materials.greySteel, 0, 0.04, 0);
    part(new THREE.BoxGeometry(width + 0.06, 0.06, depth + 0.06), materials.greySteel, 0, height + 0.03, 0);
    part(new THREE.BoxGeometry(width * 0.7, 0.04, 0.36), materials.greySteel, 0, height - 0.05, depth / 2 + 0.12, -0.6);
    for (let index = 0; index < 6; index++) {
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), materials.rubber, -0.55 + index * 0.22, height - 0.02, depth / 2 + 0.14, -0.6 + Math.PI / 2);
    }
    part(plate.geometry, plate.material, 0, height * 0.55, depth / 2 + 0.006);
    for (const side of [-1, 1]) {
      const coilX = side * (CHAMBER.length / 2 + CHAMBER.coilLength / 2);
      part(new THREE.CylinderGeometry(CHAMBER.coilRadius, CHAMBER.coilRadius, CHAMBER.coilLength, 16), materials.copper, coilX, CHAMBER.y, 0, 0, Math.PI / 2);
      for (const band of [-0.1, 0.1]) {
        part(new THREE.CylinderGeometry(CHAMBER.coilRadius + 0.012, CHAMBER.coilRadius + 0.012, 0.03, 16, 1, true), materials.rubber, coilX + band, CHAMBER.y, 0, 0, Math.PI / 2);
      }
      part(new THREE.BoxGeometry(0.16, CHAMBER.y - height, 0.5), materials.greySteel, coilX, height + (CHAMBER.y - height) / 2, 0);
      const electrodeHeight = ELECTRODE.top - height;
      part(new THREE.CylinderGeometry(0.035, 0.05, electrodeHeight, 8), materials.greySteel, side * ELECTRODE.x, height + electrodeHeight / 2, ELECTRODE.z);
      part(new THREE.SphereGeometry(0.09, 10, 6), materials.copper, side * ELECTRODE.x, ELECTRODE.top, ELECTRODE.z);
    }
    // The cradle the weapon rests on inside the chamber.
    part(new THREE.BoxGeometry(CHAMBER.length * 0.9, 0.04, 0.16), materials.greySteel, 0, CHAMBER.y - 0.12, 0);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      new THREE.Vector3(sx * (width / 2 + 0.05), 0, sz * (depth / 2 + 0.05)).applyMatrix4(world));
    const min = { x: Math.min(...corners.map((c) => c.x)), y: 0, z: Math.min(...corners.map((c) => c.z)) };
    const max = { x: Math.max(...corners.map((c) => c.x)), y: CHAMBER.y + CHAMBER.coilRadius, z: Math.max(...corners.map((c) => c.z)) };
    // Coils and electrodes make an irregular top: no blood on the proxy.
    addSolidProxy(kit, `upgrade-machine-${this.id}`, min, max, 'metal', 'none');
  }

  /** The glowing tube, its halo and the status lamp: animated here. */
  private buildChamber(): void {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(CHAMBER.radius, CHAMBER.radius, CHAMBER.length, 20, 1, true), this.glow);
    tube.rotation.z = Math.PI / 2;
    tube.position.y = CHAMBER.y;
    tube.name = 'upgrade-machine-chamber';
    const halo = new THREE.Sprite(this.halo);
    halo.position.set(0, CHAMBER.y, 0.05);
    halo.scale.set(2.2, 1.1, 1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6), this.lamp);
    lamp.name = 'upgrade-machine-lamp';
    lamp.position.set(BASE.width / 2 - 0.15, BASE.height + 0.11, BASE.depth / 2 - 0.12);
    this.display.name = 'upgrade-machine-weapon';
    this.display.position.y = CHAMBER.y - 0.02;
    this.display.visible = false;
    this.group.add(tube, halo, lamp, this.display);
  }
}
