import * as THREE from 'three';
import { placement } from '../shared/StaticMeshBatch';
import { POWER_LEVER, SUBESTACION } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { MOTOR_GENERATOR, MOTOR_GENERATORS } from './SubestacionFurniture';

const { hall } = SUBESTACION;
/**
 * Cable trench under the central aisle, from the gallery mouth to a pit in
 * front of the switchboards, with branches to the motor-generators' feeds.
 */
const TRENCH = { width: 0.7, plateLength: 1.0, gap: 0.025, thickness: 0.02, startZ: hall.maxZ - 0.3, pitZ: -43.2, pitSize: 1.0, branchZ: -38.4 } as const;
/** Painted keep-clear line around each motor-generator plinth. */
const KEEP_CLEAR = { offset: 0.3, width: 0.1 } as const;
/** Ribbed dielectric runner along the switchboards and the main switch. */
const RUNNER = { minX: 7.7, maxX: 14.3, minZ: hall.minZ + 0.58, maxZ: hall.minZ + 1.26, ribs: 11 } as const;
const CABLE_COILS: ReadonlyArray<{ readonly x: number; readonly z: number; readonly turns: number }> = [
  { x: 4.85, z: -44.9, turns: 5 },
  { x: 19.9, z: -35.2, turns: 4 },
];
const SPARE_INSULATORS: ReadonlyArray<readonly [number, number, number]> = [[17.7, -39.6, 0.4], [18.05, -39.85, 1.9], [17.85, -40.15, 2.6]];

/**
 * Floor work of the machine room, all flat and non-solid (well under the
 * horde's obstacle height): the trench covers that carried the feeder
 * cables, the keep-clear lines round the machines, the rubber runner in
 * front of the switchboards and spare cable and insulators left lying.
 */
export function buildSubestacionFloorDetail(context: Station33BuildContext): void {
  addTrench(context);
  for (const set of MOTOR_GENERATORS) addKeepClearLine(context, set.x, set.z);
  addRunner(context);
  addCableCoils(context);
  addSpareInsulators(context);
}

/** A row of loose checker plates laid along X or Z, each a little askew. */
function addPlates(context: Station33BuildContext, axis: 'x' | 'z', fixed: number, from: number, to: number, seed: number): void {
  const { batch, materials } = context;
  const { width, plateLength, gap, thickness } = TRENCH;
  const count = Math.max(1, Math.round((to - from) / plateLength));
  const length = (to - from) / count;
  for (let index = 0; index < count; index++) {
    const along = from + length * (index + 0.5);
    const skew = (Math.sin(seed + index * 2.3) * 0.5) * 0.012;
    const lift = thickness / 2 + (index % 3 === 1 ? 0.003 : 0);
    if (axis === 'z') batch.addBox(materials.checkerPlate, fixed, lift, along, width, thickness, length - gap, 0, skew, 0, seed + index);
    else batch.addBox(materials.checkerPlate, along, lift, fixed, length - gap, thickness, width, 0, skew, 0, seed + index);
  }
  // Dark gap of the trench edge showing on both sides of the plates.
  const half = width / 2 + 0.015;
  for (const side of [-1, 1]) {
    if (axis === 'z') batch.addBox(materials.rubber, fixed + side * half, 0.002, (from + to) / 2, 0.03, 0.004, to - from);
    else batch.addBox(materials.rubber, (from + to) / 2, 0.002, fixed + side * half, to - from, 0.004, 0.03);
  }
}

function addTrench(context: Station33BuildContext): void {
  const { width, startZ, pitZ, pitSize, branchZ, thickness } = TRENCH;
  const x = POWER_LEVER.x;
  addPlates(context, 'z', x, pitZ + pitSize / 2, startZ, 11);
  // The branches run under the aisle to the feed side of each set.
  const west = MOTOR_GENERATORS[0].x + MOTOR_GENERATOR.plinthWidth / 2;
  const east = MOTOR_GENERATORS[1].x - MOTOR_GENERATOR.plinthWidth / 2;
  addPlates(context, 'x', branchZ, west + 0.05, x - width / 2 - 0.05, 31);
  addPlates(context, 'x', branchZ, x + width / 2 + 0.05, east - 0.05, 37);
  // Square pit cover where the trench dives under the switchboards, its lifting rings sunk in it.
  const { batch, materials } = context;
  batch.addBox(materials.greySteel, x, 0.006, pitZ, pitSize + 0.08, 0.012, pitSize + 0.08);
  batch.addBox(materials.checkerPlate, x, thickness / 2 + 0.006, pitZ, pitSize, thickness, pitSize, 0, 0.02, 0, 41);
  for (const dx of [-0.32, 0.32]) {
    batch.add(new THREE.TorusGeometry(0.04, 0.008, 4, 12).rotateX(Math.PI / 2), materials.greySteel, placement(x + dx, thickness + 0.01, pitZ, 0, 0, 0));
  }
}

/** Worn hazard-stripe rectangle painted on the tiles round a plinth. */
function addKeepClearLine(context: Station33BuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  const { offset, width } = KEEP_CLEAR;
  const halfX = MOTOR_GENERATOR.plinthWidth / 2 + offset;
  const halfZ = MOTOR_GENERATOR.plinthLength / 2 + offset;
  for (const side of [-1, 1]) {
    batch.addBox(materials.hazardPaint, x + side * halfX, 0.003, z, width, 0.006, halfZ * 2 + width, 0, 0, 0, z + side);
    batch.addBox(materials.hazardPaint, x, 0.003, z + side * halfZ, halfX * 2 - width, 0.006, width, 0, 0, 0, x + side);
  }
}

/** Rubber runner with ribs across it, curling a little where it was kicked. */
function addRunner(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { minX, maxX, minZ, maxZ, ribs } = RUNNER;
  const length = maxX - minX;
  const centerX = (minX + maxX) / 2;
  batch.addBox(materials.rubber, centerX, 0.006, (minZ + maxZ) / 2, length, 0.012, maxZ - minZ);
  for (let rib = 0; rib < ribs; rib++) {
    const z = minZ + ((rib + 0.5) / ribs) * (maxZ - minZ);
    batch.addBox(materials.rubber, centerX, 0.014, z, length - 0.06, 0.006, 0.022);
  }
  // Kicked-up corner by the west board.
  batch.addBox(materials.rubber, minX + 0.18, 0.03, maxZ - 0.12, 0.36, 0.01, 0.26, 0.25, 0.3, 0);
}

/** Coils of spare feeder cable lying flat, ring on ring, with a loose tail. */
function addCableCoils(context: Station33BuildContext): void {
  const { batch, materials } = context;
  for (const coil of CABLE_COILS) {
    for (let turn = 0; turn < coil.turns; turn++) {
      const radius = 0.32 - turn * 0.012;
      const ring = new THREE.TorusGeometry(radius, 0.03, 6, 22).rotateX(Math.PI / 2);
      batch.add(ring, materials.rubber, placement(coil.x + turn * 0.006, 0.03 + turn * 0.045, coil.z, 0, 0, 0));
    }
    const tail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(coil.x + 0.3, 0.03, coil.z),
      new THREE.Vector3(coil.x + 0.6, 0.03, coil.z + 0.25),
      new THREE.Vector3(coil.x + 0.75, 0.03, coil.z + 0.7),
    ]);
    batch.add(new THREE.TubeGeometry(tail, 8, 0.03, 6), materials.rubber);
  }
}

/** Spare porcelain post insulators left on their sides by the transformers. */
function addSpareInsulators(context: Station33BuildContext): void {
  const { batch, materials } = context;
  for (const [x, z, yaw] of SPARE_INSULATORS) {
    const matrix = placement(x, 0.1, z, 0, yaw, Math.PI / 2);
    batch.add(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8), materials.stucco, matrix);
    for (let shed = 0; shed < 3; shed++) {
      const disc = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12).translate(0, -0.12 + shed * 0.12, 0);
      batch.add(disc, materials.stucco, matrix);
    }
  }
}
