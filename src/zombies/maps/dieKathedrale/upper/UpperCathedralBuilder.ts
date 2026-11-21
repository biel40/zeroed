import * as THREE from 'three';
import type { WallOpening } from '../../shared/ArenaStructure';
import { addSolidProxy } from '../../shared/SolidProxy';
import { DIE_KATHEDRALE_UPPER_WALL_CUTS, DIE_KATHEDRALE_WALL_THICKNESS, NAVE } from '../../DieKathedraleConfig';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addStoneWall } from '../DieKathedraleWalls';
import { archPoints, ribGeometries } from '../GothicVault';
import { buildBellStair } from './BellStairGeometry';
import { BELL_CHAMBER, BELL_LIP_Y, BELL_STAIR, DOUBLE_TAP_SITE, MAIN_BELL_POSITION, ROOF_CHAMBER_OPENING, ROOF_NAVE_OPENING, ROOF_TERRACES, UPPER_ENTRANCES, UPPER_FLOOR_Y } from './UpperCathedralConfig';

const HALF_WALL = DIE_KATHEDRALE_WALL_THICKNESS / 2;
const CHAMBER_HEIGHT = 8.45;
const STAIR_OPENING = { center: BELL_STAIR.centerX, width: 2.85, bottom: 0, top: 3.25 } as const;
const BELL_LOUVERS: readonly WallOpening[] = [-23.35, -20, -16.65].map((center) => ({ center, width: 1.8, bottom: 1.2, top: 5.75 }));

export function buildUpperCathedral(tower: DieKathedraleBuildContext, terraces = tower): void {
  buildBellStair(tower);
  buildBellChamber(tower);
  buildRoofTerraces(terraces);
}

function buildBellChamber(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure } = context;
  const { minX, maxX, minZ, maxZ } = BELL_CHAMBER;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  // The square lower tower carries the bell-room floor; its return is attached to the west aisle.
  structure.addBox(x, UPPER_FLOOR_Y / 2, z, width + 0.3, UPPER_FLOOR_Y, depth, materials.wallStone, {
    name: 'bell-tower-foundation', surface: 'concrete', mapRole: 'wall', castShadow: false, uvSeed: 5, worldUVs: true, blocksPlayer: true,
  });
  structure.addBox(x, UPPER_FLOOR_Y - 0.1, z, width + 0.3, 0.2, depth + 0.36, materials.floorStone, {
    name: 'bell-chamber-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 5, worldUVs: true, blocksPlayer: false,
  });
  const wall = { baseY: UPPER_FLOOR_Y, height: CHAMBER_HEIGHT, cuts: DIE_KATHEDRALE_UPPER_WALL_CUTS };
  addStoneWall(context, 'bell-chamber-north', { ...wall, axis: 'x', fixed: minZ - HALF_WALL, min: minX - 0.3, max: maxX + 0.3, extraOpenings: BELL_LOUVERS });
  addStoneWall(context, 'bell-chamber-south', { ...wall, axis: 'x', fixed: maxZ + HALF_WALL, min: minX - 0.3, max: maxX + 0.3, extraOpenings: [STAIR_OPENING] });
  addStoneWall(context, 'bell-chamber-west', { ...wall, axis: 'z', fixed: minX - HALF_WALL, min: minZ, max: maxZ });
  addStoneWall(context, 'bell-chamber-east', { ...wall, axis: 'z', fixed: maxX + HALF_WALL, min: minZ, max: maxZ, extraOpenings: [ROOF_CHAMBER_OPENING] });

  // Deep louvres with iron guards retain the view through the north wall.
  for (const opening of BELL_LOUVERS) {
    const face = minZ + 0.08;
    const springY = UPPER_FLOOR_Y + opening.top - 0.7;
    addPointedArch(context, opening.center, face, opening.width, springY, 0.72);
    for (let bar = -2; bar <= 2; bar++) {
      batch.addBox(materials.iron, opening.center + bar * 0.27, UPPER_FLOOR_Y + 1.91, face, 0.045, 1.52, 0.045);
    }
    for (const y of [1.2, 2.62]) batch.addBox(materials.iron, opening.center, UPPER_FLOOR_Y + y, face, opening.width, 0.09, 0.12);
    addSolidProxy(context, `bell-louvre-guard-${opening.center}`, { x: opening.center - 0.9, y: UPPER_FLOOR_Y + 1.2, z: face - 0.08 },
      { x: opening.center + 0.9, y: UPPER_FLOOR_Y + 2.7, z: face + 0.08 }, 'metal', 'none');
  }

  const roofY = UPPER_FLOOR_Y + CHAMBER_HEIGHT;
  batch.addBox(materials.dressedStone, x, roofY - 0.22, z, width + 0.8, 0.54, depth + 0.8);
  batch.addBox(materials.floorStone, x, roofY + 0.1, z, width + 0.65, 0.21, depth + 0.66);
  for (const side of [-1, 1]) {
    batch.addBox(materials.dressedStone, x + side * (width / 2 + 0.27), roofY + 0.64, z, 0.32, 1.08, depth + 0.68);
    batch.addBox(materials.dressedStone, x, roofY + 0.64, z + side * (depth / 2 + 0.27), width + 0.68, 1.08, 0.32);
    for (const sideZ of [-1, 1]) addPinnacle(context, x + side * width / 2, roofY + 0.2, z + sideZ * depth / 2, 1.4);
  }
  addBell(context, MAIN_BELL_POSITION.x, MAIN_BELL_POSITION.z, 1.25);
  addBell(context, -17.45, -52.25, 1.01);
  addBellRoomDressing(context);
}

function addBell(context: DieKathedraleBuildContext, x: number, z: number, scale: number): void {
  const { batch, materials } = context;
  const lipY = BELL_LIP_Y;
  const profile = [
    [0.82, -0.05], [1.03, -0.05], [1.08, 0.02], [1.00, 0.18], [0.80, 0.35],
    [0.72, 0.70], [0.60, 1.04], [0.45, 1.22], [0.20, 1.36], [0.13, 1.31],
    [0.43, 1.04], [0.61, 0.73], [0.70, 0.36], [0.82, -0.05],
  ].map(([radius, height]) => new THREE.Vector2(radius * scale, height * scale));
  batch.add(new THREE.LatheGeometry(profile, 24).translate(x, lipY, z), materials.gilt);
  for (const [radius, y] of [[1.04, 0.01], [0.78, 0.43]]) {
    batch.add(new THREE.TorusGeometry(radius * scale, 0.037, 6, 24).rotateX(Math.PI / 2).translate(x, lipY + y * scale, z), materials.iron);
  }
  batch.add(new THREE.CylinderGeometry(0.04, 0.05, 1.16, 8).translate(x, lipY + 0.3, z), materials.iron);
  batch.add(new THREE.SphereGeometry(0.16, 8, 6).translate(x, lipY - 0.31, z), materials.iron);
  batch.addBox(materials.darkWood, x, lipY + 1.55 * scale, z, 3.1 * scale, 0.38, 0.37);
  for (const side of [-1, 1]) {
    const supportX = x + side * 1.38 * scale;
    batch.addBox(materials.darkWood, supportX, UPPER_FLOOR_Y + 6.45, z, 0.26, 3.4, 0.29);
    batch.addBox(materials.darkWood, supportX, UPPER_FLOOR_Y + 6.8, z, 0.23, 3.6, 0.25, side * 0.65);
  }
}

function addBellRoomDressing(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  for (const x of [-24, -20.5, -17]) batch.addBox(materials.darkWood, x, UPPER_FLOOR_Y + 7.7, -52.35, 0.36, 0.42, 5.05);
  // Abandoned repair bench and a low stack of sacks, clear of both spawn and stair approaches.
  batch.addBox(materials.darkWood, -24, UPPER_FLOOR_Y + 0.78, -50.32, 1.75, 0.15, 0.64);
  for (const x of [-24.65, -23.37]) batch.addBox(materials.darkWood, x, UPPER_FLOOR_Y + 0.38, -50.32, 0.2, 0.78, 0.58);
  addSolidProxy(context, 'bell-repair-bench', { x: -24.9, y: UPPER_FLOOR_Y, z: -50.68 }, { x: -23.1, y: UPPER_FLOOR_Y + 0.87, z: -49.94 }, 'wood');
  batch.add(new THREE.TorusGeometry(0.35, 0.026, 6, 16).rotateX(-Math.PI / 2).translate(-23.8, UPPER_FLOOR_Y + 0.88, -50.32), materials.shroud);
  batch.addBox(materials.darkWood, -24.1, UPPER_FLOOR_Y + 0.99, -50.22, 0.53, 0.06, 0.07, 0, 0.27);
  batch.addBox(materials.iron, -24.34, UPPER_FLOOR_Y + 0.99, -50.3, 0.12, 0.12, 0.19);
}

function buildRoofTerraces(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure } = context;
  const { minX, maxX, minZ, maxZ } = ROOF_TERRACES;
  const width = maxX - minX;
  const x = (minX + maxX) / 2;
  for (const [from, to] of [[minZ, -42], [-42, maxZ]]) {
    structure.addBox(x, UPPER_FLOOR_Y - 0.24, (from + to) / 2, width + 0.35, 0.48, to - from + 0.33, materials.floorStone, {
      name: `west-terrace-deck-${from}`, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: from, worldUVs: true, blocksPlayer: false,
    });
  }
  const parapet = { baseY: UPPER_FLOOR_Y, height: 1.32, cuts: DIE_KATHEDRALE_UPPER_WALL_CUTS };
  addStoneWall(context, 'west-terrace-outer-parapet', { ...parapet, axis: 'z', fixed: minX - HALF_WALL, min: BELL_CHAMBER.maxZ, max: maxZ, breaks: [-40] });
  addStoneWall(context, 'west-terrace-inner-parapet', { ...parapet, axis: 'z', fixed: maxX + HALF_WALL, min: minZ - 0.3, max: maxZ + 0.3, breaks: [-47, -36] });
  addStoneWall(context, 'west-terrace-north-parapet', { ...parapet, axis: 'x', fixed: minZ - HALF_WALL, min: minX - 0.12, max: maxX + 0.3 });
  addStoneWall(context, 'west-terrace-watch-loft-front', { ...parapet, height: 3.15, axis: 'x', fixed: UPPER_ENTRANCES[1].z, min: minX - 0.3, max: maxX + 0.3 });
  for (const z of [NAVE.minZ + 0.06, NAVE.minZ - DIE_KATHEDRALE_WALL_THICKNESS - 0.06]) {
    addPointedArch(context, ROOF_NAVE_OPENING.center, z, ROOF_NAVE_OPENING.width, UPPER_FLOOR_Y + 2.91, 1.09);
  }

  // Openly readable loop around the low stone cistern, with room for a zombie on either flank.
  batch.addBox(materials.dressedStone, x, UPPER_FLOOR_Y + 0.42, -40.8, 1.9, 0.84, 3.05);
  batch.addBox(materials.wallStone, x, UPPER_FLOOR_Y + 0.88, -40.8, 2.1, 0.18, 3.29);
  addSolidProxy(context, 'west-terrace-cistern', { x: x - 1.05, y: UPPER_FLOOR_Y, z: -42.44 }, { x: x + 1.05, y: UPPER_FLOOR_Y + 0.97, z: -39.15 }, 'concrete');
  batch.addBox(materials.iron, x, UPPER_FLOOR_Y + 1.02, -40.8, 0.65, 0.14, 0.87);
  for (const z of [-47.5, -42, -35]) {
    addPinnacle(context, minX + 0.09, UPPER_FLOOR_Y + 0.02, z, 1.34);
    addFlyingButtress(context, minX, maxX, z);
  }
  // Two masonry spurs carry the small stretch abutting the thicker crossing and bell tower.
  for (const [pierX, pierZ] of [[-13.57, -53.25], [-7.58, -53.25]]) {
    batch.addBox(materials.wallStone, pierX, UPPER_FLOOR_Y / 2, pierZ, 0.95, UPPER_FLOOR_Y, 0.93);
  }
  addRoofShrineSurround(context);
}

function addPinnacle(context: DieKathedraleBuildContext, x: number, y: number, z: number, height: number): void {
  const { batch, materials } = context;
  batch.addBox(materials.wallStone, x, y + height / 2, z, 0.5, height, 0.5);
  batch.addBox(materials.dressedStone, x, y + height - 0.07, z, 0.59, 0.16, 0.59);
  batch.add(new THREE.ConeGeometry(0.38, 0.87, 4).rotateY(Math.PI / 4).translate(x, y + height + 0.44, z), materials.dressedStone);
  batch.add(new THREE.SphereGeometry(0.095, 6, 4).translate(x, y + height + 0.93, z), materials.dressedStone);
}

function addFlyingButtress(context: DieKathedraleBuildContext, minX: number, maxX: number, z: number): void {
  const { batch, materials } = context;
  const lowX = minX + 0.06;
  const highX = maxX + 0.52;
  const points = Array.from({ length: 8 }, (_, index) => {
    const progress = index / 7;
    return new THREE.Vector3(THREE.MathUtils.lerp(lowX, highX, progress), UPPER_FLOOR_Y + 1.55 + 4.1 * Math.sqrt(progress), z);
  });
  for (const rib of ribGeometries(points, 0.56, 0.52)) batch.add(rib, materials.wallStone);
  for (const rib of ribGeometries(points.map((point) => point.clone().add(new THREE.Vector3(0, 0.32, 0))), 0.69, 0.13)) batch.add(rib, materials.dressedStone);
  batch.addBox(materials.wallStone, highX, UPPER_FLOOR_Y + 2.45, z, 0.75, 5.15, 0.84);
}

function addRoofShrineSurround(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { x, z } = DOUBLE_TAP_SITE;
  for (const side of [-1, 1]) {
    batch.addBox(materials.dressedStone, x + side * 0.86, UPPER_FLOOR_Y + 0.94, z + 0.42, 0.22, 1.88, 0.39);
  }
  // The recess's back wall meets the shrine's base.
  batch.addBox(materials.wallStone, x, UPPER_FLOOR_Y + 0.94, z + 0.56, 1.8, 1.88, 0.23);
  addPointedArch(context, x, z + 0.42, 1.72, UPPER_FLOOR_Y + 1.88, 0.65);
  addSolidProxy(context, 'west-terrace-ring-recess', { x: x - 0.97, y: UPPER_FLOOR_Y, z: z + 0.43 },
    { x: x + 0.97, y: UPPER_FLOOR_Y + 1.89, z: z + 0.7 }, 'concrete', 'none');
}

function addPointedArch(context: DieKathedraleBuildContext, x: number, z: number, width: number, springY: number, rise: number): void {
  const rib = archPoints(x - width / 2, z, x + width / 2, z, springY, rise, 6);
  for (const geometry of ribGeometries(rib, 0.19, 0.18)) context.batch.add(geometry, context.materials.dressedStone);
}
