import * as THREE from 'three';
import { projectMaterialUVs, wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { COCHERAS_TRACKS, TRAIN_CAR, type Station33TrainCar } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const HALF_WIDTH = TRAIN_CAR.width / 2;
const FLOOR_Y = TRAIN_CAR.floorY;
/** Side skin thickness. */
const SKIN = 0.06;
/** Window sill line, where the cream belt stripe runs. */
const BELT_Y = 1.95;
const WINDOW_TOP = 2.85;
const DOOR_TOP = 3.0;
/** Top of the side walls; the roof rim and roof sit above it. */
const EAVE_Y = 3.2;
const BOGIE_INSET = 1.9;
const WHEEL_RADIUS = 0.39;
const WHEELBASE = 2.1;
const COUPLER_REACH = 0.3;
/** Narrow pier between side windows and margin at each end of a run of windows. */
const PIER = 0.22;
const WINDOW_MARGIN = 0.15;
const BROKEN_WINDOW_CHANCE = 0.3;

/**
 * One abandoned metro car, built in a local frame (X across, Z along the
 * track, Y up from the sleepers) and placed by its derailment yaw and
 * roll. Faded blue enamel with a cream belt, a pitch-black interior seen
 * through broken windows and open doors, a dead cab with battery marker
 * lamps and a "no boarding" lightbox. Visuals go to the shared batch;
 * one invisible AABB proxy stops bullets, zombies and the player.
 */
export function buildTrainCar(context: Station33BuildContext, lighting: Station33Lighting, car: Station33TrainCar): void {
  const length = car.maxZ - car.minZ;
  const world = placement(car.x, 0, (car.minZ + car.maxZ) / 2, 0, car.yaw, car.roll).clone();
  const builder = new CarBuilder(context, world);
  const random = seededRandom(Math.round(car.minZ * 31 + car.x * 17));
  addBogies(builder, context, length);
  addUnderframe(builder, context, length);
  addBody(builder, context, length);
  for (const side of [-1, 1] as const) addSide(builder, context, car, length, side, random);
  for (const end of [-1, 1] as const) {
    const cab = (car.cab === 'north' && end === -1) || (car.cab === 'south' && end === 1);
    addEnd(builder, context, lighting, length, end, cab);
  }
  const bounds = new THREE.Box3(
    new THREE.Vector3(-HALF_WIDTH - 0.05, 0, -length / 2 - COUPLER_REACH),
    new THREE.Vector3(HALF_WIDTH + 0.05, TRAIN_CAR.roofY, length / 2 + COUPLER_REACH),
  ).applyMatrix4(world);
  context.structure.addBox(
    (bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2,
    bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z,
    context.materials.collider,
    {
      name: `train-${car.id}`, surface: 'metal', mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true,
      // Couplers and steps pad the sides; a derailed car's tilted roof leaves the AABB top in the air.
      stainFaces: car.yaw === 0 && car.roll === 0 ? 'top' : 'none',
    },
  );
}

/** Adds pieces in the car's local frame to the shared batch. */
class CarBuilder {
  private readonly scratch = new THREE.Matrix4();

  constructor(
    private readonly context: Station33BuildContext,
    private readonly world: THREE.Matrix4,
  ) {}

  add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotationY = 0): void {
    this.scratch.copy(this.world).multiply(placement(x, y, z, 0, rotationY, 0));
    this.context.batch.add(geometry, material, this.scratch);
  }

  box(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, uvSeed = 0): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    projectMaterialUVs(geometry, width, height, depth, material, uvSeed);
    this.add(geometry, material, x, y, z);
  }
}

/** Two bogies: frame, side frames and four wheels sitting on the rails. */
function addBogies(builder: CarBuilder, context: Station33BuildContext, length: number): void {
  const { materials } = context;
  const wheelY = COCHERAS_TRACKS.railTop + WHEEL_RADIUS;
  for (const end of [-1, 1]) {
    const z = end * (length / 2 - BOGIE_INSET);
    builder.box(materials.greySteel, 0, 0.66, z, 1.9, 0.2, 0.7);
    for (const side of [-1, 1]) {
      builder.box(materials.rubber, side * 0.9, wheelY, z, 0.14, 0.32, WHEELBASE + 0.7);
      for (const axle of [-1, 1]) {
        const wheel = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.1, 16).rotateZ(Math.PI / 2);
        builder.add(wheel, materials.railSteel, side * COCHERAS_TRACKS.gauge / 2, wheelY, z + axle * WHEELBASE / 2);
      }
    }
    for (const axle of [-1, 1]) {
      const shaft = new THREE.CylinderGeometry(0.06, 0.06, COCHERAS_TRACKS.gauge, 6).rotateZ(Math.PI / 2);
      builder.add(shaft, materials.greySteel, 0, wheelY, z + axle * WHEELBASE / 2);
    }
  }
}

/** Equipment boxes slung between the bogies under the floor. */
function addUnderframe(builder: CarBuilder, context: Station33BuildContext, length: number): void {
  const { materials } = context;
  const span = length - BOGIE_INSET * 2 - 3;
  builder.box(materials.rubber, 0, 0.86, 0, 2.2, 0.3, span);
  for (const [z, size] of [[-span * 0.3, 1.3], [0, 1.7], [span * 0.32, 1.1]] as const) {
    builder.box(materials.greySteel, 0, 0.7, z, 1.8, 0.36, size);
  }
}

/** Floor sill, the black void inside, roof rim, roof and its vents. */
function addBody(builder: CarBuilder, context: Station33BuildContext, length: number): void {
  const { materials } = context;
  builder.box(materials.carriagePaint, 0, FLOOR_Y - 0.03, 0, TRAIN_CAR.width, 0.14, length, 1);
  builder.box(materials.rubber, 0, (FLOOR_Y + EAVE_Y) / 2, 0, TRAIN_CAR.width - 0.2, EAVE_Y - FLOOR_Y, length - 0.2);
  builder.box(materials.carriagePaint, 0, EAVE_Y + 0.06, 0, TRAIN_CAR.width, 0.12, length, 2);
  builder.box(materials.greySteel, 0, (EAVE_Y + 0.12 + TRAIN_CAR.roofY) / 2, 0, TRAIN_CAR.width - 0.3, TRAIN_CAR.roofY - EAVE_Y - 0.12, length - 0.1);
  for (const z of [-length * 0.3, 0, length * 0.3]) builder.box(materials.greySteel, 0, TRAIN_CAR.roofY + 0.06, z, 0.9, 0.12, 1.1);
}

/** Door centres along the car, south (+Z) first. */
function doorCenters(length: number): number[] {
  const spacing = length / TRAIN_CAR.doorsPerSide;
  return Array.from({ length: TRAIN_CAR.doorsPerSide }, (_, index) => length / 2 - spacing * (index + 0.5));
}

/**
 * One side wall: enamel panels around the windows and doorways, the cream
 * belt stripe, glazing with some panes smashed in, and the door leaves
 * (none where a door hangs open).
 */
function addSide(builder: CarBuilder, context: Station33BuildContext, car: Station33TrainCar, length: number, side: 1 | -1, random: () => number): void {
  const { materials } = context;
  const skinX = side * (HALF_WIDTH - SKIN / 2);
  const doors = doorCenters(length);
  const doorways: WallOpening[] = doors.map((center) => ({ center, width: TRAIN_CAR.doorWidth, bottom: FLOOR_Y, top: DOOR_TOP }));
  for (const [from, to] of wallSpans(-length / 2, length / 2, doorways)) {
    const middle = (from + to) / 2;
    const run = to - from;
    builder.box(materials.carriagePaint, skinX, (FLOOR_Y + BELT_Y) / 2, middle, SKIN, BELT_Y - FLOOR_Y, run, middle);
    builder.box(materials.carriagePaint, skinX, (WINDOW_TOP + DOOR_TOP) / 2, middle, SKIN, DOOR_TOP - WINDOW_TOP, run, middle + 1);
    builder.box(materials.stucco, side * (HALF_WIDTH + 0.005), BELT_Y, middle, SKIN + 0.01, 0.08, run);
    addWindows(builder, context, skinX, from, to, random);
  }
  builder.box(materials.carriagePaint, skinX, (DOOR_TOP + EAVE_Y) / 2, 0, SKIN, EAVE_Y - DOOR_TOP, length, 3);
  doors.forEach((center, index) => {
    const open = side === car.openSide && car.openDoors.includes(index);
    addDoor(builder, context, side, center, open);
  });
}

/** Windows evenly spread over a run of side wall, with piers between them. */
function addWindows(builder: CarBuilder, context: Station33BuildContext, skinX: number, from: number, to: number, random: () => number): void {
  const { materials } = context;
  const usable = to - from - WINDOW_MARGIN * 2;
  const count = Math.max(1, Math.floor((usable + PIER) / (1.1 + PIER)));
  const width = (usable - PIER * (count - 1)) / count;
  const panes: WallOpening[] = Array.from({ length: count }, (_, index) => ({
    center: from + WINDOW_MARGIN + width / 2 + index * (width + PIER),
    width,
    bottom: BELT_Y,
    top: WINDOW_TOP,
  }));
  const bandHeight = WINDOW_TOP - BELT_Y;
  for (const [pierFrom, pierTo] of wallSpans(from, to, panes)) {
    builder.box(materials.carriagePaint, skinX, BELT_Y + bandHeight / 2, (pierFrom + pierTo) / 2, SKIN, bandHeight, pierTo - pierFrom, pierFrom);
  }
  for (const pane of panes) {
    // A smashed pane leaves the black interior showing through the frame.
    if (random() < BROKEN_WINDOW_CHANCE) continue;
    builder.box(materials.windowGlass, skinX * 0.985, BELT_Y + bandHeight / 2, pane.center, 0.02, bandHeight, pane.width);
  }
}

/** Two sliding leaves with glazed tops, or an empty doorway with its threshold plate. */
function addDoor(builder: CarBuilder, context: Station33BuildContext, side: 1 | -1, center: number, open: boolean): void {
  const { materials } = context;
  const leafX = side * (HALF_WIDTH - SKIN / 2 - 0.02);
  const { doorWidth } = TRAIN_CAR;
  builder.box(materials.greySteel, side * (HALF_WIDTH - 0.1), FLOOR_Y + 0.01, center, 0.2, 0.03, doorWidth);
  if (open) return;
  const leafWidth = doorWidth / 2 - 0.01;
  for (const leaf of [-1, 1]) {
    const z = center + leaf * doorWidth / 4;
    builder.box(materials.carriagePaint, leafX, (FLOOR_Y + 2.0) / 2, z, SKIN, 2.0 - FLOOR_Y, leafWidth, z);
    builder.box(materials.windowGlass, leafX, 2.4, z, SKIN * 0.8, 0.8, leafWidth - 0.12);
    builder.box(materials.carriagePaint, leafX, (2.8 + DOOR_TOP) / 2, z, SKIN, DOOR_TOP - 2.8, leafWidth, z + 1);
    for (const edge of [-1, 1]) builder.box(materials.carriagePaint, leafX, 2.4, z + edge * (leafWidth / 2 - 0.03), SKIN, 0.8, 0.06);
  }
  builder.box(materials.rubber, leafX + side * 0.01, (FLOOR_Y + DOOR_TOP) / 2, center, SKIN, DOOR_TOP - FLOOR_Y, 0.04);
}

/**
 * End wall. A cab end gets two windscreens, headlights, red battery marker
 * lamps, the route plate and the "no boarding" lightbox; the other end a
 * small end-door window. Both carry a coupler.
 */
function addEnd(builder: CarBuilder, context: Station33BuildContext, lighting: Station33Lighting, length: number, end: 1 | -1, cab: boolean): void {
  const { materials, signage } = context;
  const z = end * (length / 2 - 0.04);
  const face = end * (length / 2 + 0.005);
  const facing = end > 0 ? 0 : Math.PI;
  builder.box(materials.carriagePaint, 0, (FLOOR_Y + 2.0) / 2, z, TRAIN_CAR.width, 2.0 - FLOOR_Y, 0.08, 4);
  builder.box(materials.carriagePaint, 0, (2.85 + EAVE_Y) / 2, z, TRAIN_CAR.width, EAVE_Y - 2.85, 0.08, 5);
  builder.box(materials.stucco, 0, BELT_Y, end * (length / 2 + 0.01), TRAIN_CAR.width + 0.02, 0.08, 0.04);
  const windows: WallOpening[] = cab
    ? [-0.58, 0.58].map((center) => ({ center, width: 0.95, bottom: 2.0, top: 2.85 }))
    : [{ center: 0, width: 0.55, bottom: 2.0, top: 2.85 }];
  for (const [from, to] of wallSpans(-HALF_WIDTH, HALF_WIDTH, windows)) {
    builder.box(materials.carriagePaint, (from + to) / 2, 2.425, z, to - from, 0.85, 0.08, from);
  }
  for (const pane of windows) builder.box(materials.windowGlass, pane.center, 2.425, z, pane.width, 0.85, 0.05);
  builder.box(materials.greySteel, 0, 0.98, end * (length / 2 + COUPLER_REACH / 2), 0.3, 0.24, COUPLER_REACH);
  if (!cab) return;

  for (const side of [-1, 1]) {
    const rim = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 14).rotateX(Math.PI / 2);
    builder.add(rim, materials.greySteel, side * 0.85, 1.5, face);
    const lens = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14).rotateX(Math.PI / 2);
    builder.add(lens, materials.windowGlass, side * 0.85, 1.5, face + end * 0.03);
    const marker = new THREE.SphereGeometry(0.055, 10, 6);
    builder.add(marker, lighting.circuitMaterial('emergency'), side * 1.12, 1.25, face);
  }
  builder.add(signage.signGeometry('route-33', 0.3, 0.3), signage.material, 0.62, 2.55, end * (length / 2 + 0.002), facing);
  builder.add(signage.signGeometry('no-boarding', 1.1, 0.27), signage.litMaterial, 0, 3.03, face, facing);
}
