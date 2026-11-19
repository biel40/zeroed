import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GroundRect } from '../../guardians/CaptainUssrBrain';
import { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { PROTOCOL33_SURFACE_Y, PROTOCOL33_TRUCK, PROTOCOL33_TRUCK_BEACON_LIGHT } from '../Station33Config';
import type { EscapeDrivePose } from './EscapeDrive';
import { buildTruckCab } from './EscapeTruckCab';
import { buildTruckAxleHousings, buildTruckChassis } from './EscapeTruckChassis';
import { EscapeTruckLamps } from './EscapeTruckLamps';
import { AXLES, BODY, CAB, CAB_OFFSET, FRONT, REAR, TruckPartBatch, TRUCK_WIDTH, WHEEL_RADIUS, WHEEL_TRACK } from './EscapeTruckLayout';
import { createEscapeTruckMaterials, type EscapeTruckMaterials, lightTruckCabin } from './EscapeTruckMaterials';
import { createTruckBodySway, truckBodySway } from './EscapeTruckMotion';
import { EscapeTruckTrail } from './EscapeTruckTrail';
import { addTruckWheel } from './EscapeTruckWheel';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { yardSolid } from './YardSolid';

const GROUND = PROTOCOL33_SURFACE_Y;
const { x: TRUCK_X, z: TRUCK_Z } = PROTOCOL33_TRUCK;
/** How far the rear doors stand open as parked, in radians from shut. */
const DOOR_OPEN_ANGLE = 1.75;
const DOOR_LEAF = { length: TRUCK_WIDTH / 2 - 0.04, height: BODY.top - BODY.bottom - 0.1 } as const;
/** The ground pools dim away down the road, where the fog would have swallowed them. */
const POOL_FADE = { from: 45, to: 90 } as const;
/** The pennant under the cab roof follows the body late and swings wider. */
const PENNANT = { lag: 0.16, swing: 9 } as const;

interface ShadowOptions {
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

interface RearDoor {
  readonly hinge: THREE.Object3D;
  readonly side: number;
}

/**
 * The olive 6x6 evacuation truck (forward-control cab, the medical kung
 * behind it) as its own rig, so the filmed ending can drive it away. The
 * rig carries what stays on the road: six wheels spinning on three axles
 * and the light pools on the ground. Its sprung body rides
 * over them, shivering at idle and rocking on the road's bumps: chassis,
 * cab and interior (`EscapeTruckChassis`, `EscapeTruckCab`), the lamps and
 * their beams (`EscapeTruckLamps`), the rear doors on their hinges and the
 * cab's beacon carrying its real light along. The wake (`EscapeTruckTrail`)
 * smokes and sprays behind it. Parked, it is a solid on the yard; its
 * proxies (`solids`) never move, because the ending has no play.
 */
export class EscapeTruck {
  public readonly solids: ReadonlyArray<GroundRect>;
  private readonly rig = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly axles: THREE.Object3D[] = [];
  private readonly doors: RearDoor[] = [];
  private readonly materials: EscapeTruckMaterials;
  private readonly lamps: EscapeTruckLamps;
  private readonly trail: EscapeTruckTrail;
  private readonly pennant: THREE.Object3D;
  private readonly sway = createTruckBodySway();
  private readonly pennantSway = createTruckBodySway();

  public constructor(context: Station33BuildContext, lighting: Station33Lighting) {
    this.rig.name = 'surface-truck';
    this.rig.position.set(TRUCK_X, GROUND, TRUCK_Z);
    this.body.name = 'surface-truck-body';
    this.rig.add(this.body);
    context.group.add(this.rig);
    const shadows = { castShadow: !context.profile.useReducedEffects, receiveShadow: true };
    this.materials = createEscapeTruckMaterials(context.materials);
    const bodyBatch = new StaticMeshBatch();
    const bodyParts = new TruckPartBatch(bodyBatch);
    buildTruckChassis(bodyParts, bodyBatch, this.materials);
    buildTruckCab(bodyParts, this.materials);
    // The axle beams ride with the body: a centimetre of sway is not worth their own draw.
    buildTruckAxleHousings(bodyParts, this.materials);
    bodyParts.addFromNose(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12).translate(0, CAB.top + 0.1, CAB_OFFSET), lighting.circuitMaterial('emergency'));
    this.lamps = new EscapeTruckLamps(bodyParts, this.materials, this.body, this.rig);
    buildMeshes(bodyBatch, this.body, 'station33-truck', shadows);
    for (const fromNose of AXLES) this.axles.push(this.buildAxle(fromNose, shadows));
    for (const side of [-1, 1]) this.doors.push(this.buildDoor(side, shadows));
    this.pennant = this.buildPennant();
    this.trail = new EscapeTruckTrail(context.group, context.profile.useReducedEffects);
    this.rig.attach(lighting.pointLight(PROTOCOL33_TRUCK_BEACON_LIGHT));
    this.solids = buildProxies(context);
  }

  /** Puts the truck where `pose` says: driven down the road, wheels turned, body swaying, doors and lamps as they are then. */
  public pose(pose: EscapeDrivePose): void {
    this.rig.position.z = TRUCK_Z - pose.distance;
    this.rig.rotation.x = pose.jolt;
    const spin = -pose.distance / WHEEL_RADIUS;
    for (const axle of this.axles) axle.rotation.x = spin;
    truckBodySway(pose, this.sway);
    this.body.position.y = this.sway.heave;
    this.body.rotation.x = this.sway.pitch;
    this.body.rotation.z = -this.sway.roll;
    truckBodySway(pose, this.pennantSway, PENNANT.lag);
    this.pennant.rotation.x = (this.sway.pitch - this.pennantSway.pitch) * PENNANT.swing - pose.jolt * PENNANT.swing;
    this.pennant.rotation.z = (this.pennantSway.roll - this.sway.roll) * PENNANT.swing;
    for (const door of this.doors) door.hinge.rotation.y = door.side * DOOR_OPEN_ANGLE * (1 - pose.doorsShut);
    this.lamps.light(pose.headlights, 1 - THREE.MathUtils.smoothstep(pose.distance, POOL_FADE.from, POOL_FADE.to));
    lightTruckCabin(this.materials, pose.headlights);
    this.trail.update(pose, this.rig.position);
  }

  /** Both wheels of one axle on a pivot that spins. */
  private buildAxle(fromNose: number, shadows: ShadowOptions): THREE.Object3D {
    const axle = new THREE.Group();
    axle.name = 'surface-truck-axle';
    axle.position.set(0, WHEEL_RADIUS, FRONT + fromNose);
    const batch = new StaticMeshBatch();
    for (const side of [-1, 1]) addTruckWheel(batch, this.materials, side * WHEEL_TRACK, 0, 0, side);
    buildMeshes(batch, axle, 'station33-truck-axle', shadows);
    this.rig.add(axle);
    return axle;
  }

  /** A rear door leaf on its hinge at the body's back corner (shut, it reaches the middle), with its hinges, lock rod and handle. */
  private buildDoor(side: number, shadows: ShadowOptions): RearDoor {
    const hinge = new THREE.Group();
    hinge.name = 'surface-truck-door';
    hinge.position.set(side * (TRUCK_WIDTH / 2), (BODY.bottom + BODY.top) / 2, REAR + 0.02);
    const { length, height } = DOOR_LEAF;
    const middle = -side * length / 2;
    const batch = new StaticMeshBatch();
    // All painted over in the same olive, so a leaf costs a single draw.
    batch.addBox(this.materials.paint, middle, 0, 0, length, height, 0.05);
    for (const y of [-height * 0.3, height * 0.3]) batch.addBox(this.materials.paint, middle, y, 0.03, length - 0.12, 0.05, 0.02);
    for (const y of [-height * 0.36, height * 0.36]) {
      batch.add(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8).translate(0, y, 0.035), this.materials.paint);
    }
    batch.addBox(this.materials.paint, -side * (length - 0.12), 0, 0.04, 0.025, height - 0.08, 0.025);
    batch.addBox(this.materials.paint, -side * (length - 0.26), 0.05, 0.05, 0.16, 0.035, 0.035);
    buildMeshes(batch, hinge, 'station33-truck-door', shadows);
    hinge.rotation.y = side * DOOR_OPEN_ANGLE;
    this.body.add(hinge);
    return { hinge, side };
  }

  /** A little red pennant hung under the cab roof behind the windscreen, swinging as the truck moves. */
  private buildPennant(): THREE.Object3D {
    const pivot = new THREE.Group();
    pivot.name = 'surface-truck-pennant';
    pivot.position.set(0.18, CAB.top - 0.06, FRONT + 0.6);
    const cord = new THREE.BoxGeometry(0.004, 0.12, 0.004).translate(0, -0.06, 0);
    const flag = new THREE.BoxGeometry(0.1, 0.12, 0.004).translate(0, -0.18, 0);
    const geometry = mergeGeometries([cord, flag]);
    cord.dispose();
    flag.dispose();
    if (!geometry) throw new Error('Unable to merge the truck pennant');
    pivot.add(new THREE.Mesh(geometry, this.materials.redEnamel));
    this.body.add(pivot);
    return pivot;
  }
}

/** Merges `batch` under `parent`; glass and lamps cast no shadow. */
function buildMeshes(batch: StaticMeshBatch, parent: THREE.Object3D, name: string, shadows: ShadowOptions): void {
  for (const mesh of batch.build(parent, name, shadows)) {
    const material = mesh.material as THREE.Material;
    if (material.transparent || material instanceof THREE.MeshBasicMaterial) mesh.castShadow = false;
  }
}

/** The parked truck's solids: its body and both open door leaves, in world space. */
function buildProxies(context: Station33BuildContext): GroundRect[] {
  const frontZ = TRUCK_Z + FRONT;
  const rearZ = TRUCK_Z + REAR;
  const solids: GroundRect[] = [];
  for (const side of [-1, 1]) {
    const hingeX = TRUCK_X + side * (TRUCK_WIDTH / 2);
    const reachX = hingeX - side * Math.cos(DOOR_OPEN_ANGLE) * DOOR_LEAF.length;
    solids.push(yardSolid(context, 'surface-truck-door', 'metal',
      { minX: Math.min(hingeX, reachX) - 0.05, maxX: Math.max(hingeX, reachX) + 0.05, minZ: rearZ, maxZ: rearZ + Math.sin(DOOR_OPEN_ANGLE) * DOOR_LEAF.length + 0.05 },
      GROUND + BODY.bottom, GROUND + BODY.top - 0.1));
  }
  solids.push(yardSolid(context, 'surface-truck', 'metal', { minX: TRUCK_X - TRUCK_WIDTH / 2, maxX: TRUCK_X + TRUCK_WIDTH / 2, minZ: frontZ - 0.2, maxZ: rearZ + 0.1 }, GROUND, GROUND + BODY.top));
  return solids;
}
