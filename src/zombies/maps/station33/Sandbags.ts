import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import type { Station33BuildContext } from './Station33BuildContext';

/** Filled sack size; `pitch` is the rise per course once the sacks settle into each other. */
const SACK = { length: 0.6, depth: 0.36, height: 0.18, pitch: 0.14 } as const;
/** How far the flattened belly hangs below the sack centre, as a fraction of its upper half. */
const SACK_BELLY = 0.6;

/** A sandbag wall along x, centred on (`x`, `z`) and standing on `y` (the floor, 0 by default). */
export interface SandbagWall {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly length: number;
  readonly courses: number;
}

/** Height of a wall of `courses` courses, from its floor to the top sack. */
export function sandbagWallHeight(courses: number): number {
  return (courses - 1) * SACK.pitch + SACK.height;
}

/** Depth of a sandbag wall across its length. */
export const SANDBAG_WALL_DEPTH = SACK.depth;

/**
 * Courses of burlap sacks in running bond, each pressed into the one below,
 * with a split sack slumped at the foot of the wall; `seed` varies the
 * sacks and one solid proxy named `name` stops bullets, zombies and players.
 */
export function addSandbagWall(context: Station33BuildContext, wall: SandbagWall, seed: number, name: string): void {
  const { batch, materials } = context;
  const { x, z, length, courses } = wall;
  const y = wall.y ?? 0;
  const { length: sackLength, depth, height, pitch } = SACK;
  const random = seededRandom(seed);
  const weaveTile = materials.burlap.userData.metersPerTile as number;
  for (let course = 0; course < courses; course++) {
    const count = Math.floor(length / sackLength) - (course % 2);
    const start = x - ((count - 1) * sackLength) / 2;
    for (let index = 0; index < count; index++) {
      const bag = sackGeometry(random, sackLength, height, depth, weaveTile);
      bag.rotateZ((random() - 0.5) * 0.06);
      bag.rotateY((random() - 0.5) * 0.14);
      bag.translate(start + index * sackLength + (random() - 0.5) * 0.04, y + course * pitch, z + (random() - 0.5) * 0.05);
      batch.add(bag, materials.burlap);
    }
  }
  const slumped = sackGeometry(random, sackLength * 1.05, height * 0.55, depth * 1.2, weaveTile);
  slumped.rotateY(0.5).translate(x + length / 2 + 0.25, y, z + 0.3);
  batch.add(slumped, materials.burlap);
  addSolidProxy(context, name,
    { x: x - length / 2, y, z: z - depth / 2 }, { x: x + length / 2, y: y + sandbagWallHeight(courses), z: z + depth / 2 }, 'concrete', 'none');
}

/**
 * One filled sack resting on y = 0, long along x: a rounded-box body with a
 * flat belly, ends pinched where the sack is folded and tied, and a few
 * lumps on top. Built from a sphere so the surface stays smooth; its seam
 * runs along the hidden belly and its UVs wrap the weave around the sack.
 */
function sackGeometry(random: () => number, length: number, height: number, depth: number, weaveTile: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 20, 12).rotateZ(Math.PI / 2);
  const position = geometry.getAttribute('position');
  const lumpPhaseX = random() * Math.PI * 2;
  const lumpPhaseZ = random() * Math.PI * 2;
  for (let index = 0; index < position.count; index++) {
    const along = squarish(position.getX(index), 0.6);
    let up = squarish(position.getY(index), 0.5);
    let across = squarish(position.getZ(index), 0.45);
    const tie = THREE.MathUtils.smoothstep(Math.abs(along), 0.7, 1);
    up *= (1 - tie * 0.45) * (up < 0 ? SACK_BELLY : 1 + Math.sin(along * 7 + lumpPhaseX) * Math.sin(across * 5 + lumpPhaseZ) * 0.08);
    across *= 1 - tie * 0.3;
    position.setXYZ(index, (along * length) / 2, ((up + SACK_BELLY) / (1 + SACK_BELLY)) * height, (across * depth) / 2);
  }
  const uv = geometry.getAttribute('uv');
  const girth = 2 * (height + depth);
  const weaveOffset = random();
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, (uv.getX(index) * girth) / weaveTile + weaveOffset, (uv.getY(index) * length) / weaveTile + weaveOffset);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Pushes a unit-sphere coordinate towards the box face, keeping its sign. */
function squarish(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}
