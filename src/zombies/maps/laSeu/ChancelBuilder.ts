import * as THREE from 'three';
import { ALTAR, CHANCEL, LA_SEU_WALL_THICKNESS, LANCET } from '../LaSeuConfig';
import { addSolidProxy } from '../shared/SolidProxy';
import { archPoints, lancetShape, ribGeometries, ribVaultGeometry, wallShapeGeometry, type VaultBay } from './GothicVault';
import type { LaSeuBuildContext } from './LaSeuBuildContext';
import { addStoneWall } from './LaSeuWalls';

const HALF_WALL = LA_SEU_WALL_THICKNESS / 2;
const CANOPY_SIDES = 7;
const CANOPY_RADIUS = 2.8;

const CHANCEL_VAULT: VaultBay = {
  minX: CHANCEL.minX,
  maxX: CHANCEL.maxX,
  minZ: CHANCEL.minZ,
  maxZ: CHANCEL.maxZ,
  springY: CHANCEL.springY,
  apexY: CHANCEL.apexY,
};

/** Choir stalls along both side walls, clear of the rifle on the west one and the sacristy door on the east. */
const CHANCEL_STALLS = [
  { id: 'choir-stalls-west', minX: CHANCEL.minX, maxX: CHANCEL.minX + 0.85, minZ: -58.6, maxZ: -54.8, height: 1.5 },
  { id: 'choir-stalls-east', minX: CHANCEL.maxX - 0.85, maxX: CHANCEL.maxX, minZ: -58.6, maxZ: -55.9, height: 1.5 },
] as const;

/**
 * The chancel behind the arch (the Capella Reial): its own vault and
 * lancets, the altar on its dais under the seven-sided hanging canopy, the
 * bishop's seat against the end wall and the choir stalls.
 */
export function buildChancel(context: LaSeuBuildContext): void {
  addShell(context);
  addAltar(context);
  addCanopy(context);
  addSeats(context);
}

function addShell(context: LaSeuBuildContext): void {
  const { batch, materials, structure, group } = context;
  const width = CHANCEL.maxX - CHANCEL.minX + LA_SEU_WALL_THICKNESS * 2;
  const northFace = CHANCEL.minZ - LA_SEU_WALL_THICKNESS;
  const southFace = CHANCEL.maxZ - LA_SEU_WALL_THICKNESS;
  structure.addBox(0, -0.08, (northFace + southFace) / 2, width, 0.16, southFace - northFace, materials.floorStone, {
    name: 'chancel-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 2, worldUVs: true, blocksPlayer: false,
  });
  for (const side of [-1, 1]) {
    addStoneWall(context, side < 0 ? 'chancel-west-wall' : 'chancel-east-wall', {
      axis: 'z', fixed: side * (CHANCEL.maxX + HALF_WALL), min: CHANCEL.minZ, max: southFace, height: CHANCEL.wallHeight,
    });
  }
  addStoneWall(context, 'chancel-end-wall', {
    axis: 'x', fixed: CHANCEL.minZ - HALF_WALL, min: CHANCEL.minX - LA_SEU_WALL_THICKNESS, max: CHANCEL.maxX + LA_SEU_WALL_THICKNESS, height: CHANCEL.wallHeight,
  });

  const vault = new THREE.Mesh(ribVaultGeometry(CHANCEL_VAULT, 10, materials.vaultStone.userData.metersPerTile as number), materials.vaultStone);
  vault.name = 'chancel-vault';
  vault.userData.surface = 'concrete';
  vault.userData.mapRole = 'ceiling';
  group.add(vault);
  structure.addSolid(vault, false);
  const rise = CHANCEL.apexY - CHANCEL.springY;
  for (const [fromZ, toZ] of [[CHANCEL.minZ, CHANCEL.maxZ], [CHANCEL.maxZ, CHANCEL.minZ]] as const) {
    const diagonal = archPoints(CHANCEL.minX, fromZ, CHANCEL.maxX, toZ, CHANCEL.springY - 0.12, rise, 8);
    for (const geometry of ribGeometries(diagonal, 0.22, 0.26)) batch.add(geometry, materials.dressedStone);
  }
  batch.add(new THREE.CylinderGeometry(0.42, 0.3, 0.22, 8).translate(0, CHANCEL.apexY - 0.3, (CHANCEL.minZ + CHANCEL.maxZ) / 2), materials.gilt);

  const { width: lancetWidth, sillY, shoulderY, apexY, xs } = LANCET.chancel;
  for (const x of xs) {
    const lancet = lancetShape(lancetWidth, sillY, shoulderY, apexY, 8);
    batch.add(wallShapeGeometry(lancet, 'pz', x, CHANCEL.minZ + 0.02), materials.glassWarm);
    batch.addBox(materials.dressedStone, x, sillY - 0.09, CHANCEL.minZ + 0.1, lancetWidth + 0.4, 0.18, 0.2, 0, 0, 0, x);
  }
}

/** Stone table on a dais, its red frontal, six candles and the cross; one solid for the whole of it. */
function addAltar(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { x, z, daisWidth, daisDepth, daisHeight, tableWidth, tableDepth, tableHeight } = ALTAR;
  batch.addBox(materials.dressedStone, x, daisHeight / 2, z, daisWidth, daisHeight, daisDepth, 0, 0, 0, 11);
  batch.addBox(materials.dressedStone, x, daisHeight + tableHeight / 2, z, tableWidth, tableHeight, tableDepth, 0, 0, 0, 12);
  batch.addBox(materials.dressedStone, x, daisHeight + tableHeight + 0.04, z, tableWidth + 0.2, 0.08, tableDepth + 0.16, 0, 0, 0, 13);
  batch.addBox(materials.redCloth, x, daisHeight + tableHeight * 0.52, z + tableDepth / 2 + 0.012, tableWidth * 0.62, tableHeight * 0.9, 0.012);
  const top = daisHeight + tableHeight + 0.08;
  for (let index = 0; index < 6; index++) {
    const candleX = x + (index - 2.5) * 0.5 + Math.sign(index - 2.5) * 0.15;
    const height = 0.42 - Math.abs(index - 2.5) * 0.04;
    batch.add(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6).translate(candleX, top + 0.08, z - 0.2), materials.gilt);
    batch.add(new THREE.CylinderGeometry(0.028, 0.028, height, 6).translate(candleX, top + 0.16 + height / 2, z - 0.2), materials.wax);
    batch.add(new THREE.SphereGeometry(0.035, 6, 4).scale(1, 1.8, 1).translate(candleX, top + 0.2 + height, z - 0.2), materials.flame);
  }
  batch.addBox(materials.gilt, x, top + 0.55, z - 0.3, 0.07, 1.1, 0.07);
  batch.addBox(materials.gilt, x, top + 0.8, z - 0.3, 0.5, 0.07, 0.07);
  addSolidProxy(
    context, 'altar',
    { x: x - daisWidth / 2, y: 0, z: z - daisDepth / 2 },
    { x: x + daisWidth / 2, y: daisHeight + tableHeight + 0.08, z: z + daisDepth / 2 },
    'concrete', 'none',
  );
}

/** The canopy hung over the altar: a seven-sided crown of gilt and cloth ringed with lamps. */
function addCanopy(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { x, z, canopyY } = ALTAR;
  const flat = (geometry: THREE.BufferGeometry, y: number): THREE.BufferGeometry => geometry.rotateX(Math.PI / 2).translate(x, y, z);
  batch.add(flat(new THREE.TorusGeometry(CANOPY_RADIUS, 0.13, 5, CANOPY_SIDES), canopyY), materials.gilt);
  batch.add(flat(new THREE.TorusGeometry(CANOPY_RADIUS * 0.55, 0.08, 5, CANOPY_SIDES), canopyY + 0.9), materials.gilt);
  batch.add(flat(new THREE.CircleGeometry(CANOPY_RADIUS, CANOPY_SIDES), canopyY + 0.05), materials.redCloth);
  batch.add(new THREE.CylinderGeometry(CANOPY_RADIUS, CANOPY_RADIUS, 0.5, CANOPY_SIDES, 1, true).translate(x, canopyY - 0.25, z), materials.redCloth);
  for (let corner = 0; corner < CANOPY_SIDES; corner++) {
    const angle = corner / CANOPY_SIDES * Math.PI * 2;
    const lampX = x + Math.sin(angle) * CANOPY_RADIUS;
    const lampZ = z + Math.cos(angle) * CANOPY_RADIUS;
    batch.addBox(materials.iron, lampX, canopyY - 0.75, lampZ, 0.025, 0.5, 0.025);
    batch.add(new THREE.SphereGeometry(0.08, 6, 5).translate(lampX, canopyY - 1.05, lampZ), materials.flame);
    // Four of the corners carry the chains up into the vault.
    if (corner % 2 === 0) batch.addBox(materials.iron, lampX * 0.55 + x * 0.45, (canopyY + CHANCEL.apexY) / 2, lampZ * 0.55 + z * 0.45, 0.03, CHANCEL.apexY - canopyY, 0.03);
  }
}

/** The bishop's seat against the end wall and the choir stalls along both sides. */
function addSeats(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const seatZ = CHANCEL.minZ + 0.35;
  batch.addBox(materials.dressedStone, 0, 0.3, seatZ, 1.3, 0.6, 0.7, 0, 0, 0, 21);
  batch.addBox(materials.dressedStone, 0, 1.5, CHANCEL.minZ + 0.1, 1.3, 2.4, 0.2, 0, 0, 0, 22);
  for (const side of [-1, 1]) batch.addBox(materials.dressedStone, side * 0.56, 0.85, seatZ, 0.18, 0.5, 0.7, 0, 0, 0, 23 + side);
  addSolidProxy(context, 'bishop-seat', { x: -0.65, y: 0, z: CHANCEL.minZ }, { x: 0.65, y: 1.9, z: CHANCEL.minZ + 0.7 }, 'concrete', 'none');

  for (const stalls of CHANCEL_STALLS) {
    const centerX = (stalls.minX + stalls.maxX) / 2;
    const centerZ = (stalls.minZ + stalls.maxZ) / 2;
    const length = stalls.maxZ - stalls.minZ;
    const towardsWall = Math.sign(centerX);
    batch.addBox(materials.darkWood, centerX, 0.25, centerZ, 0.85, 0.5, length, 0, 0, 0, 31);
    batch.addBox(materials.darkWood, centerX + towardsWall * 0.34, stalls.height / 2 + 0.5, centerZ, 0.16, stalls.height, length, 0, 0, 0, 32);
    for (let divider = 0; divider <= Math.round(length / 0.9); divider++) {
      const z = stalls.minZ + divider * length / Math.round(length / 0.9);
      batch.addBox(materials.darkWood, centerX, 0.8, z, 0.8, 0.6, 0.06, 0, 0, 0, 33 + divider);
    }
    addSolidProxy(
      context, stalls.id,
      { x: stalls.minX, y: 0, z: stalls.minZ }, { x: stalls.maxX, y: stalls.height, z: stalls.maxZ },
      'wood', 'none',
    );
  }
}
