import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { STATION33_BARRIERS, SUBESTACION } from '../Station33Config';
import { cobwebGeometry, type CobwebCorner } from './Cobwebs';
import type { Station33BuildContext } from './Station33BuildContext';

const { gallery, hall, hallHeight } = SUBESTACION;

/**
 * Story and wear of the machine room, all non-solid: nobody has been down
 * here since the evacuation, so webs hang in every corner and off the
 * machines; oil has pooled under them, water runs down the plaster, the
 * duty log lies scattered by the switchboards and blood marks the way the
 * dead came in.
 */
export function buildSubestacionDressing(context: Station33BuildContext): void {
  addCobwebs(context);
  addSigns(context);
  addDutyLog(context);
  addDecals(context);
}

/**
 * Web planes on wall faces. `yaw` turns the plane (facing +Z at 0) so its
 * local +X runs (cos yaw, 0, -sin yaw) before it is placed at (x, y, z);
 * the anchor corner sits there and the web spreads away from it.
 */
const COBWEBS: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly width: number; readonly height: number; readonly corner: CobwebCorner }> = [
  // Ceiling corners of the hall and the gallery.
  { x: hall.minX + 0.01, y: hallHeight, z: hall.minZ + 0.02, yaw: -Math.PI / 2, width: 1.1, height: 0.9, corner: 'top-left' },
  { x: hall.maxX - 0.01, y: hallHeight, z: hall.minZ + 0.02, yaw: -Math.PI / 2, width: 1.0, height: 1.0, corner: 'top-left' },
  { x: hall.minX + 0.02, y: hallHeight, z: hall.maxZ - 0.01, yaw: 0, width: 0.9, height: 0.8, corner: 'top-left' },
  { x: hall.maxX - 0.02, y: hallHeight, z: hall.maxZ - 0.01, yaw: Math.PI, width: 1.2, height: 0.9, corner: 'top-left' },
  { x: gallery.minX + 0.01, y: SUBESTACION.galleryHeight, z: gallery.maxZ - 0.02, yaw: Math.PI / 2, width: 0.8, height: 0.7, corner: 'top-left' },
  { x: gallery.maxX - 0.01, y: SUBESTACION.galleryHeight, z: gallery.maxZ - 0.02, yaw: Math.PI / 2, width: 0.9, height: 0.7, corner: 'top-left' },
  // Strung between the switchboards' tops and the wall.
  { x: 7.62, y: 2.2, z: hall.minZ + 0.02, yaw: 0, width: 0.6, height: 0.55, corner: 'bottom-left' },
  { x: 14.38, y: 2.2, z: hall.minZ + 0.02, yaw: 0, width: 0.7, height: 0.5, corner: 'bottom-right' },
  // Between the transformers' conservator and the east wall.
  { x: hall.maxX - 0.01, y: 3.0, z: -42.6, yaw: -Math.PI / 2, width: 0.8, height: 0.7, corner: 'top-left' },
];

function addCobwebs(context: Station33BuildContext): void {
  for (const web of COBWEBS) {
    const geometry = cobwebGeometry(web.width, web.height, web.corner).rotateY(web.yaw).translate(web.x, web.y, web.z);
    context.batch.add(geometry, context.materials.cobweb);
  }
}

/** The no-entry plate by the cable tunnel the dead come through. */
function addSigns(context: Station33BuildContext): void {
  const tunnel = STATION33_BARRIERS.find((barrier) => barrier.id === 'subestacion-cable-tunnel')!;
  const plate = context.signage.signGeometry('no-entry', 0.6, 0.3).translate(tunnel.x - 1.3, 1.8, hall.minZ + 0.035);
  context.batch.add(plate, context.signage.material);
}

/** Pages of the duty log and loose forms on the floor in front of the switchboards. */
function addDutyLog(context: Station33BuildContext): void {
  const random = seededRandom(3473);
  for (let index = 0; index < 14; index++) {
    const sheet = new THREE.PlaneGeometry(0.16 + random() * 0.08, 0.22 + random() * 0.06);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(8.0 + random() * 6.0, 0.004 + index * 0.0002, hall.minZ + 1.35 + random() * 1.2);
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

/** Oil pooled under the machines, seepage down the plaster and the horde's trail from the grille. */
function addDecals(context: Station33BuildContext): void {
  const { materials } = context;
  for (const [x, z, size] of [[7.9, -39.0, 1.6], [13.5, -41.8, 1.4], [18.0, -42.6, 1.8], [9.6, -36.0, 1.2]] as const) {
    addDecal(context, materials.floorGrime, x, 0.004, z, size, size * 0.7, 'floor');
  }
  // Under the ceiling leaks of the hall and the gallery.
  for (const [x, z, size] of [[16.9, -38.6, 1.4], [9.2, -36.5, 0.9], [12.7, -30.4, 1.1]] as const) {
    addDecal(context, materials.puddle, x, 0.006, z, size, size * 0.7, 'floor');
  }
  addDecal(context, materials.waterStreak, gallery.maxX - 0.035, SUBESTACION.galleryHeight - 0.9, -30.4, 1.0, 1.6, -Math.PI / 2);
  const streakY = hallHeight - 1.1;
  for (const x of [6.4, 16.8]) addDecal(context, materials.waterStreak, x, streakY, hall.minZ + 0.035, 1.2, 1.8, 0);
  for (const z of [-41.6, -44.6]) addDecal(context, materials.waterStreak, hall.minX + 0.035, streakY, z, 1.2, 1.8, Math.PI / 2);
  const vent = STATION33_BARRIERS.find((barrier) => barrier.id === 'subestacion-vent-east')!;
  addDecal(context, materials.bloodSmear, hall.maxX - 1.4, 0.007, vent.z + 0.3, 1.8, 0.9, 'floor');
  addDecal(context, materials.bloodSplatter, hall.maxX - 0.036, 1.1, vent.z - 1.3, 0.9, 1.0, -Math.PI / 2);
}
