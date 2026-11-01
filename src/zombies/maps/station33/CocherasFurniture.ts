import * as THREE from 'three';
import { addLockerBank, ringLockersOn, WallFrame } from '../shared/LockerBank';
import { addSolidProxy } from '../shared/SolidProxy';
import { COCHERAS, COCHERAS_CREW_LOCKERS, CONSIGNA_LOCKER, station33RingLockersIn } from '../Station33Config';
import { addSandbagWall } from './Sandbags';
import { station33LockerLook } from './Station33Machines';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall } = COCHERAS;
/** Timber cable drum standing on its rims, axle across the hall. */
const CABLE_DRUM = { x: 10.2, z: -22.6, radius: 0.75, width: 0.9 } as const;
/** Civil-defence sandbag wall left facing the trains, between the apron and the tracks. */
const SANDBAGS = { x: 10.6, z: -10.2, length: 2.4, courses: 4 } as const;
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
  addSandbagWall(context, SANDBAGS, 3461, 'sandbags');
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
