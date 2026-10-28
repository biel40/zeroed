import * as THREE from 'three';
import { addLockerBank, ringLockersOn, WallFrame } from '../shared/LockerBank';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import { placement } from '../shared/StaticMeshBatch';
import { CONSIGNA_LOCKER, station33RingLockersIn, TALLER, TALLER_BOGIE } from '../Station33Config';
import { addOilDrums } from './OilDrums';
import type { Station33BuildContext } from './Station33BuildContext';
import { station33LockerLook } from './Station33Machines';

const { hall } = TALLER;

/** Workbench against the west wall, south of the drill press. */
export const TALLER_WORKBENCH = { z: -51.6, depth: 0.9, length: 2.4, height: 0.92 } as const;
/** Pillar drill against the west wall, between the workbench and the parts rack. */
const DRILL_PRESS = { x: hall.minX + 0.4, z: -55.4, size: 0.75, height: 1.85 } as const;
/** Steel parts rack along the north wall, west of the service door. */
const PARTS_RACK = { minX: hall.minX + 0.1, maxX: 8.6, depth: 0.55, height: 2.4, shelves: [0.12, 0.72, 1.32, 1.92] } as const;
/** Gas-welding trolley parked by the east wall, north of the lockers. */
const WELDING_CART = { x: 15.95, z: -56.4 } as const;
const OIL_DRUMS: ReadonlyArray<readonly [number, number]> = [[15.95, -58.45], [15.3, -58.6], [15.8, -57.8]];
/** Rails of the bogie's stub, `gauge` apart along Z under it. */
const RAIL_STUB = { gauge: 1.52, minZ: TALLER_BOGIE.z - 2.9, maxZ: TALLER_BOGIE.z + 2.9, railTop: 0.15 } as const;
const WHEEL_RADIUS = 0.43;

/**
 * Solid furnishings of the workshop. Visuals go to the shared batch, each
 * piece behind one invisible AABB proxy. A clear lane at least 3 m wide
 * runs on either side of the bogie between the substation door and the
 * service door, so the horde never jams.
 */
export function buildTallerFurniture(context: Station33BuildContext): void {
  const eastWall = new WallFrame('z', hall.maxX, -1);
  addLockerBank(context, station33LockerLook(context), {
    frame: eastWall, from: -53.8, to: -48.0, ajar: [2],
    ringLockers: ringLockersOn(eastWall, station33RingLockersIn('taller'), CONSIGNA_LOCKER.depth),
  }, 0);
  addWorkbench(context);
  addDrillPress(context);
  addPartsRack(context);
  addBogie(context);
  addWeldingCart(context);
  addOilDrums(context, 'taller-oil-drums', OIL_DRUMS);
}

/** Thick wooden top on steel legs with a vice, a toolbox and a scatter of parts. */
function addWorkbench(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { z, depth, length, height } = TALLER_WORKBENCH;
  const x = hall.minX + depth / 2;
  batch.addBox(materials.varnishedWood, x, height, z, depth - 0.1, 0.1, length);
  batch.addBox(materials.greySteel, x, 0.22, z, depth - 0.2, 0.04, length - 0.2);
  for (const end of [z - length / 2 + 0.2, z + length / 2 - 0.2]) {
    batch.addBox(materials.greySteel, x, (height - 0.05) / 2, end, depth - 0.25, height - 0.05, 0.08);
  }
  // Vice bolted to the front edge at the south end.
  const viceX = hall.minX + depth - 0.08;
  const viceZ = z + length / 2 - 0.35;
  batch.addBox(materials.paintedSteel, viceX, height + 0.1, viceZ, 0.22, 0.12, 0.16);
  batch.addBox(materials.paintedSteel, viceX + 0.14, height + 0.12, viceZ, 0.06, 0.14, 0.18);
  batch.add(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6).rotateX(Math.PI / 2).translate(viceX + 0.2, height + 0.1, viceZ), materials.greySteel);
  // Red toolbox with its lid propped open.
  const boxZ = z - length / 2 + 0.45;
  batch.addBox(materials.redEnamel, x - 0.05, height + 0.16, boxZ, 0.26, 0.22, 0.5);
  batch.addBox(materials.redEnamel, x - 0.16, height + 0.36, boxZ, 0.03, 0.22, 0.5, 0, 0, 0.35);
  const random = seededRandom(5813);
  for (let index = 0; index < 9; index++) {
    const part = new THREE.CylinderGeometry(0.02 + random() * 0.02, 0.02 + random() * 0.02, 0.03 + random() * 0.05, 6);
    batch.add(part, materials.greySteel, placement(x - 0.2 + random() * 0.35, height + 0.07, z - 0.5 + random() * 1.0, 0, random() * 3, random() > 0.6 ? Math.PI / 2 : 0));
  }
  addSolidProxy(context, 'taller-workbench',
    { x: hall.minX, y: 0, z: z - length / 2 }, { x: hall.minX + depth, y: height + 0.05, z: z + length / 2 }, 'wood');
}

/** Green pillar drill: base, column, table, belt head with its motor, chuck and feed handles. */
function addDrillPress(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, size, height } = DRILL_PRESS;
  const columnX = x - 0.18;
  batch.addBox(materials.greySteel, x, 0.05, z, size * 0.75, 0.1, size);
  batch.add(new THREE.CylinderGeometry(0.06, 0.06, height - 0.35, 10).translate(columnX, 0.1 + (height - 0.35) / 2, z), materials.greySteel);
  batch.addBox(materials.paintedSteel, x + 0.02, 0.86, z, 0.36, 0.05, 0.4);
  batch.addBox(materials.paintedSteel, columnX + 0.08, 0.82, z, 0.16, 0.1, 0.16);
  batch.addBox(materials.paintedSteel, x + 0.02, height - 0.3, z, 0.5, 0.32, 0.34);
  batch.addBox(materials.paintedSteel, x - 0.02, height - 0.08, z, 0.42, 0.12, 0.3);
  batch.add(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 12).rotateZ(Math.PI / 2).translate(columnX - 0.12, height - 0.3, z), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.035, 0.02, 0.16, 8).translate(x + 0.14, height - 0.54, z), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4).translate(x + 0.14, height - 0.68, z), materials.railSteel);
  // Feed handles: three bars through a hub on the head's south side.
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = (spoke / 3) * Math.PI;
    batch.add(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), materials.greySteel, placement(x + 0.05, height - 0.32, z + 0.22, angle, 0, 0));
  }
  addSolidProxy(context, 'taller-drill-press',
    { x: hall.minX, y: 0, z: z - size / 2 }, { x: x + size / 2, y: height, z: z + size / 2 }, 'metal');
}

/** Bolted steel shelving full of crates, part boxes and coiled cable. */
function addPartsRack(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { minX, maxX, depth, height, shelves } = PARTS_RACK;
  const backZ = hall.minZ + 0.03;
  const frontZ = hall.minZ + depth;
  const bays = 3;
  const bayWidth = (maxX - minX) / bays;
  for (let post = 0; post <= bays; post++) {
    const x = minX + bayWidth * post;
    for (const z of [backZ, frontZ - 0.03]) batch.addBox(materials.greySteel, x, height / 2, z, 0.05, height, 0.05);
  }
  for (const y of [...shelves, height]) {
    batch.addBox(materials.greySteel, (minX + maxX) / 2, y, (backZ + frontZ) / 2, maxX - minX, 0.03, depth - 0.03);
  }
  const random = seededRandom(5827);
  for (const shelfY of shelves) {
    for (let x = minX + 0.12; x < maxX - 0.25;) {
      const width = 0.25 + random() * 0.4;
      const kind = random();
      const itemHeight = 0.18 + random() * 0.3;
      const z = (backZ + frontZ) / 2 + (random() - 0.5) * 0.1;
      if (kind < 0.4) batch.addBox(materials.varnishedWood, x + width / 2, shelfY + 0.015 + itemHeight / 2, z, width, itemHeight, depth - 0.12, 0, (random() - 0.5) * 0.1);
      else if (kind < 0.7) batch.addBox(materials.paintedSteel, x + width / 2, shelfY + 0.015 + itemHeight * 0.35, z, width, itemHeight * 0.7, depth - 0.18);
      else if (kind < 0.85) {
        const coil = new THREE.TorusGeometry(0.13, 0.045, 6, 14).rotateX(Math.PI / 2).translate(x + 0.16, shelfY + 0.06, z);
        batch.add(coil, materials.rubber);
      }
      x += width + 0.04 + random() * 0.15;
    }
  }
  addSolidProxy(context, 'taller-parts-rack',
    { x: minX - 0.03, y: 0, z: hall.minZ }, { x: maxX + 0.03, y: height + 0.02, z: frontZ }, 'metal');
}

/**
 * A spare metro bogie up on its rail stub: two wheelsets, side frames with
 * coil springs, the bolster and a traction motor between the axles, chocked
 * with timber.
 */
function addBogie(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, length, width, height } = TALLER_BOGIE;
  const half = RAIL_STUB.gauge / 2;
  const railLength = RAIL_STUB.maxZ - RAIL_STUB.minZ;
  const railZ = (RAIL_STUB.minZ + RAIL_STUB.maxZ) / 2;
  for (const side of [-1, 1]) {
    batch.addBox(materials.railSteel, x + side * half, RAIL_STUB.railTop / 2, railZ, 0.07, RAIL_STUB.railTop, railLength);
  }
  for (let sleeper = RAIL_STUB.minZ + 0.3; sleeper < RAIL_STUB.maxZ; sleeper += 0.65) {
    batch.addBox(materials.varnishedWood, x, 0.04, sleeper, RAIL_STUB.gauge + 0.6, 0.08, 0.22, 0, 0, 0, sleeper);
  }
  for (const end of [RAIL_STUB.minZ, RAIL_STUB.maxZ]) batch.addBox(materials.hazardPaint, x, 0.35, end, RAIL_STUB.gauge + 0.3, 0.3, 0.2);
  const axleY = RAIL_STUB.railTop + WHEEL_RADIUS;
  const axleZs = [z - length / 2 + 0.55, z + length / 2 - 0.55];
  for (const axleZ of axleZs) {
    batch.add(new THREE.CylinderGeometry(0.07, 0.07, width - 0.1, 10).rotateZ(Math.PI / 2).translate(x, axleY, axleZ), materials.greySteel);
    for (const side of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.12, 22).rotateZ(Math.PI / 2).translate(x + side * half, axleY, axleZ);
      batch.add(wheel, materials.railSteel);
      const flange = new THREE.CylinderGeometry(WHEEL_RADIUS + 0.03, WHEEL_RADIUS + 0.03, 0.03, 22).rotateZ(Math.PI / 2).translate(x + side * (half - 0.07), axleY, axleZ);
      batch.add(flange, materials.greySteel);
      batch.addBox(materials.greySteel, x + side * (width / 2 - 0.05), axleY, axleZ, 0.16, 0.24, 0.3);
      // Timber chock under each wheel's outer side.
      batch.addBox(materials.varnishedWood, x + side * half, RAIL_STUB.railTop + 0.05, axleZ - WHEEL_RADIUS - 0.06, 0.16, 0.1, 0.14, 0.4, 0, 0, axleZ);
    }
  }
  const frameY = axleY + 0.2;
  for (const side of [-1, 1]) {
    batch.addBox(materials.paintedSteel, x + side * (width / 2 - 0.05), frameY, z, 0.18, 0.32, length);
    for (const springZ of [z - 0.35, z + 0.35]) {
      for (let turn = 0; turn < 4; turn++) {
        const coil = new THREE.TorusGeometry(0.08, 0.015, 4, 12).rotateX(Math.PI / 2).translate(x + side * (width / 2 - 0.05), frameY + 0.2 + turn * 0.045, springZ);
        batch.add(coil, materials.greySteel);
      }
    }
  }
  batch.addBox(materials.paintedSteel, x, height - 0.12, z, width - 0.1, 0.22, 0.5);
  batch.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14).translate(x, height + 0.03, z), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 16).rotateZ(Math.PI / 2).translate(x - 0.15, axleY + 0.05, z - 0.05), materials.greySteel);
  addSolidProxy(context, 'taller-bogie',
    { x: x - width / 2, y: 0, z: z - length / 2 - 0.05 }, { x: x + width / 2, y: height + 0.08, z: z + length / 2 + 0.05 }, 'metal');
}

/** Two-wheeled trolley with oxygen and acetylene bottles and their coiled hoses. */
function addWeldingCart(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z } = WELDING_CART;
  batch.addBox(materials.greySteel, x, 0.12, z, 0.5, 0.05, 0.7);
  batch.addBox(materials.greySteel, x + 0.24, 0.75, z, 0.04, 1.3, 0.7);
  batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6).rotateX(Math.PI / 2).translate(x + 0.24, 1.42, z), materials.greySteel);
  for (const side of [-1, 1]) {
    batch.add(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14).rotateZ(Math.PI / 2).translate(x + 0.14, 0.14, z + side * 0.38), materials.rubber);
  }
  for (const [offset, material] of [[-0.17, materials.paintedSteel], [0.17, materials.redEnamel]] as const) {
    batch.add(new THREE.CylinderGeometry(0.11, 0.11, 1.15, 14).translate(x - 0.02, 0.72, z + offset), material);
    batch.add(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x - 0.02, 1.295, z + offset), material);
    batch.add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8).translate(x - 0.02, 1.43, z + offset), materials.bronze);
  }
  const hose = new THREE.TorusGeometry(0.16, 0.018, 5, 18).rotateY(Math.PI / 2).translate(x + 0.29, 1.05, z);
  batch.add(hose, materials.rubber);
  addSolidProxy(context, 'taller-welding-cart',
    { x: x - 0.2, y: 0, z: z - 0.42 }, { x: hall.maxX, y: 1.5, z: z + 0.42 }, 'metal');
}
