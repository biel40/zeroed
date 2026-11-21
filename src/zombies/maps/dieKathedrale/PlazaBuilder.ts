import * as THREE from 'three';
import { DIE_KATHEDRALE_WALL_THICKNESS, NAVE, PLAZA, ROSE_WINDOWS } from '../DieKathedraleConfig';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import { addCandleCluster, addFloorStain, addWallStain } from './catacombs/CatacombDecor';
import { lancetShape, wallShapeGeometry } from './GothicVault';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import { addStoneWall, roseRingGeometry, roundPaneGeometry } from './DieKathedraleWalls';
import { addGreatDoorFace } from './MainPortal';

const HALF_WALL = DIE_KATHEDRALE_WALL_THICKNESS / 2;
const FRONT_TOP = NAVE.endWallHeight;

/** Buttress piers standing on the front, by their centre X: the pair flanking the great doors rise into turrets. */
const FRONT_PIERS = [
  { x: -10.2, width: 1.1, depth: 0.9, height: 19.5 },
  { x: -3.25, width: 1.2, depth: 1, height: 27 },
  { x: 3.25, width: 1.2, depth: 1, height: 27 },
  { x: 10.2, width: 1.1, depth: 0.9, height: 19.5 },
] as const;

/** Solid street furniture of the plaza; the lamp posts stand under their light sites. */
const PLAZA_LAMP_POSTS = [{ x: -9.5, z: 12.2 }, { x: 9.5, z: 12.2 }] as const;
const PLAZA_PLANTERS = [{ x: -11.2, z: 14.7 }, { x: 11.2, z: 14.7 }] as const;
const PLAZA_BENCHES = [{ x: -5.2, z: PLAZA.maxZ - 0.5 }, { x: 5.2, z: PLAZA.maxZ - 0.5 }] as const;

const PLANTER = { halfSize: 0.8, height: 0.7 } as const;
const BENCH = { halfLength: 1.1, halfDepth: 0.3, height: 0.55 } as const;
const LAMP_HEIGHT = 3.7;

/**
 * The entrance plaza: paving, the side walls with their gates, the parapet
 * over the sea, the street furniture, and the outer face of the main front
 * (great doors, rose, buttress piers, turrets and gable).
 */
export function buildPlaza(context: DieKathedraleBuildContext): void {
  addGround(context);
  addEnclosure(context);
  addFront(context);
  addStreetFurniture(context);
  addProcessionalDressing(context);
}

function addGround(context: DieKathedraleBuildContext): void {
  const width = PLAZA.maxX - PLAZA.minX + DIE_KATHEDRALE_WALL_THICKNESS * 2;
  const depth = PLAZA.maxZ - PLAZA.minZ + DIE_KATHEDRALE_WALL_THICKNESS;
  context.structure.addBox(0, -0.08, PLAZA.minZ + depth / 2, width, 0.16, depth, context.materials.plazaPaving, {
    name: 'plaza-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 3, worldUVs: true, blocksPlayer: false,
  });
}

/** A torn runner and sheltered votives are all that remain of the procession. */
function addProcessionalDressing(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const face = PLAZA.minZ;
  // Outline on the ground, with a torn seaward end and an edge folded back over itself.
  const runner = new THREE.Shape()
    .moveTo(-1.03, -1.1).lineTo(1.03, -1.16).lineTo(1.06, -3.68).lineTo(0.94, -5.33)
    .lineTo(0.54, -5.16).lineTo(0.16, -5.38).lineTo(-0.04, -4.86).lineTo(-0.49, -5.2)
    .lineTo(-0.88, -5.12).lineTo(-1.06, -4.07).lineTo(-0.99, -2.51).closePath();
  batch.add(new THREE.ShapeGeometry(runner).rotateX(-Math.PI / 2).translate(0, 0.017, face), materials.redCloth);
  const fold = new THREE.Shape().moveTo(0.15, -0.06).lineTo(0.76, -0.44).lineTo(0.16, -0.47).closePath();
  batch.add(new THREE.ShapeGeometry(fold).rotateX(-Math.PI / 2 - 0.31).translate(0, 0.019, face + 4.76), materials.redCloth);
  for (const side of [-1, 1]) {
    batch.addBox(materials.gilt, side * 0.85, 0.019, face + 2.96, 0.04, 0.005, 3.48);
    const lanternX = side * 4.7;
    addCandleCluster(context, lanternX, 0, face + 0.42, side === -1 ? 7 : 4, 0.45, seededRandom(1210 + side));
    addWallStain(batch, materials, lanternX, 0, face, 0, 1, 1.35, 3.7);
    const parapetX = side * 7.6;
    addWallStain(batch, materials, parapetX, 0, PLAZA.maxZ, 0, -1, 2.8, 1.03);
    addFloorStain(batch, materials, parapetX, 0, PLAZA.maxZ - 0.86, 3.5, 1.5, side * 0.18);
  }
}

/** Tall side walls (the gates are zombie entrances) and the low parapet on the sea side. */
function addEnclosure(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure } = context;
  const outerMaxZ = PLAZA.maxZ + DIE_KATHEDRALE_WALL_THICKNESS;
  for (const side of [-1, 1]) {
    const fixed = side * (PLAZA.maxX + HALF_WALL);
    addStoneWall(context, side < 0 ? 'plaza-west-wall' : 'plaza-east-wall', {
      axis: 'z', fixed, min: PLAZA.minZ, max: outerMaxZ, height: PLAZA.wallHeight,
    });
    batch.addBox(materials.dressedStone, fixed, PLAZA.wallHeight + 0.08, (PLAZA.minZ + outerMaxZ) / 2, 0.5, 0.16, outerMaxZ - PLAZA.minZ, 0, 0, 0, side + 2);
  }
  const parapetZ = PLAZA.maxZ + HALF_WALL;
  // Two solids: one 28 m piece would be longer than the zombies' obstacle limit.
  for (const side of [-1, 1]) {
    structure.addBox(side * PLAZA.maxX / 2, PLAZA.parapetHeight / 2, parapetZ, PLAZA.maxX, PLAZA.parapetHeight, DIE_KATHEDRALE_WALL_THICKNESS, materials.wallStone, {
      name: `plaza-parapet-${side < 0 ? 'west' : 'east'}`, surface: 'concrete', mapRole: 'wall', castShadow: false, uvSeed: 4 + side, worldUVs: true, blocksPlayer: true,
    });
  }
  batch.addBox(materials.dressedStone, 0, PLAZA.parapetHeight + 0.05, parapetZ, PLAZA.maxX - PLAZA.minX, 0.1, 0.46, 0, 0, 0, 5);
  for (let x = PLAZA.minX + 0.3; x <= PLAZA.maxX; x += 3.425) {
    batch.addBox(materials.dressedStone, x, (PLAZA.parapetHeight + 0.35) / 2, parapetZ, 0.5, PLAZA.parapetHeight + 0.35, 0.5, 0, 0, 0, x);
    batch.add(new THREE.SphereGeometry(0.2, 8, 6).translate(x, PLAZA.parapetHeight + 0.5, parapetZ), materials.dressedStone);
  }
}

/** The main front as the plaza sees it. */
function addFront(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const face = PLAZA.minZ;
  addGreatDoorFace(context, face, 'pz');
  const rose = ROSE_WINDOWS.front;
  batch.add(roundPaneGeometry(rose.radius, 'pz', 0, rose.y, face + 0.03), materials.glassRose);
  batch.add(roseRingGeometry(rose.radius, 'pz', 0, rose.y, face + 0.05), materials.dressedStone);
  batch.add(roseRingGeometry(rose.radius + 0.55, 'pz', 0, rose.y, face + 0.04), materials.dressedStone);

  for (const pier of FRONT_PIERS) {
    const lowerHeight = pier.height * 0.4;
    batch.addBox(materials.dressedStone, pier.x, lowerHeight / 2, face + pier.depth / 2, pier.width, lowerHeight, pier.depth, 0, 0, 0, pier.x);
    batch.addBox(materials.dressedStone, pier.x, (lowerHeight + pier.height) / 2, face + pier.depth * 0.35, pier.width * 0.82, pier.height - lowerHeight, pier.depth * 0.7, 0, 0, 0, pier.x + 1);
    batch.add(new THREE.ConeGeometry(pier.width * 0.62, pier.width * 3.4, 4).rotateY(Math.PI / 4).translate(pier.x, pier.height + pier.width * 1.7, face + pier.depth * 0.35), materials.dressedStone);
    addSolidProxy(
      context, `front-pier-${pier.x}`,
      { x: pier.x - pier.width / 2, y: 0, z: face }, { x: pier.x + pier.width / 2, y: 6, z: face + pier.depth },
      'concrete', 'none',
    );
  }

  // Gable between the turrets, string courses and a blind arcade above the doors' level.
  const gable = new THREE.Shape();
  gable.moveTo(-5.2, FRONT_TOP - 0.02);
  gable.lineTo(5.2, FRONT_TOP - 0.02);
  gable.lineTo(0, FRONT_TOP + 4.6);
  gable.closePath();
  batch.add(wallShapeGeometry(gable, 'pz', 0, face, materials.wallStone.userData.metersPerTile as number), materials.wallStone);
  batch.addBox(materials.dressedStone, 0, FRONT_TOP + 4.9, face + 0.05, 0.16, 1.1, 0.16);
  batch.addBox(materials.dressedStone, 0, FRONT_TOP + 5.1, face + 0.05, 0.6, 0.16, 0.16);
  const outerWidth = NAVE.maxX - NAVE.minX + DIE_KATHEDRALE_WALL_THICKNESS * 2;
  for (const y of [7.4, 11.2, FRONT_TOP - 0.1]) batch.addBox(materials.dressedStone, 0, y, face + 0.07, outerWidth, 0.22, 0.14, 0, 0, 0, y);
  for (const side of [-1, 1]) {
    for (let niche = 0; niche < 4; niche++) {
      const blind = lancetShape(0.8, 8, 9.8, 10.6, 6);
      batch.add(wallShapeGeometry(blind, 'pz', side * (4.9 + niche * 1.3), face + 0.015, materials.roughStone.userData.metersPerTile as number), materials.roughStone);
    }
    // Corner towers beyond the plaza walls close the front's outline against the sky.
    const towerX = side * (NAVE.maxX + DIE_KATHEDRALE_WALL_THICKNESS + 1.1);
    batch.addBox(materials.wallStone, towerX, 12.5, face + 0.9, 2.2, 25, 2.2, 0, 0, 0, side + 9);
    batch.add(new THREE.ConeGeometry(1.5, 5, 8).translate(towerX, 27.5, face + 0.9), materials.dressedStone);
    // Iron lantern on a bracket either side of the doors.
    batch.addBox(materials.iron, side * 4.7, 3.75, face + 0.4, 0.04, 0.04, 0.8);
    batch.addBox(materials.iron, side * 4.7, 3.55, face + 0.78, 0.03, 0.4, 0.03);
    batch.addBox(materials.flame, side * 4.7, 3.2, face + 0.78, 0.2, 0.3, 0.2);
    batch.add(new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4).translate(side * 4.7, 3.43, face + 0.78), materials.iron);
  }
}

/** Lamp posts, palms in stone planters and benches along the parapet: all solid. */
function addStreetFurniture(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  for (const lamp of PLAZA_LAMP_POSTS) {
    batch.add(new THREE.CylinderGeometry(0.05, 0.08, LAMP_HEIGHT, 6).translate(lamp.x, LAMP_HEIGHT / 2, lamp.z), materials.iron);
    batch.add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 6).translate(lamp.x, 0.15, lamp.z), materials.iron);
    batch.addBox(materials.flame, lamp.x, LAMP_HEIGHT + 0.2, lamp.z, 0.26, 0.36, 0.26);
    batch.add(new THREE.ConeGeometry(0.28, 0.2, 4).rotateY(Math.PI / 4).translate(lamp.x, LAMP_HEIGHT + 0.48, lamp.z), materials.iron);
    addSolidProxy(context, `plaza-lamp-${lamp.x}`, { x: lamp.x - 0.15, y: 0, z: lamp.z - 0.15 }, { x: lamp.x + 0.15, y: LAMP_HEIGHT, z: lamp.z + 0.15 }, 'metal', 'none');
  }
  for (const planter of PLAZA_PLANTERS) {
    const { halfSize, height } = PLANTER;
    batch.addBox(materials.dressedStone, planter.x, height / 2, planter.z, halfSize * 2, height, halfSize * 2, 0, 0, 0, planter.x);
    batch.add(new THREE.CylinderGeometry(0.16, 0.24, 4.4, 6).translate(planter.x, height + 2.2, planter.z), materials.darkWood);
    for (let frond = 0; frond < 9; frond++) {
      const yaw = frond / 9 * Math.PI * 2;
      const leaf = new THREE.PlaneGeometry(0.55, 2.6).translate(0, -1.3, 0).rotateX(-1.05 - (frond % 3) * 0.22).rotateY(yaw).translate(planter.x, height + 4.5, planter.z);
      batch.add(leaf, materials.foliage);
    }
    addSolidProxy(
      context, `plaza-planter-${planter.x}`,
      { x: planter.x - halfSize, y: 0, z: planter.z - halfSize }, { x: planter.x + halfSize, y: height, z: planter.z + halfSize },
      'concrete', 'top',
    );
  }
  for (const bench of PLAZA_BENCHES) {
    const { halfLength, halfDepth, height } = BENCH;
    batch.addBox(materials.dressedStone, bench.x, height - 0.07, bench.z, halfLength * 2, 0.14, halfDepth * 2, 0, 0, 0, bench.x);
    for (const end of [-1, 1]) batch.addBox(materials.dressedStone, bench.x + end * (halfLength - 0.2), (height - 0.14) / 2, bench.z, 0.24, height - 0.14, halfDepth * 2 - 0.1, 0, 0, 0, end);
    addSolidProxy(
      context, `plaza-bench-${bench.x}`,
      { x: bench.x - halfLength, y: 0, z: bench.z - halfDepth }, { x: bench.x + halfLength, y: height, z: bench.z + halfDepth },
      'concrete', 'top',
    );
  }
}
