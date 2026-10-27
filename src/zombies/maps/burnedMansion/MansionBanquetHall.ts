import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { MANSION_BANQUET_HALL } from '../BurnedMansionConfig';
import { BANQUET_RUG_ASPECT } from './MansionPainters';
import type { MansionBuildContext } from './MansionBuildContext';

/**
 * Furniture of the banquet hall, visual only: a long walnut table still laid
 * for the last dinner on a burnt Persian rug, its chairs (burnt and pushed
 * askew), candelabra and wine, a sideboard under the north wall, a glazed
 * china cabinet and the stone fireplace on the chimney breast, where the
 * officer's portrait watches the table. Solid pieces stay inside the config
 * footprints the arena turns into colliders.
 */

const TABLE_TOP = { length: 4.4, width: 1.15, thickness: 0.06, y: 0.75 } as const;
/** Chair seats sit this far from the table's long axis, inside the collider footprint. */
const SIDE_CHAIR_OFFSET = 0.72;
const SIDE_CHAIR_ALONG = [-1.65, -0.55, 0.55, 1.65] as const;
const END_CHAIR_ALONG = 2.55;
const RUG_DEPTH = 3.4;
/** Firebox opening in the surround, centred on the chimney breast. */
const FIREBOX = { width: 1.26, height: 0.93 } as const;

export function buildBanquetFurniture(context: MansionBuildContext): void {
  addRug(context);
  addTable(context);
  addChairs(context);
  addSideboard(context);
  addChinaCabinet(context);
  addFireplace(context);
}

function addRug(context: MansionBuildContext): void {
  const { table } = MANSION_BANQUET_HALL;
  const rug = new THREE.PlaneGeometry(RUG_DEPTH * BANQUET_RUG_ASPECT, RUG_DEPTH).rotateX(-Math.PI / 2);
  context.batch.add(rug.translate(table.x, 0.002, table.z), context.materials.rug);
}

/** Adds a box of the given size centred at (x, y, z) in the frame of `frame`. */
function addLocalBox(
  context: MansionBuildContext,
  material: THREE.Material,
  frame: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  context.batch.add(new THREE.BoxGeometry(width, height, depth).translate(x, y, z), material, frame);
}

function addTable(context: MansionBuildContext): void {
  const { materials } = context;
  const { table } = MANSION_BANQUET_HALL;
  const frame = placement(table.x, 0, table.z).clone();
  const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void =>
    addLocalBox(context, material, frame, x, y, z, width, height, depth);
  box(materials.trimWood, 0, TABLE_TOP.y, 0, TABLE_TOP.length, TABLE_TOP.thickness, TABLE_TOP.width);
  // Where a candle fell over, the top burnt through to char.
  box(materials.charredWood, 1.2, TABLE_TOP.y + TABLE_TOP.thickness / 2 + 0.002, 0.1, 1.1, 0.004, 0.6);
  for (const side of [-1, 1]) box(materials.trimWood, 0, TABLE_TOP.y - 0.08, side * (TABLE_TOP.width / 2 - 0.06), TABLE_TOP.length - 0.3, 0.1, 0.03);
  const legHeight = TABLE_TOP.y - TABLE_TOP.thickness / 2;
  for (const x of [-2.05, 0, 2.05]) {
    for (const z of [-0.48, 0.48]) box(materials.trimWood, x, legHeight / 2, z, 0.09, legHeight, 0.09);
  }
  // Place settings in front of every chair, and the two candelabra.
  const topY = TABLE_TOP.y + TABLE_TOP.thickness / 2;
  const settings: Array<readonly [number, number]> = [
    ...SIDE_CHAIR_ALONG.flatMap((x) => [[x, -0.38], [x, 0.38]] as const),
    [-END_CHAIR_ALONG + 0.45, 0],
    [END_CHAIR_ALONG - 0.45, 0],
  ];
  for (const [x, z] of settings) {
    context.batch.add(new THREE.CylinderGeometry(0.13, 0.11, 0.012, 16).translate(x, topY + 0.006, z), materials.paper, frame);
    context.batch.add(new THREE.CylinderGeometry(0.03, 0.022, 0.13, 8).translate(x - Math.sign(x) * 0.2, topY + 0.065, z * 0.75), materials.brass, frame);
  }
  // A stained runner down the middle carries the candelabra and the wine. It is
  // thicker than the burn patch so their top faces never share a depth.
  const runnerTop = topY + 0.008;
  box(materials.paper, 0, (topY + runnerTop) / 2, 0, 4.0, runnerTop - topY, 0.36);
  for (const x of [-1.1, 1.1]) addCandelabrum(context, frame, x, runnerTop, 0);
  for (const [x, z] of [[-0.4, 0.12], [0.55, -0.1], [1.75, 0.08]] as const) {
    addBottle(context, new THREE.Matrix4().makeTranslation(x, runnerTop, z).premultiply(frame));
  }
  // One knocked over, rolled against a plate.
  const fallen = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-1.45, runnerTop + 0.038, -0.1);
  addBottle(context, fallen.premultiply(frame));
}

/** Dark glass wine bottle standing on its base at the origin of `frame`. */
function addBottle(context: MansionBuildContext, frame: THREE.Matrix4): void {
  const glass = context.materials.windowGlass;
  context.batch.add(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 10).translate(0, 0.11, 0), glass, frame);
  context.batch.add(new THREE.CylinderGeometry(0.014, 0.038, 0.05, 10).translate(0, 0.245, 0), glass, frame);
  context.batch.add(new THREE.CylinderGeometry(0.013, 0.013, 0.08, 8).translate(0, 0.31, 0), glass, frame);
}

/** Three-branch brass candelabrum standing at (x, baseY, z) of `frame`. */
function addCandelabrum(context: MansionBuildContext, frame: THREE.Matrix4, x: number, baseY: number, z: number): void {
  const { brass, paper } = context.materials;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => context.batch.add(geometry, material, frame);
  add(new THREE.CylinderGeometry(0.06, 0.09, 0.03, 12).translate(x, baseY + 0.015, z), brass);
  add(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 8).translate(x, baseY + 0.21, z), brass);
  add(new THREE.BoxGeometry(0.36, 0.02, 0.02).translate(x, baseY + 0.39, z), brass);
  for (const arm of [-0.17, 0, 0.17]) {
    add(new THREE.CylinderGeometry(0.03, 0.02, 0.04, 10).translate(x + arm, baseY + 0.42, z), brass);
    // Candles burnt down to different stubs.
    const candle = 0.05 + Math.abs(arm) * 0.5;
    add(new THREE.CylinderGeometry(0.015, 0.015, candle, 8).translate(x + arm, baseY + 0.44 + candle / 2, z), paper);
  }
}

function addChairs(context: MansionBuildContext): void {
  const { table } = MANSION_BANQUET_HALL;
  const random = seededRandom(5611);
  const chairs: Array<readonly [number, number, number]> = [
    ...SIDE_CHAIR_ALONG.flatMap((x) => [[x, -SIDE_CHAIR_OFFSET, 0], [x, SIDE_CHAIR_OFFSET, Math.PI]] as const),
    [-END_CHAIR_ALONG, 0, Math.PI / 2],
    [END_CHAIR_ALONG, 0, -Math.PI / 2],
  ];
  chairs.forEach(([x, z, yaw], index) => {
    // Diners left in a hurry: every chair a little askew, two badly so.
    const skew = (random() - 0.5) * 0.2 + (index === 2 || index === 7 ? 0.45 : 0);
    addChair(context, placement(table.x + x, 0, table.z + z, 0, yaw + skew).clone(), index % 3 === 0);
  });
}

/** Dining chair facing local +z, its back on the -z side. */
function addChair(context: MansionBuildContext, frame: THREE.Matrix4, polished: boolean): void {
  const material = polished ? context.materials.trimWood : context.materials.charredWood;
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number): void =>
    addLocalBox(context, material, frame, x, y, z, width, height, depth);
  box(0, 0.46, 0, 0.42, 0.05, 0.42);
  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.18, 0.18]) box(x, 0.22, z, 0.035, 0.44, 0.035);
    box(x, 0.73, -0.19, 0.035, 0.5, 0.035);
  }
  box(0, 0.92, -0.19, 0.4, 0.1, 0.03);
  box(0, 0.7, -0.19, 0.14, 0.3, 0.02);
}

function addSideboard(context: MansionBuildContext): void {
  const { materials } = context;
  const { sideboard } = MANSION_BANQUET_HALL;
  const frame = placement(sideboard.x, 0, sideboard.z).clone();
  const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void =>
    addLocalBox(context, material, frame, x, y, z, width, height, depth);
  const bodyWidth = sideboard.width - 0.06;
  const bodyDepth = sideboard.depth - 0.04;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) box(materials.trimWood, x * (bodyWidth / 2 - 0.05), 0.04, z * (bodyDepth / 2 - 0.05), 0.06, 0.08, 0.06);
  }
  box(materials.trimWood, 0, 0.47, 0, bodyWidth, 0.78, bodyDepth);
  box(materials.trimWood, 0, 0.885, 0, sideboard.width, 0.04, sideboard.depth);
  // Three scorched door panels on the front, facing the room.
  for (const x of [-0.7, 0, 0.7]) box(materials.charredWood, x, 0.47, bodyDepth / 2 + 0.005, 0.6, 0.58, 0.01);
  addCandelabrum(context, frame, -0.6, 0.905, 0);
}

/** Glazed china cabinet with its plates on edge; it faces north, into the hall. */
function addChinaCabinet(context: MansionBuildContext): void {
  const { materials } = context;
  const { chinaCabinet: cabinet } = MANSION_BANQUET_HALL;
  const frame = placement(cabinet.x, 0, cabinet.z, 0, Math.PI).clone();
  const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void =>
    addLocalBox(context, material, frame, x, y, z, width, height, depth);
  const half = cabinet.width / 2;
  const front = cabinet.depth / 2;
  box(materials.trimWood, 0, 0.06, 0, cabinet.width, 0.12, cabinet.depth);
  box(materials.trimWood, 0, 1.05, -front + 0.015, cabinet.width - 0.08, 1.86, 0.03);
  for (const side of [-1, 1]) box(materials.trimWood, side * (half - 0.02), 1.05, 0, 0.04, 1.86, cabinet.depth);
  box(materials.trimWood, 0, cabinet.height - 0.06, 0.02, cabinet.width + 0.06, 0.12, cabinet.depth + 0.04);
  // Lower cupboard, scorched, and the glazed upper case with its frame.
  box(materials.charredWood, 0, 0.42, front - 0.01, cabinet.width - 0.1, 0.56, 0.02);
  box(materials.trimWood, 0, 0.72, 0, cabinet.width - 0.08, 0.04, cabinet.depth - 0.02);
  const shelves = [1.12, 1.52] as const;
  for (const y of shelves) box(materials.trimWood, 0, y, -0.02, cabinet.width - 0.08, 0.025, cabinet.depth - 0.08);
  for (const y of [0.74, ...shelves]) {
    for (const x of [-0.45, -0.15, 0.15, 0.45]) {
      context.batch.add(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16).rotateX(Math.PI / 2).rotateY(0.15).translate(x, y + 0.13, -0.13), materials.paper, frame);
    }
  }
  const glassBottom = 0.74;
  const glassTop = cabinet.height - 0.12;
  context.batch.add(
    new THREE.PlaneGeometry(cabinet.width - 0.1, glassTop - glassBottom).translate(0, (glassBottom + glassTop) / 2, front - 0.01),
    materials.windowGlass,
    frame,
  );
  for (const x of [-half + 0.05, 0, half - 0.05]) box(materials.trimWood, x, (glassBottom + glassTop) / 2, front - 0.005, 0.04, glassTop - glassBottom, 0.03);
}

/**
 * Stone fireplace on the chimney breast: pilasters, frieze and mantel shelf,
 * a cast-iron firebox with a grate of still-smouldering logs on its hearth,
 * a carriage clock and candlesticks, and the officer's portrait above.
 */
function addFireplace(context: MansionBuildContext): void {
  const { materials } = context;
  const { chimney } = MANSION_BANQUET_HALL;
  // Local +z leaves the breast into the room (world -x); local +x runs north to south.
  const frame = placement(chimney.frontX, 0, chimney.z, 0, -Math.PI / 2).clone();
  const box = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void =>
    addLocalBox(context, material, frame, x, y, z, width, height, depth);
  const stone = materials.gravestone;
  const pilasterX = (FIREBOX.width + 0.22) / 2;
  for (const side of [-1, 1]) box(stone, side * pilasterX, (FIREBOX.height + 0.11) / 2, 0.05, 0.22, FIREBOX.height + 0.11, 0.1);
  box(stone, 0, FIREBOX.height + 0.11, 0.05, chimney.surroundWidth, 0.22, 0.1);
  box(stone, 0, FIREBOX.height + 0.25, 0.12, chimney.surroundWidth + 0.2, 0.06, 0.24);
  box(stone, 0, 0.025, 0.25, chimney.surroundWidth + 0.3, 0.05, 0.5);
  // Sooted firebox back and its cast-iron liner.
  box(materials.ash, 0, FIREBOX.height / 2, 0.004, FIREBOX.width, FIREBOX.height, 0.008);
  context.batch.add(new THREE.PlaneGeometry(FIREBOX.width, FIREBOX.height).translate(0, FIREBOX.height / 2, 0.01), materials.sootHeavy, frame);
  for (const side of [-1, 1]) box(materials.wroughtIron, side * (FIREBOX.width / 2 - 0.02), FIREBOX.height / 2, 0.03, 0.04, FIREBOX.height, 0.04);
  box(materials.wroughtIron, 0, FIREBOX.height - 0.02, 0.03, FIREBOX.width, 0.04, 0.04);
  // Grate basket and the logs that never stopped smouldering.
  for (const x of [-0.3, 0.3]) box(materials.wroughtIron, x, 0.12, 0.2, 0.03, 0.24, 0.03);
  for (let bar = 0; bar < 5; bar++) box(materials.wroughtIron, 0, 0.22, 0.1 + bar * 0.05, 0.7, 0.02, 0.015);
  for (const [x, y, z, length, yaw] of [[0, 0.29, 0.18, 0.62, 0.15], [0.05, 0.36, 0.2, 0.55, -0.35], [-0.1, 0.27, 0.32, 0.4, 0.6]] as const) {
    const log = new THREE.CylinderGeometry(0.055, 0.06, length, 8).rotateZ(Math.PI / 2).rotateY(yaw).translate(x, y, z);
    context.batch.add(log, materials.charredWood, frame);
  }
  box(materials.ash, 0, 0.065, 0.25, 0.8, 0.03, 0.35);
  // Mantel: a carriage clock stopped at the hour, two candlesticks, and fire irons beside the hearth.
  const mantelTop = FIREBOX.height + 0.28;
  box(materials.trimWood, 0.55, mantelTop + 0.13, 0.12, 0.28, 0.26, 0.13);
  context.batch.add(new THREE.CircleGeometry(0.08, 16).translate(0.55, mantelTop + 0.15, 0.187), materials.paper, frame);
  box(materials.brass, 0.55, mantelTop + 0.18, 0.19, 0.008, 0.06, 0.003);
  box(materials.brass, 0.57, mantelTop + 0.15, 0.19, 0.045, 0.006, 0.003);
  for (const x of [-0.65, -0.3]) {
    context.batch.add(new THREE.CylinderGeometry(0.02, 0.045, 0.2, 10).translate(x, mantelTop + 0.1, 0.12), materials.brass, frame);
    context.batch.add(new THREE.CylinderGeometry(0.015, 0.015, x < -0.5 ? 0.12 : 0.05, 8).translate(x, mantelTop + (x < -0.5 ? 0.26 : 0.225), 0.12), materials.paper, frame);
  }
  const ironsX = chimney.surroundWidth / 2 + 0.12;
  box(materials.wroughtIron, ironsX, 0.02, 0.2, 0.16, 0.03, 0.16);
  for (const tilt of [-0.06, 0, 0.07]) {
    context.batch.add(new THREE.CylinderGeometry(0.008, 0.008, 0.68, 6).rotateZ(tilt).translate(ironsX + tilt * 0.3, 0.36, 0.2), materials.wroughtIron, frame);
  }
}
