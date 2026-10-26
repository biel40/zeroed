import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from '../shared/ProceduralNoise';
import { MANSION_EAST_WALL_X, MANSION_WALL_THICKNESS } from '../BurnedMansionConfig';
import type { MansionBuildContext } from './MansionBuildContext';

/**
 * Grounds seen through the windows: a dead lawn up to the walls, leafless
 * trees, the family plot and a wrought-iron fence fading into the smoke.
 * Nothing here is solid, and trees and graves keep clear of the zombie
 * approach lanes (straight in from the spawns to each window).
 */

const HALF_WALL = MANSION_WALL_THICKNESS / 2;
/** Outer faces of the walls: the lawn stops here so the stairwell stays open. */
const FOOTPRINT = { minX: -7.15 - HALF_WALL, maxX: MANSION_EAST_WALL_X + HALF_WALL, minZ: -8.15 - HALF_WALL, maxZ: 10.15 + HALF_WALL } as const;
const GROUNDS_HALF_EXTENT = 46;
const LAWN_TOP_Y = -0.006;
const FENCE = { halfX: 25, halfZ: 28, height: 1.75, picketSpacing: 0.32, postSpacing: 3 } as const;
/** x, z, height, seed: outside the navigation bounds or far from every lane. */
const DEAD_TREES: ReadonlyArray<readonly [number, number, number, number]> = [
  [-19, -6, 6.5, 1], [-21, 9, 7.2, 2], [-17, 16, 5.8, 3], [-8, 21, 6.8, 4], [6, 22, 7.5, 5],
  [17, 15, 6.2, 6], [21, 3, 7.0, 7], [19, -11, 6.0, 8], [8, -21, 6.6, 9], [-9.5, -21, 5.6, 10],
  [-15, -16, 6.9, 11], [14, -18, 5.9, 12], [-23, -18, 7.8, 13], [22, 20, 6.4, 14],
];
/** Family plot north-west of the house: x, z, yaw, lean. */
const GRAVES: ReadonlyArray<readonly [number, number, number, number]> = [
  [-12.4, -11.6, 0.1, 0.05], [-11.2, -12.1, -0.05, -0.12], [-13.6, -12.4, 0.2, 0.18], [-12.0, -13.6, 0.05, 0], [-13.3, -14.0, -0.15, -0.08],
];

export function buildMansionExterior(context: MansionBuildContext): void {
  addLawn(context);
  for (const [x, z, height, seed] of DEAD_TREES) addDeadTree(context, x, z, height, seed);
  addFamilyPlot(context);
  addIronFence(context);
}

function addLawn(context: MansionBuildContext): void {
  const { lawn } = context.materials;
  const far = GROUNDS_HALF_EXTENT;
  const strips: ReadonlyArray<readonly [number, number, number, number]> = [
    [-far, FOOTPRINT.minX, -far, far],
    [FOOTPRINT.maxX, far, -far, far],
    [FOOTPRINT.minX, FOOTPRINT.maxX, -far, FOOTPRINT.minZ],
    [FOOTPRINT.minX, FOOTPRINT.maxX, FOOTPRINT.maxZ, far],
  ];
  for (const [minX, maxX, minZ, maxZ] of strips) {
    context.batch.addWorldBox(lawn, (minX + maxX) / 2, LAWN_TOP_Y - 0.01, (minZ + maxZ) / 2, maxX - minX, 0.02, maxZ - minZ);
  }
}

/** Cylinder from `start` along `direction`, tapering, with bark tiled by its real size. */
function limb(start: THREE.Vector3, direction: THREE.Vector3, length: number, baseRadius: number, tipRadius: number, tile: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, length, 7, 1);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const around = Math.PI * 2 * baseRadius / tile;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) * around, uv.getY(index) * length / tile);
  geometry.translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
  geometry.translate(start.x, start.y, start.z);
  return geometry;
}

function addDeadTree(context: MansionBuildContext, x: number, z: number, height: number, seed: number): void {
  const { batch, materials } = context;
  const tile = materials.bark.userData.metersPerTile as number;
  const random = seededRandom(5400 + seed);
  const lean = new THREE.Vector3((random() - 0.5) * 0.25, 1, (random() - 0.5) * 0.25).normalize();
  const base = new THREE.Vector3(x, LAWN_TOP_Y - 0.1, z);
  const trunkRadius = 0.2 + random() * 0.1;
  batch.add(limb(base, lean, height, trunkRadius, 0.05, tile), materials.bark);
  const branches = 5 + Math.floor(random() * 3);
  for (let index = 0; index < branches; index++) {
    const along = 0.4 + (index / branches) * 0.5 + random() * 0.05;
    const start = base.clone().addScaledVector(lean, height * along);
    const yaw = random() * Math.PI * 2;
    const pitch = 0.5 + random() * 0.6;
    const direction = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const length = (1 - along) * height * (0.55 + random() * 0.35);
    const radius = trunkRadius * (1 - along) * 0.7;
    batch.add(limb(start, direction, length, radius, 0.015, tile), materials.bark);
    // One crooked twig off the outer half of each branch.
    const twigStart = start.clone().addScaledVector(direction, length * (0.5 + random() * 0.3));
    const twigDirection = direction.clone().add(new THREE.Vector3(random() - 0.5, 0.4, random() - 0.5)).normalize();
    batch.add(limb(twigStart, twigDirection, length * 0.45, radius * 0.45, 0.008, tile), materials.bark);
  }
}

function addFamilyPlot(context: MansionBuildContext): void {
  const { batch, materials } = context;
  GRAVES.forEach(([x, z, yaw, lean], index) => {
    const placement = new THREE.Matrix4().compose(
      new THREE.Vector3(x, LAWN_TOP_Y - 0.08, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    if (index === 3) {
      // A stone cross over the oldest grave.
      batch.add(new THREE.BoxGeometry(0.16, 1.1, 0.14).translate(0, 0.55, 0), materials.gravestone, placement.clone());
      batch.add(new THREE.BoxGeometry(0.6, 0.15, 0.14).translate(0, 0.82, 0), materials.gravestone, placement.clone());
      return;
    }
    const width = 0.5 + (index % 2) * 0.1;
    const tall = 0.6 + (index % 3) * 0.12;
    batch.add(new THREE.BoxGeometry(width, tall, 0.12).translate(0, tall / 2, 0), materials.gravestone, placement.clone());
    batch.add(new THREE.CylinderGeometry(width / 2, width / 2, 0.12, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, tall, 0), materials.gravestone, placement.clone());
    batch.add(new THREE.BoxGeometry(width + 0.16, 0.08, 0.3).translate(0, 0.04, 0), materials.gravestone, placement);
  });
}

/**
 * Wrought-iron perimeter: posts and rails go to the static batch, the
 * hundreds of spear-topped pickets are one instanced mesh. A few pickets
 * lean or are missing.
 */
function addIronFence(context: MansionBuildContext): void {
  const { batch, materials, group } = context;
  const { halfX, halfZ, height } = FENCE;
  const sides: ReadonlyArray<readonly [number, number, number, number]> = [
    [-halfX, -halfZ, halfX, -halfZ],
    [halfX, -halfZ, halfX, halfZ],
    [halfX, halfZ, -halfX, halfZ],
    [-halfX, halfZ, -halfX, -halfZ],
  ];
  const random = seededRandom(5501);
  const picketMatrices: THREE.Matrix4[] = [];
  for (const [fromX, fromZ, toX, toZ] of sides) {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const yaw = Math.atan2(toX - fromX, toZ - fromZ);
    for (const railY of [0.25, height - 0.2]) {
      batch.addBox(materials.wroughtIron, (fromX + toX) / 2, railY, (fromZ + toZ) / 2, 0.04, 0.04, length, 0, yaw, 0);
    }
    for (let along = 0; along < length; along += FENCE.postSpacing) {
      const t = along / length;
      const x = THREE.MathUtils.lerp(fromX, toX, t);
      const z = THREE.MathUtils.lerp(fromZ, toZ, t);
      batch.addBox(materials.wroughtIron, x, (height + 0.15) / 2, z, 0.1, height + 0.15, 0.1);
      const finial = new THREE.SphereGeometry(0.07, 8, 6);
      finial.translate(x, height + 0.15, z);
      batch.add(finial, materials.wroughtIron);
    }
    for (let along = FENCE.picketSpacing; along < length; along += FENCE.picketSpacing) {
      if (random() < 0.05) continue;
      const t = along / length;
      const tilt = random() < 0.08 ? (random() - 0.5) * 0.5 : 0;
      picketMatrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(THREE.MathUtils.lerp(fromX, toX, t), 0, THREE.MathUtils.lerp(fromZ, toZ, t)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1),
      ));
    }
  }
  const shaft = new THREE.BoxGeometry(0.022, height, 0.022).translate(0, height / 2, 0);
  const spear = new THREE.ConeGeometry(0.03, 0.12, 4).translate(0, height + 0.06, 0);
  const picket = mergeGeometries([shaft.toNonIndexed(), spear.toNonIndexed()]);
  if (!picket) throw new Error('Unable to merge fence picket geometry');
  const pickets = new THREE.InstancedMesh(picket, materials.wroughtIron, picketMatrices.length);
  picketMatrices.forEach((matrix, index) => pickets.setMatrixAt(index, matrix));
  pickets.computeBoundingSphere();
  pickets.computeBoundingBox();
  pickets.name = 'mansion-fence-pickets';
  pickets.userData.mapRole = 'exterior-fence';
  group.add(pickets);
}
