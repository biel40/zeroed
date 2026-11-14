import * as THREE from 'three';
import { NAVE, PEW, PEW_BLOCKS, VOTIVE_RACKS, naveBayCenter, type PewBlock } from '../LaSeuConfig';
import { projectMaterialUVs } from '../shared/ArenaStructure';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import type { LaSeuBuildContext } from './LaSeuBuildContext';

/** Solid furniture of the east aisle: the font by the doors and the confessional against the wall. */
const NAVE_FONT = { x: 10.4, z: naveBayCenter(0), halfSize: 0.7, height: 1.05 } as const;
const NAVE_CONFESSIONAL = { minX: NAVE.maxX - 1.15, maxX: NAVE.maxX, minZ: naveBayCenter(4) - 1.2, maxZ: naveBayCenter(4) + 1.2, height: 2.5 } as const;

const VOTIVE_RACK = { depth: 0.5, halfLength: 0.65, height: 1.15 } as const;

const scratchMatrix = new THREE.Matrix4();
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

/** Footprint of a pew block's solid on the floor. */
export function pewBlockFootprint(block: PewBlock): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const z = naveBayCenter(block.bay);
  const inner = block.side * PEW.innerX;
  const outer = block.side * (PEW.innerX + PEW.length);
  return { minX: Math.min(inner, outer), maxX: Math.max(inner, outer), minZ: z - PEW.blockDepth / 2, maxZ: z + PEW.blockDepth / 2 };
}

/**
 * Everything solid on the nave floor besides the columns: the pew blocks of
 * the central aisle, the votive racks, the font and the confessional.
 */
export function buildNaveFurniture(context: LaSeuBuildContext): void {
  for (const block of PEW_BLOCKS) addPewBlock(context, block);
  for (const rack of VOTIVE_RACKS) addVotiveRack(context, rack.id, rack.side, rack.z);
  addFont(context);
  addConfessional(context);
}

/** One oak pew facing the altar (north), placed by its own transform. */
function addPew(context: LaSeuBuildContext, x: number, y: number, z: number, yaw: number, roll: number, seed: number): void {
  const { batch, materials } = context;
  scratchQuaternion.setFromEuler(scratchEuler.set(roll, yaw, 0, 'YXZ'));
  const pew = scratchMatrix.compose(scratchPosition.set(x, y, z), scratchQuaternion, UNIT_SCALE).clone();
  const part = (width: number, height: number, depth: number, px: number, py: number, pz: number): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    projectMaterialUVs(geometry, width, height, depth, materials.darkWood, seed);
    batch.add(geometry.translate(px, py, pz).applyMatrix4(pew), materials.darkWood);
  };
  part(PEW.length, 0.06, 0.42, 0, 0.44, 0);
  part(PEW.length, 0.52, 0.05, 0, 0.7, 0.22);
  part(PEW.length, 0.05, 0.16, 0, 0.14, -0.2);
  for (const end of [-1, 1]) part(0.06, 0.92, PEW.depth, end * (PEW.length / 2 - 0.03), 0.46, 0);
}

function addPewBlock(context: LaSeuBuildContext, block: PewBlock): void {
  if (block.state === 'cleared') return;
  const footprint = pewBlockFootprint(block);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const random = seededRandom(700 + block.bay * 10 + block.side);
  for (let row = 0; row < PEW.rows; row++) {
    const z = centerZ + (row - (PEW.rows - 1) / 2) * PEW.rowSpacing;
    if (block.state === 'rows') {
      addPew(context, centerX, 0, z, 0, 0, row + block.bay);
      continue;
    }
    // A barricade: pews shoved together, some thrown on their backs, all inside the block's solid.
    const tipped = row % 2 === 0;
    addPew(
      context,
      centerX + (random() - 0.5) * 0.2,
      tipped ? 0.26 : 0,
      z + (random() - 0.5) * 0.3,
      (random() - 0.5) * 0.14,
      tipped ? Math.PI / 2 : 0,
      row + block.bay,
    );
  }
  addSolidProxy(
    context, `pews-${block.side < 0 ? 'west' : 'east'}-${block.bay}`,
    { x: footprint.minX, y: 0, z: footprint.minZ }, { x: footprint.maxX, y: PEW.solidHeight, z: footprint.maxZ },
    'wood', 'none',
  );
}

/** Tiered iron stand of votive candles against a side wall; a few still burn. */
function addVotiveRack(context: LaSeuBuildContext, id: string, side: number, z: number): void {
  const { batch, materials } = context;
  const { depth, halfLength, height } = VOTIVE_RACK;
  const wall = side * NAVE.maxX;
  const x = wall - side * depth / 2;
  for (const corner of [-1, 1]) {
    for (const row of [-1, 1]) batch.addBox(materials.iron, x + row * (depth / 2 - 0.03), height / 2, z + corner * (halfLength - 0.03), 0.04, height, 0.04);
  }
  const random = seededRandom(900 + side);
  for (let tier = 0; tier < 3; tier++) {
    const tierX = wall - side * (0.1 + tier * 0.14);
    const tierY = height - tier * 0.16;
    batch.addBox(materials.iron, tierX, tierY, z, 0.13, 0.025, halfLength * 2);
    for (let candle = 0; candle < 7; candle++) {
      const candleZ = z - halfLength + 0.1 + candle * (halfLength * 2 - 0.2) / 6;
      const candleHeight = 0.06 + random() * 0.12;
      batch.add(new THREE.CylinderGeometry(0.02, 0.02, candleHeight, 5).translate(tierX, tierY + 0.012 + candleHeight / 2, candleZ), materials.wax);
      if (random() < 0.45) batch.add(new THREE.SphereGeometry(0.022, 5, 4).scale(1, 1.7, 1).translate(tierX, tierY + 0.04 + candleHeight, candleZ), materials.flame);
    }
  }
  addSolidProxy(
    context, id,
    { x: Math.min(wall, wall - side * depth), y: 0, z: z - halfLength }, { x: Math.max(wall, wall - side * depth), y: height, z: z + halfLength },
    'metal', 'none',
  );
}

/** Eight-sided baptismal font by the door. */
function addFont(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { x, z, halfSize, height } = NAVE_FONT;
  const octagon = (top: number, bottom: number, tall: number, y: number): void => {
    batch.add(new THREE.CylinderGeometry(top, bottom, tall, 8).rotateY(Math.PI / 8).translate(x, y, z), materials.dressedStone);
  };
  octagon(0.5, 0.6, 0.18, 0.09);
  octagon(0.26, 0.3, 0.55, 0.45);
  octagon(halfSize, 0.3, 0.32, 0.88);
  batch.add(new THREE.CylinderGeometry(halfSize - 0.1, halfSize - 0.1, 0.02, 8).rotateY(Math.PI / 8).translate(x, height - 0.03, z), materials.iron);
  addSolidProxy(context, 'font', { x: x - halfSize, y: 0, z: z - halfSize }, { x: x + halfSize, y: height, z: z + halfSize }, 'concrete', 'none');
}

/** Oak confessional against the east wall: a booth with a priest's door and two curtained sides. */
function addConfessional(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { minX, maxX, minZ, maxZ, height } = NAVE_CONFESSIONAL;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const depth = maxX - minX;
  const length = maxZ - minZ;
  batch.addBox(materials.darkWood, centerX, height / 2, centerZ, depth - 0.04, height, length * 0.36, 0, 0, 0, 41);
  for (const end of [-1, 1]) {
    batch.addBox(materials.darkWood, centerX, height * 0.46, centerZ + end * (length / 2 - 0.03), depth - 0.04, height * 0.92, 0.06, 0, 0, 0, 42 + end);
    batch.addBox(materials.redCloth, minX + 0.05, height * 0.5, centerZ + end * length * 0.33, 0.02, height * 0.7, length * 0.26);
  }
  batch.addBox(materials.darkWood, centerX, height * 0.94, centerZ, depth, 0.12, length + 0.1, 0, 0, 0, 45);
  batch.addBox(materials.gilt, minX - 0.01, height + 0.22, centerZ, 0.04, 0.4, 0.04);
  batch.addBox(materials.gilt, minX - 0.01, height + 0.28, centerZ, 0.04, 0.04, 0.24);
  addSolidProxy(context, 'confessional', { x: minX, y: 0, z: minZ }, { x: maxX, y: height, z: maxZ }, 'wood', 'none');
}
