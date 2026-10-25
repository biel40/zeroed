import * as THREE from 'three';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import { placement } from '../shared/StaticMeshBatch';
import { POWER_LEVER } from '../Station33Config';
import type { ArenaPowerSwitch } from '../ZombieArena';
import { cobwebGeometry } from './Cobwebs';
import type { Station33BuildContext } from './Station33BuildContext';

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

/**
 * The station's main switch: a three-pole knife switch on a slate board,
 * rusted, hung with cobwebs and framed in hazard stripes under its danger
 * plate. Throwing it swings the blades up into the copper jaws (tearing the
 * web strung across them) and, as the contacts close in a spark, calls
 * `onThrown`, which powers the station. Static parts go to the shared
 * batch; the blades, the torn web and the spark animate here.
 */
export class PowerLever implements ArenaPowerSwitch {
  readonly id = 'station33-main-switch';
  readonly position = { x: POWER_LEVER.x, y: 1.5, z: POWER_LEVER.z + 0.35 } as const;
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

  constructor(context: Station33BuildContext, private readonly onThrown: () => void) {
    this.group.name = 'power-lever';
    this.group.position.set(POWER_LEVER.x, 0, POWER_LEVER.z);
    context.group.add(this.group);
    this.buildMount(context);
    this.buildBlades(context);
    this.buildTornWebs(context);
    this.spark = new THREE.SpriteMaterial({
      name: 'station33_switch_spark', map: makeSoftDotTexture(), color: 0xcfe6ff, transparent: true,
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

  /** Painted plate, hazard frame, slate board, copper jaws and hinge clips, feed cables, plate and webs. */
  private buildMount(context: Station33BuildContext): void {
    const { batch, materials, signage, structure } = context;
    const world = placement(POWER_LEVER.x, 0, POWER_LEVER.z).clone();
    const local = new THREE.Matrix4();
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): void => {
      local.makeTranslation(x, y, z);
      batch.add(geometry, material, world.clone().multiply(local));
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
    part(signage.signGeometry('main-switch', 0.7, 0.35), signage.material, 0, centerY + height / 2 + 0.36, 0.012);
    // Old webs in the frame's corners, grey with dust.
    part(cobwebGeometry(0.42, 0.42, 'top-left'), materials.cobweb, -width / 2 - 0.08, centerY + height / 2 + 0.08, 0.08);
    part(cobwebGeometry(0.34, 0.5, 'bottom-right'), materials.cobweb, width / 2 + 0.08, centerY - height / 2 - 0.08, 0.08);
    part(cobwebGeometry(0.3, 0.3, 'top-right'), materials.cobweb, width / 2 + 0.08, centerY + height / 2 + 0.08, 0.08);
    const halfWidth = width / 2 + 0.1;
    structure.addBox(POWER_LEVER.x, (centerY + height / 2) / 2 + 0.05, POWER_LEVER.z + 0.15, halfWidth * 2, centerY + height / 2 + 0.1, 0.3, materials.collider, {
      name: 'power-lever', surface: 'metal', mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true,
    });
  }

  /**
   * One web strung across the copper jaws and one from each outer hanging
   * blade back to the slate: all in the blades' path, gone once thrown.
   */
  private buildTornWebs(context: Station33BuildContext): void {
    const { cobweb } = context.materials;
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
  private buildBlades(context: Station33BuildContext): void {
    const { materials } = context;
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
