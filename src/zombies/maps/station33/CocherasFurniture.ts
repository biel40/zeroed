import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { addLockerBank, ringLockersOn, WallFrame } from '../shared/LockerBank';
import { addSolidProxy } from '../shared/SolidProxy';
import { COCHERAS, COCHERAS_CREW_LOCKERS, CONSIGNA_LOCKER, station33RingLockersIn } from '../Station33Config';
import { station33LockerLook } from './Station33Machines';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall } = COCHERAS;
/** Timber cable drum standing on its rims, axle across the hall. */
const CABLE_DRUM = { x: 10.2, z: -22.6, radius: 0.75, width: 0.9 } as const;
/** Civil-defence sandbag wall left facing the trains, between the apron and the tracks. */
const SANDBAGS = { x: 10.6, z: -10.2, length: 2.4, courses: 4 } as const;
/** Filled sack size; `pitch` is the rise per course once the sacks settle into each other. */
const SACK = { length: 0.6, depth: 0.36, height: 0.18, pitch: 0.14 } as const;
/** How far the flattened belly hangs below the sack centre, as a fraction of its upper half. */
const SACK_BELLY = 0.6;
/** Grey electrical cabinet against the east wall. */
const CABINET = { z: -13.4, width: 0.9, depth: 0.45, height: 1.8 } as const;
/** First number tag of the crew lockers: their own bank letter, after the luggage office's. */
const CREW_LOCKER_FIRST_TAG = 48;

/**
 * Solid props of the train sheds. Visuals go to the shared batch; each
 * piece gets one invisible AABB proxy that stops bullets, zombies and the
 * player, like the furniture of the other rooms. They leave the lanes
 * between the trains at least two metres wide.
 */
export function buildCocherasFurniture(context: Station33BuildContext): void {
  addCableDrum(context);
  addSandbags(context);
  addCabinet(context);
  addCrewLockers(context);
}

/**
 * The train crews' lockers on the apron wall, with the Sleight of Hand
 * ring locker in the middle (the arena builds that one). Tags number on
 * after the luggage office's.
 */
function addCrewLockers(context: Station33BuildContext): void {
  const frame = new WallFrame('x', hall.maxZ, -1);
  addLockerBank(context, station33LockerLook(context), {
    frame,
    from: COCHERAS_CREW_LOCKERS.minX,
    to: COCHERAS_CREW_LOCKERS.maxX,
    ajar: [4],
    ringLockers: ringLockersOn(frame, station33RingLockersIn('cocheras'), CONSIGNA_LOCKER.depth),
  }, CREW_LOCKER_FIRST_TAG);
}

/** Two timber rims, a core wound with cable and a loose end trailing on the floor. */
function addCableDrum(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, radius, width } = CABLE_DRUM;
  for (const side of [-1, 1]) {
    const rim = new THREE.CylinderGeometry(radius, radius, 0.08, 20).rotateZ(Math.PI / 2).translate(x + side * (width / 2 - 0.04), radius, z);
    batch.add(rim, materials.varnishedWood);
  }
  const core = new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, width - 0.16, 18).rotateZ(Math.PI / 2).translate(x, radius, z);
  batch.add(core, materials.rubber);
  const tail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, radius * 0.3, z + radius * 0.6),
    new THREE.Vector3(x + 0.3, 0.03, z + 1.3),
    new THREE.Vector3(x + 1.1, 0.03, z + 1.8),
    new THREE.Vector3(x + 1.6, 0.03, z + 1.5),
  ]);
  batch.add(new THREE.TubeGeometry(tail, 16, 0.03, 5), materials.rubber);
  addSolidProxy(context, 'cable-drum', { x: x - width / 2, y: 0, z: z - radius }, { x: x + width / 2, y: radius * 2, z: z + radius }, 'wood', 'none');
}

/**
 * Courses of burlap sacks in running bond, each pressed into the one below,
 * with a split sack slumped at the foot of the wall.
 */
function addSandbags(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, length, courses } = SANDBAGS;
  const { length: sackLength, depth, height, pitch } = SACK;
  const random = seededRandom(3461);
  const weaveTile = materials.burlap.userData.metersPerTile as number;
  for (let course = 0; course < courses; course++) {
    const count = Math.floor(length / sackLength) - (course % 2);
    const start = x - ((count - 1) * sackLength) / 2;
    for (let index = 0; index < count; index++) {
      const bag = sackGeometry(random, sackLength, height, depth, weaveTile);
      bag.rotateZ((random() - 0.5) * 0.06);
      bag.rotateY((random() - 0.5) * 0.14);
      bag.translate(start + index * sackLength + (random() - 0.5) * 0.04, course * pitch, z + (random() - 0.5) * 0.05);
      batch.add(bag, materials.burlap);
    }
  }
  const slumped = sackGeometry(random, sackLength * 1.05, height * 0.55, depth * 1.2, weaveTile);
  slumped.rotateY(0.5).translate(x + length / 2 + 0.25, 0, z + 0.3);
  batch.add(slumped, materials.burlap);
  const top = (courses - 1) * pitch + height;
  addSolidProxy(context, 'sandbags', { x: x - length / 2, y: 0, z: z - depth / 2 }, { x: x + length / 2, y: top, z: z + depth / 2 }, 'concrete', 'none');
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

/** Switch cabinet with a hazard plate, its door hanging open on dead breakers. */
function addCabinet(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { z, width, depth, height } = CABINET;
  const back = hall.maxX;
  const x = back - depth / 2;
  batch.addBox(materials.greySteel, x, height / 2, z, depth, height, width);
  batch.addBox(materials.rubber, x - depth / 2 - 0.002, height * 0.55, z, 0.01, height * 0.7, width - 0.12);
  for (let row = 0; row < 4; row++) {
    batch.addBox(materials.paintedSteel, x - depth / 2 + 0.02, 0.8 + row * 0.22, z, 0.04, 0.08, width - 0.3);
  }
  const door = new THREE.BoxGeometry(0.03, height * 0.75, width - 0.06).translate(0, 0, (width - 0.06) / 2);
  door.rotateY(-1.9);
  door.translate(x - depth / 2, height * 0.55, z - width / 2 + 0.03);
  batch.add(door, materials.greySteel);
  batch.addBox(materials.hazardPaint, x - depth / 2 - 0.004, height - 0.15, z, 0.01, 0.12, width - 0.1);
  addSolidProxy(context, 'switch-cabinet', { x: back - depth, y: 0, z: z - width / 2 }, { x: back, y: height, z: z + width / 2 }, 'metal');
}
