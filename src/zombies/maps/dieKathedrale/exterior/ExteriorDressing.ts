import * as THREE from 'three';
import { COURTYARD_GRILLE, EXTERIOR_AREAS, MIRADOR_PORTAL, PALAU_POSTERN, SLEIGHT_OF_HAND_SITE } from '../../DieKathedraleExteriorConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { addSolidProxy } from '../../shared/SolidProxy';
import { addCandleCluster, addFloorStain, addWallStain, addWallTorch } from '../catacombs/CatacombDecor';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, lancetShape, ribGeometries, wallShapeGeometry } from '../GothicVault';
import { addStoneFigure } from './MiradorPortal';

export function dressEsplanade(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  addWell(context, 29.1, -29.9);
  addFallenMasonry(context, 25.8, -23.5);
  addScatter(context, 23, -34.3, 1.3, 1201);
  addScatter(context, 30.9, -16.1, 1, 1202);
  addScatter(context, 19.5, MIRADOR_PORTAL.z + 1.3, 0.65, 1203);
  for (const z of [-28, -21, -14]) {
    addFloorStain(batch, materials, 16.2, 0, z, 4.1, 2.2, 0.22);
    addWallStain(batch, materials, 14.3, 0, z - 0.3, 1, 0, 1.7, 3.8);
  }
  addGateSurround(context, COURTYARD_GRILLE.x - 0.18, COURTYARD_GRILLE.z);
}

export function dressSidePassage(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { maxX, maxZ } = EXTERIOR_AREAS.sidePassage;
  addGateSurround(context, 14.34, PALAU_POSTERN.z);
  addWallTorch(context, 14.34, 2.65, PALAU_POSTERN.z + 1.3, 1, 0);
  addScatter(context, 23.5, -9, 1, 1204);
  addScatter(context, 17.4, 2.1, 0.9, 1205);
  // The stone-cover line marks the rainwater channel along the alley.
  batch.addBox(materials.roughStone, 23.5, -0.018, -4.25, 0.34, 0.04, 18.8);
  for (let z = 9; z < maxZ; z += 1.4) {
    batch.addBox(materials.dressedStone, maxX, 1.31, z, 0.48, 0.13, 0.75);
    batch.addBox(materials.iron, maxX, 1.53, z, 0.05, 0.55, 0.052);
  }
  batch.addBox(materials.iron, maxX, 1.79, 12.95, 0.05, 0.055, 8.3);
  addBackgroundRoofs(context);
}

export function dressCourtyard(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { x, z } = SLEIGHT_OF_HAND_SITE;
  addWell(context, 35.7, -27.7);
  addScatter(context, 33.6, -32, 0.9, 1206);
  addScatter(context, 41.3, -20.6, 0.65, 1207);

  // A stepped votive shrine frames the ring's pedestal, with the landing kept
  // clear in front of the pedestal and around both sides of the well.
  addVotiveBacking(context, x, z - 1.72);
  addCandleCluster(context, x - 0.91, 0.39, z - 1.48, 5, 0.36, seededRandom(1208));
  addCandleCluster(context, x + 0.91, 0.39, z - 1.48, 6, 0.36, seededRandom(1209));
  addFloorStain(batch, materials, x, 0, z, 4, 3.4, 0);
  for (const [mossX, mossZ, yaw] of [[33.2, -32.55, 0.53], [40.65, -32.5, -0.3], [41.46, -27.1, 1.34]] as const) {
    addMoss(context, mossX, mossZ, yaw);
  }
}

function addGateSurround(context: DieKathedraleBuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  const shoulder = 2.12;
  const half = 0.97;
  const arch = archPoints(x, z - half, x, z + half, shoulder, 0.65, 7);
  for (const geometry of ribGeometries(arch, 0.24, 0.23)) batch.add(geometry, materials.dressedStone);
  for (const side of [-1, 1]) {
    const jamb = z + side * half;
    batch.addBox(materials.dressedStone, x, shoulder / 2, jamb, 0.26, shoulder, 0.22, 0, 0, 0, side);
  }
}

function addVotiveBacking(context: DieKathedraleBuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  const backZ = z - 0.52;
  for (let step = 0; step < 3; step++) {
    const depth = 1.3 - step * 0.24;
    batch.addBox(materials.dressedStone, x, 0.065 + step * 0.13, backZ + depth / 2, 2.65 - step * 0.2, 0.13, depth);
  }
  batch.addBox(materials.wallStone, x, 1.41, backZ, 2.3, 2.85, 0.22);
  const niche = lancetShape(0.92, 0.63, 2.03, 2.6, 8);
  batch.add(wallShapeGeometry(niche, 'pz', x, backZ + 0.12), materials.cavity);
  const vault = archPoints(x - 0.58, backZ + 0.18, x + 0.58, backZ + 0.18, 2.02, 0.71, 8);
  for (const geometry of ribGeometries(vault, 0.19, 0.18)) batch.add(geometry, materials.dressedStone);
  addStoneFigure(context, x, 0.39, z - 0.16, 1.76);
  addSolidProxy(context, 'side-courtyard-votive-backing',
    { x: x - 1.325, y: 0, z: backZ - 0.11 }, { x: x + 1.325, y: 2.85, z: backZ + 1.3 }, 'concrete', 'none');
}

function addWell(context: DieKathedraleBuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  batch.add(new THREE.CylinderGeometry(0.94, 0.99, 0.77, 8).translate(x, 0.385, z), materials.wallStone);
  batch.add(new THREE.CylinderGeometry(1.03, 1.03, 0.15, 8).translate(x, 0.82, z), materials.dressedStone);
  batch.add(new THREE.CircleGeometry(0.75, 8).rotateX(-Math.PI / 2).translate(x, 0.899, z), materials.darkWood);
  for (let strap = -1; strap <= 1; strap++) {
    const offset = strap * 0.37;
    batch.addBox(materials.iron, x + offset, 0.91, z, 0.07, 0.042, strap === 0 ? 1.38 : 1.21);
  }
  addSolidProxy(context, `precinct-well-${x}`,
    { x: x - 0.92, y: 0, z: z - 0.92 }, { x: x + 0.92, y: 0.9, z: z + 0.92 }, 'concrete');
}

function addFallenMasonry(context: DieKathedraleBuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  batch.addBox(materials.wallStone, x, 0.39, z, 2.5, 0.78, 1.22, 0, 0, 0, 11);
  batch.addBox(materials.roughStone, x - 0.56, 0.91, z, 1.08, 0.33, 1.05, 0.14, 0.14, 0.2, 12);
  batch.addBox(materials.dressedStone, x + 0.47, 0.86, z, 1.5, 0.28, 0.7, 0.06, 0.06, -0.09);
  batch.addBox(materials.dressedStone, x + 0.39, 0.86, z + 0.1, 0.29, 0.27, 1.45, 0.08, 0.05, -0.07);
  addSolidProxy(context, 'mirador-fallen-masonry',
    { x: x - 1.25, y: 0, z: z - 0.61 }, { x: x + 1.25, y: 0.94, z: z + 0.61 }, 'concrete', 'none');
}

function addScatter(context: DieKathedraleBuildContext, x: number, z: number, spread: number, seed: number): void {
  const { batch, materials } = context;
  const random = seededRandom(seed);
  for (let index = 0; index < 8; index++) {
    const size = 0.06 + random() * 0.15;
    const px = x + (random() - 0.5) * spread * 2;
    const pz = z + (random() - 0.5) * spread * 2;
    batch.addBox(index % 3 === 0 ? materials.dressedStone : materials.roughStone,
      px, size * 0.34, pz, size * 1.5, size, size, 0.4, random() * Math.PI, 0.1, index);
  }
}

function addMoss(context: DieKathedraleBuildContext, x: number, z: number, yaw: number): void {
  const { batch, materials } = context;
  for (let blade = 0; blade < 5; blade++) {
    const tuft = new THREE.PlaneGeometry(0.21, 0.09 + blade * 0.013)
      .rotateX(-0.7).rotateY(yaw + blade * 0.55)
      .translate(x + Math.cos(blade) * 0.2, 0.055, z + Math.sin(blade) * 0.15);
    batch.add(tuft, materials.foliage);
  }
}

/** Restrained roofs outside the protective wall, against the existing bay vista. */
function addBackgroundRoofs(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  for (const [x, z, width, depth, height] of [[35, 3, 8, 5, 4], [42, 9, 6, 7, 5], [51, 6, 9, 8, 6]] as const) {
    batch.addBox(materials.roughStone, x, height / 2 - 2, z, width, height + 4, depth, 0, 0, 0, x);
    const gable = new THREE.Shape().moveTo(-width / 2 - 0.2, 0).lineTo(width / 2 + 0.2, 0).lineTo(0, 1.9).closePath();
    const roof = new THREE.ExtrudeGeometry(gable, { depth: depth + 0.5, bevelEnabled: false })
      .translate(x, height - 0.04, z - depth / 2 - 0.25);
    batch.add(roof, materials.darkWood);
  }
}
