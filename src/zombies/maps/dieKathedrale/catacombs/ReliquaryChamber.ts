import * as THREE from 'three';
import {
  CATACOMB_FLOOR_Y,
  RELIQUARY,
  WIND_BOW_ALTAR,
  WIND_BOW_COMPONENTS,
  windBowSocket,
} from '../../DieKathedraleCatacombsConfig';
import { DIE_KATHEDRALE_LIGHT_SITES } from '../../DieKathedraleConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { addSolidProxy } from '../../shared/SolidProxy';
import { placement } from '../../shared/StaticMeshBatch';
import { cobwebGeometry } from '../CobwebTexture';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, ribGeometries } from '../GothicVault';
import { addCandleCluster, addFloorStain, addWallStain } from './CatacombDecor';

const FLOOR = CATACOMB_FLOOR_Y;
/** Arched alcoves cut into the side walls, each holding a reliquary. */
const ALCOVE = { width: 1.1, sill: 0.95, height: 1.1 } as const;
/** One alcove in each side wall, clear of the shrine's gate (west) and the broken alcove the dead use (east). */
const ALCOVES: ReadonlyArray<{ readonly side: -1 | 1; readonly z: number; readonly holds: 'casket' | 'arm' }> = [
  { side: -1, z: -87.2, holds: 'casket' },
  { side: 1, z: -91.6, holds: 'arm' },
];

/**
 * The reliquary: a low chamber whose centre is a stone altar older than the
 * church above, three empty sockets sunk in its top in a line, joined by a
 * carved channel and ringed with a thread of the wind's cold light. Gilt
 * caskets and an arm reliquary wait in arched alcoves, a lectern holds an
 * open book of rotted pages, and candles crowd the shelf on the end wall.
 * Nothing here can be used yet: the sockets are where the bow's parts will go.
 */
export function buildReliquaryChamber(context: DieKathedraleBuildContext): void {
  const random = seededRandom(7401);
  addAltar(context);
  addAlcoves(context, random);
  addLectern(context);
  addCandleShelf(context, random);
  addDecay(context, random);
}

function addAltar(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { x, z, width, depth, height, socketRadius } = WIND_BOW_ALTAR;
  // A stepped base, a heavy block with a moulded top: a ritual table, not a workbench.
  batch.addBox(materials.cryptStone, x, FLOOR + 0.1, z, width + 0.7, 0.2, depth + 0.7, 0, 0, 0, 1);
  batch.addBox(materials.dressedStone, x, FLOOR + 0.2 + (height - 0.32) / 2, z, width - 0.2, height - 0.32, depth - 0.2, 0, 0, 0, 2);
  batch.addBox(materials.dressedStone, x, FLOOR + height - 0.06, z, width, 0.12, depth, 0, 0, 0, 3);
  batch.addBox(materials.dressedStone, x, FLOOR + height - 0.17, z, width - 0.1, 0.1, depth - 0.1, 0, 0, 0, 4);
  // Spiral carving on the front, worn almost flat: wind turning.
  for (const side of [-1, 1]) {
    const spiral = new THREE.TorusGeometry(0.16, 0.018, 4, 14, Math.PI * 1.6).translate(x + side * 0.55, FLOOR + 0.55, z + depth / 2 - 0.08);
    batch.add(spiral, materials.cavity);
  }
  const top = FLOOR + height;
  for (const component of WIND_BOW_COMPONENTS) {
    const socket = windBowSocket(component);
    // A round hollow with a lip, dark inside, and a faint ring of cold light set into its rim.
    batch.add(new THREE.CylinderGeometry(socketRadius, socketRadius * 0.85, 0.02, 16).translate(socket.x, top + 0.001, socket.z), materials.cavity);
    batch.add(new THREE.TorusGeometry(socketRadius + 0.03, 0.022, 5, 18).rotateX(Math.PI / 2).translate(socket.x, top + 0.012, socket.z), materials.dressedStone);
    batch.add(new THREE.TorusGeometry(socketRadius + 0.005, 0.006, 3, 18).rotateX(Math.PI / 2).translate(socket.x, top + 0.014, socket.z), materials.windGlow);
  }
  // The channel joining the three sockets.
  batch.addBox(materials.cavity, x, top + 0.002, z, WIND_BOW_ALTAR.socketSpacing * 2 - socketRadius * 2, 0.012, 0.035);
  addSolidProxy(context, 'reliquary-altar', { x: x - width / 2 - 0.35, y: FLOOR, z: z - depth / 2 - 0.35 }, { x: x + width / 2 + 0.35, y: top, z: z + depth / 2 + 0.35 }, 'concrete', 'none');
}

/** An arched alcove framed on the wall face, dark behind, a gilt casket or an arm reliquary on its sill. */
function addAlcoves(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  for (const { side, z, holds } of ALCOVES) {
    const wallX = side < 0 ? RELIQUARY.minX : RELIQUARY.maxX;
    const facing = -side;
    batch.addBox(materials.cavity, wallX + facing * 0.005, FLOOR + ALCOVE.sill + ALCOVE.height / 2, z, 0.01, ALCOVE.height, ALCOVE.width);
    const shelf = wallX + facing * 0.12;
    batch.addBox(materials.dressedStone, shelf, FLOOR + ALCOVE.sill - 0.05, z, 0.26, 0.1, ALCOVE.width + 0.3);
    for (const end of [-1, 1]) {
      batch.addBox(materials.dressedStone, wallX + facing * 0.05, FLOOR + ALCOVE.sill + ALCOVE.height * 0.4, z + end * (ALCOVE.width / 2 + 0.06), 0.1, ALCOVE.height * 0.8, 0.12);
    }
    const headX = wallX + facing * 0.05;
    const head = archPoints(headX, z - ALCOVE.width / 2 - 0.06, headX, z + ALCOVE.width / 2 + 0.06, FLOOR + ALCOVE.sill + ALCOVE.height * 0.8, 0.38, 5);
    for (const geometry of ribGeometries(head, 0.1, 0.12)) batch.add(geometry, materials.dressedStone);
    if (holds === 'casket') addCasket(context, shelf + facing * 0.02, FLOOR + ALCOVE.sill, z, random);
    else addArmReliquary(context, shelf + facing * 0.02, FLOOR + ALCOVE.sill, z);
  }
}

/** A house-shaped casket of tarnished gilt on little feet. */
function addCasket(context: DieKathedraleBuildContext, x: number, y: number, z: number, random: () => number): void {
  const { batch, materials } = context;
  const yaw = (random() - 0.5) * 0.3 + Math.PI / 2;
  const matrix = placement(x, y, z, 0, yaw, 0).clone();
  batch.add(new THREE.BoxGeometry(0.42, 0.2, 0.22).translate(0, 0.14, 0), materials.gilt, matrix);
  const roof = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 3, 1).rotateZ(Math.PI / 2).scale(1, 0.6, 0.75).translate(0, 0.29, 0);
  batch.add(roof, materials.gilt, matrix);
  for (const [fx, fz] of [[-0.18, -0.08], [0.18, -0.08], [-0.18, 0.08], [0.18, 0.08]] as const) {
    batch.add(new THREE.SphereGeometry(0.025, 5, 4).translate(fx, 0.025, fz), materials.gilt, matrix);
  }
  batch.add(new THREE.BoxGeometry(0.1, 0.06, 0.01).translate(0, 0.15, 0.115), materials.redCloth, matrix);
}

/** A forearm of silver-gilt raised in blessing, on a round foot. */
function addArmReliquary(context: DieKathedraleBuildContext, x: number, y: number, z: number): void {
  const { batch, materials } = context;
  batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.06, 10).translate(x, y + 0.03, z), materials.gilt);
  batch.add(new THREE.CylinderGeometry(0.055, 0.075, 0.48, 9).translate(x, y + 0.3, z), materials.gilt);
  batch.add(new THREE.SphereGeometry(0.06, 7, 5).scale(1, 1.3, 0.7).translate(x, y + 0.58, z), materials.gilt);
  batch.add(new THREE.BoxGeometry(0.03, 0.12, 0.03).translate(x, y + 0.68, z), materials.gilt);
}

/** An oak lectern turned towards the altar, its book open on pages gone to rot. */
function addLectern(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const x = WIND_BOW_ALTAR.x - WIND_BOW_ALTAR.width / 2 - 1.5;
  const z = WIND_BOW_ALTAR.z + 1.6;
  const yaw = Math.atan2(WIND_BOW_ALTAR.x - x, WIND_BOW_ALTAR.z - z);
  const matrix = placement(x, FLOOR, z, 0, yaw, 0).clone();
  batch.add(new THREE.BoxGeometry(0.4, 0.06, 0.4).translate(0, 0.03, 0), materials.darkWood, matrix);
  batch.add(new THREE.BoxGeometry(0.1, 1.05, 0.1).translate(0, 0.56, 0), materials.darkWood, matrix);
  batch.add(new THREE.BoxGeometry(0.5, 0.04, 0.38).rotateX(-0.45).translate(0, 1.12, 0), materials.darkWood, matrix);
  for (const side of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.22, 0.03, 0.3).rotateZ(side * 0.08).rotateX(-0.45).translate(side * 0.115, 1.16, 0), materials.shroud, matrix);
  }
  addSolidProxy(context, 'reliquary-lectern', { x: x - 0.28, y: FLOOR, z: z - 0.28 }, { x: x + 0.28, y: FLOOR + 1.25, z: z + 0.28 }, 'wood', 'none');
}

/** A stone shelf along the end wall behind the altar, crowded with candles, its wax run down the wall. */
function addCandleShelf(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const site = DIE_KATHEDRALE_LIGHT_SITES.find((candidate) => candidate.id === 'reliquary-candles');
  if (!site) return;
  const shelfY = site.y - 0.3;
  batch.addBox(materials.dressedStone, site.x, shelfY - 0.06, RELIQUARY.minZ + 0.18, 3.2, 0.12, 0.36);
  for (let cluster = 0; cluster < 5; cluster++) {
    addCandleCluster(context, site.x + (cluster - 2) * 0.62, shelfY, RELIQUARY.minZ + 0.18, 3 + Math.floor(random() * 3), 0.13, random);
  }
  addWallStain(batch, materials, site.x, shelfY - 1.4, RELIQUARY.minZ, 0, 1, 2.8, 1.3);
  // Rolled manuscripts left at the shelf's end.
  for (let roll = 0; roll < 3; roll++) {
    batch.add(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 7).rotateZ(Math.PI / 2).translate(site.x + 1.3, shelfY + 0.04 + roll * 0.06, RELIQUARY.minZ + 0.14 + (roll % 2) * 0.08), materials.shroud);
  }
}

function addDecay(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  for (const [x, z, towardX, towardZ] of [[RELIQUARY.minX, RELIQUARY.minZ, 1, 1], [RELIQUARY.maxX, RELIQUARY.minZ, -1, 1]] as const) {
    batch.add(cobwebGeometry({ x: x + towardX * 0.02, y: FLOOR + RELIQUARY.springY, z: z + towardZ * 0.02 }, towardX, towardZ, 1.2), materials.cobweb);
  }
  addFloorStain(batch, materials, WIND_BOW_ALTAR.x + 1.8, FLOOR, WIND_BOW_ALTAR.z + 2.2, 2.2, 1.4, random() * Math.PI);
  addWallStain(batch, materials, RELIQUARY.maxX, FLOOR, -86.2, -1, 0, 1.3, 2.2);
}
