import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { GroundRect } from '../../guardians/CaptainUssrBrain';
import { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { PROTOCOL33_SURFACE_Y, PROTOCOL33_TRUCK, PROTOCOL33_TRUCK_BEACON_LIGHT, PROTOCOL33_TRUCK_BUMPER_REACH } from '../Station33Config';
import type { EscapeDrivePose } from './EscapeDrive';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { yardSolid } from './YardSolid';

const GROUND = PROTOCOL33_SURFACE_Y;
const { x: TRUCK_X, z: TRUCK_Z, length, width, height, cabOffset } = PROTOCOL33_TRUCK;
/** Nose and tail on the rig's own axis (the rig's origin is the truck's centre on the ground). */
const FRONT = -length / 2;
const REAR = length / 2;
/** How far the rear doors stand open as parked, in radians from shut. */
const DOOR_OPEN_ANGLE = 1.75;
const WHEEL_RADIUS = 0.55;
/** Axles, metres behind the nose. */
const AXLES = [1.15, 4.95, 6.25] as const;
const BODY_FRONT = cabOffset + 0.65;
const BODY_BOTTOM = 1.0;
const CAB_TOP = 2.525;
const HEADLIGHT = { dx: 0.85, y: 1.55 } as const;
const TAIL_LIGHT = { dx: width / 2 - 0.3, y: 0.86 } as const;
/** Light falling out of each headlamp into the night air. */
const BEAM = { length: 18, radius: 2.3, droop: 0.05, opacity: 0.16 } as const;
const HEADLIGHT_DARK = new THREE.Color(0x1c1d1a);
const HEADLIGHT_LIT = new THREE.Color(0xfff3d6);
const TAIL_DARK = new THREE.Color(0x240705);
const TAIL_LIT = new THREE.Color(0xff2b16);

interface RearDoor {
  readonly hinge: THREE.Object3D;
  readonly side: number;
}

/**
 * The olive 6x6 evacuation truck (box body, the medical kung) as its own
 * rig, so the filmed ending can drive it away: bonnet and cab, six wheels
 * on three spinning axles, the rear doors swung open on their hinges, dead
 * headlamps and tail lights that come alive, the beams they throw, and the
 * cab's beacon carrying its real light along. Parked, it is a solid on the
 * yard; its proxies (`solids`) never move, because the ending has no play.
 */
export class EscapeTruck {
  public readonly solids: ReadonlyArray<GroundRect>;
  private readonly rig = new THREE.Group();
  private readonly axles: THREE.Object3D[] = [];
  private readonly doors: RearDoor[] = [];
  private readonly headlightMaterial = new THREE.MeshBasicMaterial({ name: 'truck_headlight', color: HEADLIGHT_DARK.clone(), toneMapped: false });
  private readonly tailLightMaterial = new THREE.MeshBasicMaterial({ name: 'truck_tail_light', color: TAIL_DARK.clone(), toneMapped: false });
  private readonly beams: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly headHalo: THREE.SpriteMaterial;
  private readonly tailHalo: THREE.SpriteMaterial;
  private readonly halos: THREE.Sprite[] = [];

  public constructor(context: Station33BuildContext, lighting: Station33Lighting) {
    this.rig.name = 'surface-truck';
    this.rig.position.set(TRUCK_X, GROUND, TRUCK_Z);
    context.group.add(this.rig);
    const shadows = { castShadow: !context.profile.useReducedEffects, receiveShadow: true };
    const batch = new StaticMeshBatch();
    buildChassis(context, batch, lighting);
    this.buildLamps(batch);
    batch.build(this.rig, 'station33-truck', shadows);
    for (const fromNose of AXLES) this.axles.push(this.buildAxle(context, fromNose, shadows));
    for (const side of [-1, 1]) this.doors.push(this.buildDoor(context, side));
    this.beams = buildBeams();
    this.rig.add(this.beams);
    const halo = makeSoftDotTexture();
    this.headHalo = new THREE.SpriteMaterial({ map: halo, color: HEADLIGHT_LIT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tailHalo = new THREE.SpriteMaterial({ map: halo, color: TAIL_LIT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const side of [-1, 1]) {
      this.addHalo(this.headHalo, side * HEADLIGHT.dx, HEADLIGHT.y, FRONT - 0.12, 1.5);
      this.addHalo(this.tailHalo, side * TAIL_LIGHT.dx, TAIL_LIGHT.y, REAR + 0.1, 0.55);
    }
    this.rig.attach(lighting.pointLight(PROTOCOL33_TRUCK_BEACON_LIGHT));
    this.solids = buildProxies(context);
  }

  /** Puts the truck where `pose` says: driven down the road, wheels turned, doors and lamps as they are then. */
  public pose(pose: EscapeDrivePose): void {
    this.rig.position.z = TRUCK_Z - pose.distance;
    this.rig.rotation.x = pose.jolt;
    const spin = -pose.distance / WHEEL_RADIUS;
    for (const axle of this.axles) axle.rotation.x = spin;
    for (const door of this.doors) door.hinge.rotation.y = door.side * DOOR_OPEN_ANGLE * (1 - pose.doorsShut);
    const level = pose.headlights;
    this.headlightMaterial.color.lerpColors(HEADLIGHT_DARK, HEADLIGHT_LIT, level);
    this.tailLightMaterial.color.lerpColors(TAIL_DARK, TAIL_LIT, level);
    this.beams.material.opacity = BEAM.opacity * level;
    this.headHalo.opacity = 0.9 * level;
    this.tailHalo.opacity = 0.7 * level;
    const lit = level > 0;
    this.beams.visible = lit;
    for (const halo of this.halos) halo.visible = lit;
  }

  /** Headlamp lenses at the nose and tail lights on the rear bumper, on materials the pose lights up. */
  private buildLamps(batch: StaticMeshBatch): void {
    for (const side of [-1, 1]) {
      const lens = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12).rotateX(Math.PI / 2);
      batch.add(lens.translate(side * HEADLIGHT.dx, HEADLIGHT.y, FRONT - 0.02), this.headlightMaterial);
      batch.addBox(this.tailLightMaterial, side * TAIL_LIGHT.dx, TAIL_LIGHT.y, REAR + 0.06, 0.2, 0.1, 0.04);
    }
  }

  /** Both wheels of one axle with their hubs, on a pivot that spins; a cross on each hub shows the roll. */
  private buildAxle(context: Station33BuildContext, fromNose: number, shadows: { castShadow: boolean; receiveShadow: boolean }): THREE.Object3D {
    const { materials } = context;
    const axle = new THREE.Group();
    axle.name = 'surface-truck-axle';
    axle.position.set(0, WHEEL_RADIUS, FRONT + fromNose);
    const batch = new StaticMeshBatch();
    for (const side of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.4, 18).rotateZ(Math.PI / 2).translate(side, 0, 0), materials.rubber);
      batch.add(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 10).rotateZ(Math.PI / 2).translate(side, 0, 0), materials.greySteel);
      batch.addBox(materials.greySteel, side * 1.215, 0, 0, 0.02, 0.4, 0.06);
      batch.addBox(materials.greySteel, side * 1.215, 0, 0, 0.02, 0.06, 0.4);
    }
    batch.build(axle, 'station33-truck-axle', shadows);
    this.rig.add(axle);
    return axle;
  }

  /** A rear door leaf on its hinge at the body's back corner; shut, it reaches the middle. */
  private buildDoor(context: Station33BuildContext, side: number): RearDoor {
    const leafLength = width / 2 - 0.04;
    const hinge = new THREE.Group();
    hinge.name = 'surface-truck-door';
    hinge.position.set(side * (width / 2), (BODY_BOTTOM + height) / 2, REAR + 0.02);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafLength, height - BODY_BOTTOM - 0.1, 0.05).translate(-side * leafLength / 2, 0, 0),
      context.materials.paintedSteel,
    );
    leaf.castShadow = !context.profile.useReducedEffects;
    leaf.receiveShadow = true;
    hinge.add(leaf);
    hinge.rotation.y = side * DOOR_OPEN_ANGLE;
    this.rig.add(hinge);
    return { hinge, side };
  }

  private addHalo(material: THREE.SpriteMaterial, x: number, y: number, z: number, size: number): void {
    const halo = new THREE.Sprite(material);
    halo.position.set(x, y, z);
    halo.scale.setScalar(size);
    halo.visible = false;
    this.rig.add(halo);
    this.halos.push(halo);
  }
}

/** Everything rigid on the truck, in the rig's frame: wheels apart, it is all one batch. */
function buildChassis(context: Station33BuildContext, batch: StaticMeshBatch, lighting: Station33Lighting): void {
  const { materials } = context;
  /** Box on the truck: `fromNose` metres behind the nose, `y` over the ground, `dx` across. */
  const part = (material: THREE.Material, fromNose: number, y: number, w: number, h: number, d: number, dx = 0): void =>
    batch.addBox(material, dx, y, FRONT + fromNose, w, h, d);
  // Mudguards over the rear bogie and the frame under it all.
  for (const side of [-1, 1]) part(materials.paintedSteel, (AXLES[1] + AXLES[2]) / 2, 1.2, 0.48, 0.06, 2.6, side);
  part(materials.greySteel, length / 2, 0.82, 1.3, 0.2, length - 0.3);
  // Bonnet, grille, bumper and front wings.
  part(materials.paintedSteel, 0.6, 1.4, 2.0, 0.85, 1.2);
  part(materials.greySteel, 0.01, 1.35, 1.2, 0.6, 0.04);
  for (let slat = -2; slat <= 2; slat++) part(materials.rubber, -0.01, 1.35, 0.06, 0.52, 0.02, slat * 0.2);
  part(materials.greySteel, -PROTOCOL33_TRUCK_BUMPER_REACH / 2, 0.95, width - 0.1, 0.2, PROTOCOL33_TRUCK_BUMPER_REACH);
  for (const side of [-1, 1]) {
    part(materials.paintedSteel, AXLES[0], 1.1, 0.5, 0.12, 1.3, side);
    // Mirror arms out of the cab.
    part(materials.greySteel, cabOffset - 0.45, 2.1, 0.32, 0.03, 0.03, side * (width / 2 + 0.12));
    part(materials.rubber, cabOffset - 0.45, 2.1, 0.03, 0.26, 0.16, side * (width / 2 + 0.28));
  }
  // Cab with its windscreen, side windows and the battery beacon on the roof.
  part(materials.paintedSteel, cabOffset, (0.975 + CAB_TOP) / 2, width - 0.1, CAB_TOP - 0.975, 1.1);
  part(materials.windowGlass, cabOffset - 0.56, 2.05, width - 0.4, 0.6, 0.03);
  for (const side of [-1, 1]) part(materials.windowGlass, cabOffset, 2.05, 0.03, 0.55, 0.7, side * (width / 2 - 0.04));
  batch.add(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12).translate(0, CAB_TOP + 0.1, FRONT + cabOffset), lighting.circuitMaterial('emergency'));
  // Fuel tank under the body's west side, the spare wheel on its east flank.
  batch.add(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 14).rotateX(Math.PI / 2).translate(-width / 2 + 0.2, 0.75, FRONT + 3.1), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.36, 18).rotateZ(Math.PI / 2).translate(width / 2 + 0.2, 1.85, FRONT + 3.4), materials.rubber);
  // The box body, open at the back on its dark inside, with a ladder down.
  part(materials.paintedSteel, (BODY_FRONT + length) / 2 - 0.05, (BODY_BOTTOM + height) / 2, width, height - BODY_BOTTOM, length - BODY_FRONT - 0.1);
  // Ribs along the body and a red cross panel on each flank: the medical kung of the evacuation.
  for (let rib = BODY_FRONT + 0.5; rib < length - 0.3; rib += 0.9) {
    part(materials.greySteel, rib, (BODY_BOTTOM + height) / 2, width + 0.04, height - BODY_BOTTOM - 0.1, 0.05);
  }
  for (const side of [-1, 1]) {
    const flank = side * (width / 2 + 0.03);
    part(materials.stucco, (BODY_FRONT + length) / 2, 2.15, 0.02, 0.9, 0.9, flank);
    part(materials.redEnamel, (BODY_FRONT + length) / 2, 2.15, 0.03, 0.62, 0.2, flank);
    part(materials.redEnamel, (BODY_FRONT + length) / 2, 2.15, 0.03, 0.2, 0.62, flank);
  }
  batch.addBox(materials.rubber, 0, (BODY_BOTTOM + height) / 2, REAR - 0.06, width - 0.16, height - BODY_BOTTOM - 0.16, 0.02);
  // Rear bumper carrying the tail lights.
  batch.addBox(materials.greySteel, 0, TAIL_LIGHT.y, REAR - 0.02, width - 0.2, 0.14, 0.1);
  for (const side of [-0.3, 0.3]) part(materials.greySteel, length + 0.22, 0.55, 0.04, 1.0, 0.04, side);
  for (const rung of [0.3, 0.6, 0.9]) part(materials.greySteel, length + 0.4 - rung * 0.36, rung, 0.6, 0.03, 0.05);
}

/**
 * Two additive cones from the headlamps, a touch downwards, fading out
 * along their length through vertex colours: the light in the night air.
 */
function buildBeams(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const cones = [-1, 1].map((side) => {
    // Apex at the lamp, opening forward (-z).
    const cone = new THREE.ConeGeometry(BEAM.radius, BEAM.length, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -BEAM.length / 2);
    const positions = cone.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const fade = (1 - Math.min(1, -positions.getZ(index) / BEAM.length)) ** 1.6;
      colors.set([fade, fade, fade], index * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return cone.rotateX(-BEAM.droop).translate(side * HEADLIGHT.dx, HEADLIGHT.y, FRONT - 0.05);
  });
  const geometry = mergeGeometries(cones);
  for (const cone of cones) cone.dispose();
  if (!geometry) throw new Error('Unable to merge the truck headlight beams');
  const beams = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    name: 'truck_headlight_beam',
    color: HEADLIGHT_LIT,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  }));
  beams.name = 'surface-truck-beams';
  beams.visible = false;
  return beams;
}

/** The parked truck's solids: its body and both open door leaves, in world space. */
function buildProxies(context: Station33BuildContext): GroundRect[] {
  const frontZ = TRUCK_Z + FRONT;
  const rearZ = TRUCK_Z + REAR;
  const leafLength = width / 2 - 0.04;
  const solids: GroundRect[] = [];
  for (const side of [-1, 1]) {
    const hingeX = TRUCK_X + side * (width / 2);
    const reachX = hingeX - side * Math.cos(DOOR_OPEN_ANGLE) * leafLength;
    solids.push(yardSolid(context, 'surface-truck-door', 'metal',
      { minX: Math.min(hingeX, reachX) - 0.05, maxX: Math.max(hingeX, reachX) + 0.05, minZ: rearZ, maxZ: rearZ + Math.sin(DOOR_OPEN_ANGLE) * leafLength + 0.05 },
      GROUND + BODY_BOTTOM, GROUND + height - 0.1));
  }
  solids.push(yardSolid(context, 'surface-truck', 'metal', { minX: TRUCK_X - width / 2, maxX: TRUCK_X + width / 2, minZ: frontZ - 0.2, maxZ: rearZ + 0.1 }, GROUND, GROUND + height));
  return solids;
}
