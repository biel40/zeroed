import * as THREE from 'three';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { ArenaPowerSwitch } from '../ZombieArena';
import { cobwebGeometry } from './Cobwebs';
import type { MapBuildKit } from './MapBuildKit';
import { addSolidProxy } from './SolidProxy';
import { placement } from './StaticMeshBatch';

/** Mounting plate on the wall: width, height and centre height. */
const PLATE = { width: 1.1, height: 1.6, centerY: 1.6 } as const;
/** Hinge of the knife blades, out from the wall face, and their length up to the jaws. */
const HINGE = { y: 1.22, out: 0.17 } as const;
const BLADE_LENGTH = 0.76;
const BLADE_XS = [-0.18, 0, 0.18] as const;
/** Open (off) the blades hang forward and down; closed (on) they stand in the jaws. */
const OPEN_ANGLE = 1.9;
/** Seconds the rusted handle takes to come over; it gathers speed as it goes. */
const THROW_DURATION = 0.55;
/** Share of the throw where the blades tear through the web across the jaws. */
const WEB_TEAR_AT = 0.7;
const SPARK_DURATION = 0.4;
/** Where the player stands to use it and how deep its proxy stands out of the wall. */
const USE_POINT_OUT = 0.35;
const PROXY_DEPTH = 0.3;

/** Where a map mounts its power switch: on a wall face at (x, z), facing into the room. */
export interface PowerLeverPlacement {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly facingX: number;
  readonly facingZ: number;
}

/** Materials of the switch, named as the maps' material sets name them. */
export interface PowerLeverMaterials {
  readonly greySteel: THREE.Material;
  readonly hazardPaint: THREE.Material;
  readonly darkGranite: THREE.Material;
  readonly bronze: THREE.Material;
  readonly rubber: THREE.Material;
  readonly varnishedWood: THREE.Material;
  readonly cobweb: THREE.Material;
}

/** A map's switch look: its materials and, optionally, the danger plate over it. */
export interface PowerLeverLook {
  readonly materials: PowerLeverMaterials;
  readonly plate?: { readonly geometry: THREE.BufferGeometry; readonly material: THREE.Material };
}

/**
 * Main power switch for any map: a three-pole knife switch on a slate
 * board, rusted, hung with cobwebs and framed in hazard stripes under its
 * danger plate. Throwing it swings the blades up into the copper jaws
 * (tearing the web strung across them) and, as the contacts close in a
 * spark, calls `onThrown`, which powers the map (`MapPower`). Static parts
 * go to the shared batch; the blades, the torn web and the spark animate
 * here. Stands on the ground floor (floor 0, y 0).
 */
export class PowerLever implements ArenaPowerSwitch {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor = 0;
  readonly useRange = 2.0;
  readonly lookDotMin = 0.5;
  private readonly group = new THREE.Group();
  private readonly blades = new THREE.Group();
  /** Webs in the blades' path, torn as they swing up. */
  private readonly tornWebs = new THREE.Group();
  private readonly spark: THREE.SpriteMaterial;
  private thrown = false;
  /** Seconds into the throw while it plays, else null. */
  private throwElapsed: number | null = null;
  private sparkRemaining = 0;

  constructor(
    kit: MapBuildKit,
    config: PowerLeverPlacement,
    look: PowerLeverLook,
    private readonly onThrown: () => void,
  ) {
    this.id = config.id;
    this.position = { x: config.x + config.facingX * USE_POINT_OUT, y: 1.5, z: config.z + config.facingZ * USE_POINT_OUT };
    this.group.name = 'power-lever';
    this.group.position.set(config.x, 0, config.z);
    this.group.rotation.y = Math.atan2(config.facingX, config.facingZ);
    kit.group.add(this.group);
    this.buildMount(kit, config, look);
    this.buildBlades(look.materials);
    this.buildTornWebs(look.materials.cobweb);
    this.spark = new THREE.SpriteMaterial({
      name: 'power_lever_spark', map: makeSoftDotTexture(), color: 0xcfe6ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    const spark = new THREE.Sprite(this.spark);
    spark.position.set(0, HINGE.y + BLADE_LENGTH, HINGE.out + 0.05);
    spark.scale.setScalar(0.8);
    this.group.add(spark);
    this.reset();
  }

  get isOn(): boolean {
    return this.thrown;
  }

  activate(): boolean {
    if (this.thrown) return false;
    this.thrown = true;
    this.throwElapsed = 0;
    return true;
  }

  update(dt: number): void {
    this.sparkRemaining = Math.max(0, this.sparkRemaining - Math.max(0, dt));
    this.spark.opacity = (this.sparkRemaining / SPARK_DURATION) ** 2;
    if (this.throwElapsed === null) return;
    this.throwElapsed += Math.max(0, dt);
    const progress = Math.min(1, this.throwElapsed / THROW_DURATION);
    this.blades.rotation.x = OPEN_ANGLE * (1 - progress * progress);
    if (progress >= WEB_TEAR_AT) this.tornWebs.visible = false;
    if (progress < 1) return;
    this.throwElapsed = null;
    this.sparkRemaining = SPARK_DURATION;
    this.onThrown();
  }

  /** New run: blades open, the web whole again across the jaws. */
  reset(): void {
    this.thrown = false;
    this.throwElapsed = null;
    this.sparkRemaining = 0;
    this.spark.opacity = 0;
    this.blades.rotation.x = OPEN_ANGLE;
    this.tornWebs.visible = true;
  }

  /** Painted plate, hazard frame, slate board, copper jaws and hinge clips, feed cables, danger plate and webs. */
  private buildMount(kit: MapBuildKit, config: PowerLeverPlacement, look: PowerLeverLook): void {
    const { materials } = look;
    const world = placement(config.x, 0, config.z, 0, this.group.rotation.y, 0).clone();
    const local = new THREE.Matrix4();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): void => {
      local.makeTranslation(x, y, z);
      kit.batch.add(geometry, material, world.clone().multiply(local));
    };
    const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void =>
      part(new THREE.BoxGeometry(width, height, depth), material, x, y, z);
    const { width, height, centerY } = PLATE;
    box(materials.greySteel, 0, centerY, 0.03, width, height, 0.06);
    for (const side of [-1, 1]) box(materials.hazardPaint, side * (width / 2 + 0.04), centerY, 0.035, 0.08, height, 0.07);
    for (const y of [centerY + height / 2 + 0.04, centerY - height / 2 - 0.04]) box(materials.hazardPaint, 0, y, 0.035, width + 0.16, 0.08, 0.07);
    box(materials.darkGranite, 0, centerY, 0.09, 0.62, 0.95, 0.06);
    for (const x of BLADE_XS) {
      for (const side of [-1, 1]) box(materials.bronze, x + side * 0.025, HINGE.y + BLADE_LENGTH, HINGE.out, 0.02, 0.14, 0.1);
      box(materials.bronze, x, HINGE.y, HINGE.out, 0.08, 0.08, 0.1);
      const feed = new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6);
      part(feed, materials.rubber, x, HINGE.y + BLADE_LENGTH + 0.32, 0.13);
    }
    if (look.plate) part(look.plate.geometry, look.plate.material, 0, centerY + height / 2 + 0.36, 0.012);
    // Old webs in the frame's corners, grey with dust.
    part(cobwebGeometry(0.42, 0.42, 'top-left'), materials.cobweb, -width / 2 - 0.08, centerY + height / 2 + 0.08, 0.08);
    part(cobwebGeometry(0.34, 0.5, 'bottom-right'), materials.cobweb, width / 2 + 0.08, centerY - height / 2 - 0.08, 0.08);
    part(cobwebGeometry(0.3, 0.3, 'top-right'), materials.cobweb, width / 2 + 0.08, centerY + height / 2 + 0.08, 0.08);
    // One axis-aligned proxy over the board, as wide as its frame and standing out of the wall.
    const halfAlong = width / 2 + 0.1;
    const top = centerY + height / 2 + 0.1;
    const alongX = Math.abs(config.facingZ) > Math.abs(config.facingX);
    const centerX = config.x + config.facingX * PROXY_DEPTH / 2;
    const centerZ = config.z + config.facingZ * PROXY_DEPTH / 2;
    const halfX = alongX ? halfAlong : PROXY_DEPTH / 2;
    const halfZ = alongX ? PROXY_DEPTH / 2 : halfAlong;
    addSolidProxy(kit, 'power-lever', { x: centerX - halfX, y: 0, z: centerZ - halfZ }, { x: centerX + halfX, y: top, z: centerZ + halfZ }, 'metal', 'none');
  }

  /**
   * One web strung across the copper jaws and one from each outer hanging
   * blade back to the slate: all in the blades' path, gone once thrown.
   */
  private buildTornWebs(cobweb: THREE.Material): void {
    const jaws = new THREE.Mesh(cobwebGeometry(0.62, 0.55, 'top-left').translate(-0.36, 2.34, HINGE.out + 0.05), cobweb);
    this.tornWebs.add(jaws);
    for (const x of [BLADE_XS[0] - 0.01, BLADE_XS[2] + 0.01]) {
      // Turned so the plane runs out from the wall (+Z), anchored at the slate above the hinge.
      const strand = new THREE.Mesh(cobwebGeometry(0.62, 0.5, 'top-left').rotateY(-Math.PI / 2).translate(x, HINGE.y + 0.32, 0.12), cobweb);
      this.tornWebs.add(strand);
    }
    this.tornWebs.name = 'power-lever-web';
    this.group.add(this.tornWebs);
  }

  /** Three blades on their hinge, the insulating crossbar and the handle with its worn wooden grip. */
  private buildBlades(materials: PowerLeverMaterials): void {
    this.blades.position.set(0, HINGE.y, HINGE.out);
    this.blades.name = 'power-lever-blades';
    for (const x of BLADE_XS) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, BLADE_LENGTH, 0.06), materials.greySteel);
      blade.position.set(x, BLADE_LENGTH / 2, 0);
      this.blades.add(blade);
    }
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), materials.rubber);
    crossbar.position.set(0, BLADE_LENGTH * 0.9, 0.02);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8).rotateX(Math.PI / 2), materials.greySteel);
    rod.position.set(0, BLADE_LENGTH * 0.9, 0.2);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.22, 10).rotateX(Math.PI / 2), materials.varnishedWood);
    grip.position.set(0, BLADE_LENGTH * 0.9, 0.46);
    this.blades.add(crossbar, rod, grip);
    this.group.add(this.blades);
  }
}
