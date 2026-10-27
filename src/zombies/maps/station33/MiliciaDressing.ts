import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import { CONSIGNA_LOCKER, MILICIA, MILICIA_CELL, STATION33_BARRIERS, STATION33_DOORS, STATION33_RING_LOCKERS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { SignId } from './Station33Signage';

const { hall, ceilingHeight } = MILICIA;
/** Runner on the axis of the door, which is also the Armour locker's. */
const RUNNER = { z: 9.45, width: 1.2 } as const;
/** Board of honour on the vestibule wall, between the door and the riot rack. */
const HONOUR_BOARD = { z: 11.75, y: 1.88, width: 1.6, height: 1.05 } as const;

/**
 * Story and wear of the militia post, all non-solid: the evidence plate
 * over the Armour locker, propaganda posters, the red runner to it, the
 * board of honour, the stopped clock, "wanted" bulletins stripped of their photos,
 * reports scattered off the desk, blood by the back door and seepage down
 * the plaster. Litter stays flat and away from the entrances.
 */
export function buildMiliciaDressing(context: Station33BuildContext): void {
  addEvidencePlates(context);
  addSign(context, 'wanted', -9.0, 1.85, hall.minZ + 0.012, 0.8, 0.4, 0);
  addSign(context, 'wanted', -8.4, 1.8, hall.maxZ - 0.012, 0.8, 0.4, Math.PI);
  addPosters(context);
  addRunner(context);
  addHonourBoard(context);
  addWallClock(context);
  addLooseReports(context);
  addDecals(context);
}

/**
 * Propaganda on the plaster, above the wainscot: the militia poster between
 * the evidence lockers and the cell, the vigilance poster over the safe, the
 * duty roster by the door and the cell's plate on its bars.
 */
function addPosters(context: Station33BuildContext): void {
  addSign(context, 'militia-poster', hall.minX + 0.012, 1.95, 12.9, 0.7, 1.05, Math.PI / 2);
  addSign(context, 'vigilance-poster', hall.maxX - 0.03, 1.9, 7.0, 0.6, 0.9, -Math.PI / 2);
  addSign(context, 'duty-roster', hall.maxX - 0.03, 1.6, 7.95, 0.5, 0.25, -Math.PI / 2);
  addSign(context, 'holding-cell', (hall.minX + MILICIA_CELL.doorMinX) / 2, MILICIA_CELL.barHeight + 0.22, MILICIA_CELL.frontZ - 0.02, 0.5, 0.25, Math.PI);
}

/**
 * Red runner with green edge stripes from the door to the Armour locker:
 * the way every visitor was walked to the evidence room. A thin slab, laid
 * over the grime and the scattered reports.
 */
function addRunner(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const minX = hall.minX + CONSIGNA_LOCKER.depth + 0.25;
  const maxX = hall.maxX - 0.2;
  const x = (minX + maxX) / 2;
  const length = maxX - minX;
  const { z, width } = RUNNER;
  batch.addBox(materials.redCloth, x, 0.006, z, length, 0.012, width);
  for (const side of [-1, 1]) batch.addBox(materials.paintedSteel, x, 0.0125, z + side * (width / 2 - 0.08), length, 0.002, 0.05);
}

/**
 * Board of honour on the vestibule wall, between the door and the riot
 * rack: gilt-edged panel, red header, empty frames where the portraits
 * were, and a ribbed radiator under it.
 */
function addHonourBoard(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { z, width, height, y } = HONOUR_BOARD;
  // In front of the paint and wainscot over the vestibule's marble.
  const back = hall.maxX - 0.04;
  batch.addBox(materials.varnishedWood, back - 0.015, y, z, 0.03, height, width);
  for (const edge of [-1, 1]) batch.addBox(materials.bronze, back - 0.03, y + edge * height / 2, z, 0.03, 0.03, width + 0.04);
  const face = back - 0.03;
  addSign(context, 'honour-board', face - 0.002, y + height / 2 - 0.16, z, width - 0.2, 0.22, -Math.PI / 2);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const frameZ = z - width / 2 + 0.28 + column * ((width - 0.56) / 3);
      const frameY = y + 0.12 - row * 0.42;
      batch.addBox(materials.bronze, face - 0.004, frameY, frameZ, 0.008, 0.3, 0.24);
      // Pale paper where each photograph was torn out.
      addDecal(context, materials.paper, face - 0.01, frameY, frameZ, 0.19, 0.25, -Math.PI / 2);
    }
  }
  const radiatorY = 0.5;
  const radiatorX = hall.maxX - 0.12;
  for (let fin = 0; fin < 12; fin++) {
    batch.addBox(materials.paintedSteel, radiatorX, radiatorY, z - 0.6 + fin * 0.11, 0.12, 0.55, 0.06);
  }
  for (const pipeY of [radiatorY - 0.24, radiatorY + 0.24]) batch.addBox(materials.greySteel, radiatorX, pipeY, z, 0.04, 0.04, 1.3);
}

/** Round office clock over the door, inside: cream face, bronze bezel and hands stopped at the hour the post fell. */
function addWallClock(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const door = STATION33_DOORS.find((candidate) => candidate.id === 'to-milicia')!;
  const y = POINT_DOOR_SIZE.height + 0.62;
  const face = hall.maxX - 0.04;
  const disc = (radius: number, depth: number, out: number): THREE.CylinderGeometry =>
    new THREE.CylinderGeometry(radius, radius, depth, 24).rotateZ(Math.PI / 2).translate(face - out, y, door.z) as THREE.CylinderGeometry;
  batch.add(disc(0.2, 0.05, 0), materials.bronze);
  batch.add(disc(0.17, 0.01, 0.03), materials.paper);
  // Hour hand at the four, minute hand at the twelve.
  // Seen from the room the clock faces -X, so +Z is to the viewer's right.
  batch.addBox(materials.rubber, face - 0.04, y - 0.025, door.z + 0.043, 0.005, 0.1, 0.012, (2 * Math.PI) / 3, 0, 0);
  batch.addBox(materials.rubber, face - 0.04, y + 0.07, door.z, 0.005, 0.14, 0.01);
}

function addSign(context: Station33BuildContext, id: SignId, x: number, y: number, z: number, width: number, height: number, yaw: number): void {
  const sign = context.signage.signGeometry(id, width, height).rotateY(yaw).translate(x, y, z);
  context.batch.add(sign, context.signage.material);
}

/** "Material evidence" plate on the wall above each open locker of the post. */
function addEvidencePlates(context: Station33BuildContext): void {
  const back = CONSIGNA_LOCKER.depth - 0.012;
  for (const locker of STATION33_RING_LOCKERS.filter((candidate) => candidate.zone === 'milicia')) {
    addSign(
      context, 'evidence',
      locker.x - locker.facingX * back, CONSIGNA_LOCKER.height + 0.4, locker.z - locker.facingZ * back,
      0.9, 0.45, Math.atan2(locker.facingX, locker.facingZ),
    );
  }
}

/** Report forms blown off the duty desk across the floor. */
function addLooseReports(context: Station33BuildContext): void {
  const random = seededRandom(3449);
  for (let index = 0; index < 14; index++) {
    const sheet = new THREE.PlaneGeometry(0.21, 0.3);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(
      THREE.MathUtils.lerp(MILICIA_CELL.sideX, hall.maxX - 0.8, random()),
      0.004 + index * 0.0002,
      THREE.MathUtils.lerp(hall.minZ + 1.2, 14.0, random()),
    );
    context.batch.add(sheet, context.materials.paper);
  }
}

function addDecal(context: Station33BuildContext, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, yaw: number | 'floor'): void {
  const decal = new THREE.PlaneGeometry(width, height);
  if (yaw === 'floor') decal.rotateX(-Math.PI / 2).rotateY(x + z);
  else decal.rotateY(yaw);
  decal.translate(x, y, z);
  context.batch.add(decal, material);
}

function addDecals(context: Station33BuildContext): void {
  const { materials } = context;
  const backDoor = STATION33_BARRIERS.find((barrier) => barrier.id === 'milicia-back-door')!;
  addDecal(context, materials.bloodSmear, backDoor.x + 1.4, 1.0, hall.maxZ - 0.006, 1.1, 0.9, Math.PI);
  addDecal(context, materials.bloodSmear, backDoor.x - 0.3, 0.006, hall.maxZ - 1.4, 1.5, 0.8, 'floor');
  addDecal(context, materials.bloodSplatter, MILICIA_CELL.sideX - 2.2, 0.006, 16.3, 0.9, 0.9, 'floor');
  const streakY = ceilingHeight - 0.7;
  // Clear of the posters, the banner and the ruby star.
  for (const z of [6.6, 16.6]) addDecal(context, materials.waterStreak, hall.minX + 0.006, streakY, z, 1.1, 1.4, Math.PI / 2);
  addDecal(context, materials.waterStreak, hall.minX + 0.8, streakY, hall.minZ + 0.006, 1.1, 1.4, 0);
  const random = seededRandom(3457);
  for (let index = 0; index < 5; index++) {
    const size = 1.0 + random() * 1.1;
    addDecal(
      context, materials.floorGrime,
      THREE.MathUtils.lerp(hall.minX + 1, hall.maxX - 1, random()),
      0.003 + index * 0.0003,
      THREE.MathUtils.lerp(hall.minZ + 1, hall.maxZ - 1, random()),
      size, size * (0.6 + random() * 0.4), 'floor',
    );
  }
}
