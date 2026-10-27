import * as THREE from 'three';
import { placement } from '../shared/StaticMeshBatch';
import { addLockerBank, ringLockersOn, WallFrame } from '../shared/LockerBank';
import { addSolidProxy } from '../shared/SolidProxy';
import { CONSIGNA_LOCKER, MILICIA, MILICIA_CELL, MILICIA_EVIDENCE_LOCKERS, MILICIA_INTERROGATION, station33RingLockersIn } from '../Station33Config';
import { station33LockerLook } from './Station33Machines';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { hall } = MILICIA;
/** Number tags of the evidence lockers run on from the luggage office's. */
const EVIDENCE_FIRST_TAG = 32;
/** Duty desk facing the door, along Z, with the duty officer's chair knocked over behind it. */
const DESK = { minX: -10.4, maxX: -9.6, minZ: 11.6, maxZ: 13.4, height: 0.78 } as const;
const CHAIR = { x: -11.05, z: 12.9, yaw: 0.6 } as const;
const CELL_BENCH = { depth: 0.4, minZ: 15.0, maxZ: 17.6, height: 0.45 } as const;
/** Riot-gear rack against the vestibule wall, south of the door. */
const RACK = { depth: 0.45, minZ: 13.2, maxZ: 15.8, height: 1.9, shelves: [0.35, 1.05, 1.75] } as const;
/** Two filing cabinets side by side in the north-west corner, the evidence lockers' neighbours. */
const FILING_CABINETS = [hall.minX + 0.1, hall.minX + 0.75] as const;
const FILING_CABINET = { width: 0.6, depth: 0.6, height: 1.35 } as const;
const INTERROGATION_TABLE = { width: 1.3, depth: 0.75, height: 0.76 } as const;
/** Safe in the north-east corner, between the vestibule wall and the AK-47's wall. */
const SAFE = { width: 0.7, depth: 0.6, height: 1.05 } as const;
/** Bars, rails and the open cell door are thin: their proxies are this thick. */
const BAR_PROXY = 0.08;

/**
 * Solid furnishings of the militia post: the evidence lockers (the Armour
 * locker among them, built by the arena), the duty desk, the holding cell,
 * the riot-gear rack, the filing cabinets, the interrogation table and the
 * safe. Visuals go to the shared batch; each piece gets invisible AABB
 * proxies, like the other rooms.
 */
export function buildMiliciaFurniture(context: Station33BuildContext, lighting: Station33Lighting): void {
  const frame = new WallFrame('z', hall.minX, 1);
  addLockerBank(context, station33LockerLook(context), {
    frame,
    from: MILICIA_EVIDENCE_LOCKERS.minZ,
    to: MILICIA_EVIDENCE_LOCKERS.maxZ,
    ajar: [2, 7],
    ringLockers: ringLockersOn(frame, station33RingLockersIn('milicia'), CONSIGNA_LOCKER.depth),
  }, EVIDENCE_FIRST_TAG);
  addDutyDesk(context);
  addHoldingCell(context);
  addRiotRack(context);
  addFilingCabinets(context);
  addInterrogationTable(context, lighting);
  addSafe(context);
}

/** Varnished desk with a telephone, the open duty log and a desk lamp; the chair lies on its back. */
function addDutyDesk(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { minX, maxX, minZ, maxZ, height } = DESK;
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const length = maxZ - minZ;
  batch.addBox(materials.varnishedWood, x, height - 0.025, z, width + 0.04, 0.05, length + 0.04, 0, 0, 0, 7);
  batch.addBox(materials.varnishedWood, x, (height - 0.05) / 2, z, width - 0.1, height - 0.05, length - 0.1, 0, 0, 0, 9);
  batch.addBox(materials.rubber, x + 0.12, height + 0.05, minZ + 0.35, 0.18, 0.09, 0.22, 0, 0.3, 0);
  batch.addBox(materials.paper, x - 0.05, height + 0.008, z + 0.15, 0.3, 0.012, 0.42, 0, -0.2, 0);
  batch.addBox(materials.greySteel, x - 0.2, height + 0.2, maxZ - 0.25, 0.03, 0.4, 0.03);
  batch.addBox(materials.greySteel, x - 0.12, height + 0.38, maxZ - 0.25, 0.18, 0.08, 0.12, 0, 0, -0.5);
  addSolidProxy(context, 'duty-desk', { x: minX - 0.02, y: 0, z: minZ - 0.02 }, { x: maxX + 0.02, y: height, z: maxZ + 0.02 }, 'wood');

  // Chair on its back: seat upright as a wall, legs pointing at the desk.
  const world = placement(CHAIR.x, 0, CHAIR.z, 0, CHAIR.yaw, 0).clone();
  const local = new THREE.Matrix4();
  const part = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number): void => {
    local.makeTranslation(px, py, pz);
    batch.add(geometry, materials.varnishedWood, world.clone().multiply(local));
  };
  part(new THREE.BoxGeometry(0.42, 0.04, 0.42), 0, 0.03, 0);
  part(new THREE.BoxGeometry(0.42, 0.42, 0.04), 0, 0.23, -0.21);
  for (const side of [-1, 1]) part(new THREE.BoxGeometry(0.035, 0.035, 0.44), side * 0.18, 0.44, 0.02);
  const bounds = new THREE.Box3(new THREE.Vector3(-0.22, 0, -0.24), new THREE.Vector3(0.22, 0.46, 0.25)).applyMatrix4(world);
  addSolidProxy(context, 'duty-chair', bounds.min, bounds.max, 'wood');
}

/** Barred front and side, the cell door swung open along the side, and a plank bench inside. */
function addHoldingCell(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { frontZ, doorMinX, sideX, barHeight, barSpacing } = MILICIA_CELL;
  const bars = (axis: 'x' | 'z', fixed: number, from: number, to: number): void => {
    const count = Math.max(1, Math.round((to - from) / barSpacing));
    for (let index = 0; index <= count; index++) {
      const along = from + ((to - from) * index) / count;
      const bar = new THREE.CylinderGeometry(0.012, 0.012, barHeight, 6);
      bar.translate(axis === 'x' ? along : fixed, barHeight / 2, axis === 'x' ? fixed : along);
      batch.add(bar, materials.greySteel);
    }
    for (const y of [0.08, 1.1, barHeight]) {
      const length = to - from;
      const middle = (from + to) / 2;
      if (axis === 'x') batch.addBox(materials.greySteel, middle, y, fixed, length, 0.05, 0.03);
      else batch.addBox(materials.greySteel, fixed, y, middle, 0.03, 0.05, length);
    }
    const half = BAR_PROXY / 2;
    addSolidProxy(
      context, 'cell-bars',
      axis === 'x' ? { x: from, y: 0, z: fixed - half } : { x: fixed - half, y: 0, z: from },
      axis === 'x' ? { x: to, y: barHeight, z: fixed + half } : { x: fixed + half, y: barHeight, z: to },
      'metal',
    );
  };
  bars('x', frontZ, hall.minX, doorMinX);
  bars('z', sideX, frontZ, hall.maxZ);
  // The door, as wide as its opening, swung out flat against the line of the side bars.
  bars('z', sideX, frontZ - (sideX - doorMinX), frontZ);
  batch.addBox(materials.greySteel, (doorMinX + sideX) / 2, barHeight + 0.05, frontZ, sideX - doorMinX + 0.06, 0.1, 0.06);

  const { depth, minZ, maxZ, height } = CELL_BENCH;
  const benchX = hall.minX + depth / 2;
  batch.addBox(materials.varnishedWood, benchX, height - 0.03, (minZ + maxZ) / 2, depth, 0.06, maxZ - minZ, 0, 0, 0, 11);
  for (const z of [minZ + 0.2, maxZ - 0.2]) batch.addBox(materials.greySteel, benchX, (height - 0.06) / 2, z, depth - 0.06, height - 0.06, 0.05);
  addSolidProxy(context, 'cell-bench', { x: hall.minX, y: 0, z: minZ }, { x: hall.minX + depth, y: height, z: maxZ }, 'wood');
  // A thin jute mattress half off the bench, and the slop bucket in the far corner.
  batch.addBox(materials.burlap, benchX + 0.02, height + 0.03, minZ + 0.9, depth - 0.04, 0.05, 1.5, 0, 0.05, 0.08);
  const bucketX = sideX - 0.4;
  const bucketZ = hall.maxZ - 0.35;
  batch.add(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 12).translate(bucketX, 0.15, bucketZ), materials.greySteel);
  addSolidProxy(context, 'cell-bucket', { x: bucketX - 0.15, y: 0, z: bucketZ - 0.15 }, { x: bucketX + 0.15, y: 0.3, z: bucketZ + 0.15 }, 'metal');
}

/** Steel shelving with helmets on the shelves and riot shields leaning against its foot. */
function addRiotRack(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { depth, minZ, maxZ, height, shelves } = RACK;
  const back = hall.maxX;
  const x = back - depth / 2;
  const length = maxZ - minZ;
  for (const z of [minZ, maxZ]) batch.addBox(materials.greySteel, x, height / 2, z, depth, height, 0.04);
  for (const y of shelves) batch.addBox(materials.greySteel, x, y, (minZ + maxZ) / 2, depth, 0.03, length);
  const helmet = (z: number, y: number, tilt: number): void => {
    const dome = new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(tilt).translate(x, y + 0.015, z);
    batch.add(dome, materials.carriagePaint);
  };
  helmet(minZ + 0.45, shelves[1], 0);
  helmet(minZ + 0.95, shelves[1], 0.25);
  helmet(maxZ - 0.5, shelves[1], -0.1);
  helmet(minZ + 0.7, shelves[2], 0.1);
  // Shields stand on the floor with their tops leaning back on the rack, faces to the room.
  for (const [z, lean] of [[minZ + 0.6, 0.18], [minZ + 1.3, 0.22], [maxZ - 0.55, 0.16]] as const) {
    batch.addBox(materials.windowGlass, back - depth - 0.06, 0.55, z, 0.02, 1.0, 0.5, 0, 0, -lean);
  }
  addSolidProxy(context, 'riot-rack', { x: back - depth - 0.2, y: 0, z: minZ - 0.03 }, { x: back, y: height, z: maxZ + 0.03 }, 'metal');
}

/** Four-drawer steel filing cabinets in the corner by the evidence lockers; the first has its top drawer pulled out. */
function addFilingCabinets(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { width, depth, height } = FILING_CABINET;
  const front = hall.minZ + depth;
  FILING_CABINETS.forEach((minX, cabinet) => {
    const x = minX + width / 2;
    batch.addBox(materials.paintedSteel, x, height / 2, hall.minZ + depth / 2, width, height, depth, 0, 0, 0, 13 + cabinet);
    for (let drawer = 0; drawer < 4; drawer++) {
      const y = 0.17 + drawer * 0.32;
      const out = cabinet === 0 && drawer === 3 ? 0.32 : 0;
      batch.addBox(materials.paintedSteel, x, y, front + out / 2 + 0.005, width - 0.04, 0.28, out + 0.01);
      batch.addBox(materials.greySteel, x, y + 0.06, front + out + 0.02, 0.14, 0.025, 0.03);
    }
  });
  // A stack of case files left on the second cabinet.
  batch.addBox(materials.paper, FILING_CABINETS[1] + width / 2, height + 0.04, hall.minZ + depth / 2, 0.32, 0.08, 0.24, 0, 0.2, 0);
  const minX = FILING_CABINETS[0];
  const maxX = FILING_CABINETS[1] + width;
  addSolidProxy(context, 'filing-cabinets', { x: minX, y: 0, z: hall.minZ }, { x: maxX, y: height, z: front + 0.35 }, 'metal');
}

/**
 * Interrogation table in the west half: steel legs and a worn top with a
 * typewriter and an ashtray, a chair on each side, under a green enamel
 * lamp hanging on its flex from the ceiling, its bulb on a failing circuit.
 */
function addInterrogationTable(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { x, z } = MILICIA_INTERROGATION;
  const { width, depth, height } = INTERROGATION_TABLE;
  batch.addBox(materials.varnishedWood, x, height - 0.02, z, width, 0.04, depth, 0, 0, 0, 17);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.addBox(materials.greySteel, x + sx * (width / 2 - 0.06), (height - 0.04) / 2, z + sz * (depth / 2 - 0.06), 0.04, height - 0.04, 0.04);
    }
  }
  // Typewriter: body, sloped keyboard, platen roller and a sheet still in it.
  const typewriterX = x - 0.25;
  batch.addBox(materials.rubber, typewriterX, height + 0.06, z, 0.38, 0.12, 0.32, 0, 0.15, 0);
  batch.addBox(materials.greySteel, typewriterX, height + 0.05, z + 0.17, 0.34, 0.03, 0.12, 0.35, 0.15, 0);
  const platen = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8).rotateZ(Math.PI / 2).rotateY(0.15).translate(typewriterX, height + 0.14, z - 0.08);
  batch.add(platen, materials.rubber);
  batch.addBox(materials.paper, typewriterX, height + 0.25, z - 0.1, 0.21, 0.2, 0.004, -0.2, 0.15, 0);
  const ashtray = new THREE.CylinderGeometry(0.07, 0.06, 0.03, 10).translate(x + 0.42, height + 0.015, z - 0.15);
  batch.add(ashtray, materials.greySteel);
  addSolidProxy(context, 'interrogation-table', { x: x - width / 2, y: 0, z: z - depth / 2 }, { x: x + width / 2, y: height, z: z + depth / 2 }, 'wood');

  for (const side of [-1, 1]) addUprightChair(context, x + side * 0.15, z + side * (depth / 2 + 0.32), side > 0 ? Math.PI : 0);

  // Hanging lamp: flex from the ceiling, green conical shade, bulb on its circuit.
  const lampY = 2.3;
  const flexLength = MILICIA.ceilingHeight - (lampY + 0.12);
  batch.add(new THREE.CylinderGeometry(0.006, 0.006, flexLength, 4).translate(x, lampY + 0.12 + flexLength / 2, z), materials.rubber);
  batch.add(new THREE.ConeGeometry(0.24, 0.22, 16).translate(x, lampY + 0.05, z), materials.paintedSteel);
  batch.add(new THREE.SphereGeometry(0.06, 10, 8).translate(x, lampY - 0.02, z), lighting.circuitMaterial('failing'));
}

/** Wooden chair standing on its legs, its back on local -Z. */
function addUprightChair(context: Station33BuildContext, x: number, z: number, yaw: number): void {
  const { batch, materials } = context;
  const world = placement(x, 0, z, 0, yaw, 0).clone();
  const local = new THREE.Matrix4();
  const part = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number): void => {
    local.makeTranslation(px, py, pz);
    batch.add(geometry, materials.varnishedWood, world.clone().multiply(local));
  };
  part(new THREE.BoxGeometry(0.42, 0.04, 0.42), 0, 0.46, 0);
  part(new THREE.BoxGeometry(0.42, 0.45, 0.04), 0, 0.7, -0.2);
  for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) part(new THREE.BoxGeometry(0.035, 0.44, 0.035), lx, 0.22, lz);
  const bounds = new THREE.Box3(new THREE.Vector3(-0.22, 0, -0.22), new THREE.Vector3(0.22, 0.48, 0.22)).applyMatrix4(world);
  addSolidProxy(context, 'interrogation-chair', bounds.min, bounds.max, 'wood');
}

/** Squat steel safe in the corner by the door: combination dial, lever handle and hinges. */
function addSafe(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { width, depth, height } = SAFE;
  const maxX = hall.maxX;
  const minZ = hall.minZ + 0.05;
  const x = maxX - depth / 2;
  const z = minZ + width / 2;
  batch.addBox(materials.paintedSteel, x, height / 2, z, depth, height, width, 0, 0, 0, 19);
  const front = maxX - depth - 0.01;
  batch.addBox(materials.greySteel, front, height / 2, z, 0.02, height - 0.12, width - 0.12);
  const dial = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16).rotateZ(Math.PI / 2).translate(front - 0.03, height * 0.62, z);
  batch.add(dial, materials.bronze);
  batch.addBox(materials.bronze, front - 0.04, height * 0.42, z + 0.08, 0.03, 0.03, 0.18);
  for (const y of [0.25, height - 0.25]) batch.addBox(materials.greySteel, front - 0.01, y, minZ + 0.04, 0.04, 0.12, 0.04);
  addSolidProxy(context, 'safe', { x: maxX - depth - 0.06, y: 0, z: minZ }, { x: maxX, y: height, z: minZ + width }, 'metal');
}
