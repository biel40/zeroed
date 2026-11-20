import * as THREE from 'three';
import { POINT_DOOR_SIZE } from '../../../doors/PointDoor';
import { DIE_KATHEDRALE_WALL_THICKNESS } from '../../DieKathedraleConfig';
import { MIRADOR_PORTAL } from '../../DieKathedraleExteriorConfig';
import { addSolidProxy } from '../../shared/SolidProxy';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, lancetShape, ribGeometries, wallShapeGeometry } from '../GothicVault';

/** The seaward side portal and the succession of piers over its approaches. */
export function addEastFacade(context: DieKathedraleBuildContext, buttressLines: ReadonlyArray<number>): void {
  addPortal(context);
  for (const z of buttressLines) addPier(context, z);
}

function addPortal(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { x, z } = MIRADOR_PORTAL;
  const face = x + DIE_KATHEDRALE_WALL_THICKNESS / 2;
  const innerJamb = POINT_DOOR_SIZE.width / 2;
  const shoulders = 3.1;
  const apex = 4.6;
  const tympanum = lancetShape(3.1, POINT_DOOR_SIZE.height + 0.05, shoulders, apex, 9);
  batch.add(wallShapeGeometry(tympanum, 'px', face + 0.07, z, materials.roughStone.userData.metersPerTile as number), materials.roughStone);
  // Receding archivolts and their colonnettes follow the pointed silhouette.
  for (let order = 0; order < 4; order++) {
    const span = innerJamb + 0.1 + order * 0.29;
    const depth = face + 0.15 + order * 0.17;
    const points = archPoints(depth, z - span, depth, z + span, shoulders, 0.95 + order * 0.17, 9);
    for (const geometry of ribGeometries(points, 0.19, 0.22)) batch.add(geometry, materials.dressedStone);
    for (const side of [-1, 1]) {
      const jamb = z + side * span;
      batch.add(new THREE.CylinderGeometry(0.09, 0.12, shoulders, 7).translate(depth, shoulders / 2, jamb), materials.dressedStone);
      for (const y of [0.16, shoulders - 0.12]) batch.addBox(materials.dressedStone, depth, y, jamb, 0.24, 0.22, 0.24);
    }
  }
  // The sculpted banquet is read in silhouette across the upper door band.
  batch.addBox(materials.dressedStone, face + 0.14, 2.51, z, 0.16, 0.11, 2.38);
  for (let figure = -6; figure <= 6; figure++) {
    const height = figure === 0 ? 0.56 : 0.35;
    addStoneFigure(context, face + 0.17, 2.57, z + figure * 0.173, height);
  }
  for (const side of [-1, 1]) {
    const zWing = z + side * 1.93;
    const xWing = face + 0.63;
    addPortalPlinth(context, xWing, zWing);
    batch.addBox(materials.wallStone, face + 0.13, 2.6, zWing, 0.25, 5.2, 0.64, 0, 0, 0, side);
    addStoneFigure(context, xWing, 0.61, zWing, 1.26);
    batch.add(new THREE.ConeGeometry(0.4, 1.5, 4).rotateY(Math.PI / 4).translate(face + 0.31, 5.95, zWing), materials.dressedStone);
  }
}

/** Quiet funerary or niche sculpture, standing on its own plinth. */
export function addStoneFigure(context: DieKathedraleBuildContext, x: number, baseY: number, z: number, height: number): void {
  const { batch, materials } = context;
  const body = new THREE.CylinderGeometry(height * 0.11, height * 0.19, height * 0.73, 7);
  const head = new THREE.SphereGeometry(height * 0.11, 7, 5).scale(0.94, 1.16, 0.94);
  batch.add(body.translate(x, baseY + height * 0.38, z), materials.dressedStone);
  batch.add(head.translate(x, baseY + height * 0.86, z), materials.dressedStone);
  batch.addBox(materials.dressedStone, x + height * 0.08, baseY + height * 0.56, z, height * 0.25, height * 0.18, height * 0.12);
}

function addPortalPlinth(context: DieKathedraleBuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  for (let step = 0; step < 3; step++) {
    const size = 0.96 - step * 0.14;
    batch.addBox(materials.dressedStone, x, 0.1 + step * 0.2, z, size, 0.2, size, 0, 0, 0, step);
  }
  addSolidProxy(context, `mirador-statue-${z}`,
    { x: x - 0.48, y: 0, z: z - 0.48 }, { x: x + 0.48, y: 1.75, z: z + 0.48 }, 'concrete', 'none');
}

function addPier(context: DieKathedraleBuildContext, z: number): void {
  const { batch, materials } = context;
  const x = 17.35;
  batch.addBox(materials.wallStone, x, 4.1, z, 0.9, 8.2, 1.05, 0, 0, 0, z);
  batch.addBox(materials.dressedStone, x, 0.4, z, 1.28, 0.8, 1.35, 0, 0, 0, z);
  batch.addBox(materials.dressedStone, x, 8.26, z, 1.09, 0.28, 1.19, 0, 0, 0, z);
  batch.add(new THREE.ConeGeometry(0.64, 2.4, 4).rotateY(Math.PI / 4).translate(x, 9.55, z), materials.dressedStone);
  const flyingArch = [
    new THREE.Vector3(14.26, 11.3, z), new THREE.Vector3(15.35, 10.8, z),
    new THREE.Vector3(16.35, 9.96, z), new THREE.Vector3(17.35, 8.25, z),
  ];
  for (const geometry of ribGeometries(flyingArch, 0.65, 0.72)) batch.add(geometry, materials.wallStone);
  addSolidProxy(context, `mirador-buttress-${z}`,
    { x: x - 0.64, y: 0, z: z - 0.675 }, { x: x + 0.64, y: 8.4, z: z + 0.675 }, 'concrete', 'none');
}
