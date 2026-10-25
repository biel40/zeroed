import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import {
  COCHERAS,
  COCHERAS_TRACKS,
  COCHERAS_TRAIN_CARS,
  CONSIGNA_LOCKER,
  STATION33_BARRIERS,
  STATION33_RING_LOCKERS,
  TRAIN_CAR,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall, wallHeight } = COCHERAS;

/**
 * Story and wear of the train sheds, all non-solid (their lamps and beacon
 * belong to the lighting): contact-rail warnings, the luggage
 * the evacuees dropped at the open train door, leaflets, blood, seepage
 * down the iron rings and ballast torn up by the derailed car. Litter
 * stays flat and away from the entrances.
 */
export function buildCocherasDressing(context: Station33BuildContext): void {
  addWarnings(context);
  addDepotPlates(context);
  addAbandonedBoarding(context);
  addDerailment(context);
  addLooseLitter(context);
  addDecals(context);
}

/** Contact-rail warnings on the east wall, beside the track that still carries one. */
function addWarnings(context: Station33BuildContext): void {
  const { batch, signage } = context;
  for (const z of [-8.6, -21.4]) {
    const plate = signage.signGeometry('third-rail', 0.6, 0.3).rotateY(-Math.PI / 2).translate(hall.maxX - 0.012, 1.7, z);
    batch.add(plate, signage.material);
  }
}

/** "Depot" plate on the wall above each ring locker of the crews' bank. */
function addDepotPlates(context: Station33BuildContext): void {
  const { batch, signage } = context;
  const back = CONSIGNA_LOCKER.depth - 0.012;
  for (const locker of STATION33_RING_LOCKERS.filter((candidate) => candidate.zone === 'cocheras')) {
    const plate = signage.signGeometry('depot', 0.4, 0.4).rotateY(Math.atan2(locker.facingX, locker.facingZ));
    plate.translate(locker.x - locker.facingX * back, CONSIGNA_LOCKER.height + 0.4, locker.z - locker.facingZ * back);
    batch.add(plate, signage.material);
  }
}

/**
 * At the lead car's open door: suitcases dropped on the floor and on the
 * car's threshold, a burst holdall and a trail of claim tickets.
 */
function addAbandonedBoarding(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const car = COCHERAS_TRAIN_CARS.find((candidate) => candidate.id === 'west-lead')!;
  const doorZ = (car.minZ + car.maxZ) / 2;
  const sideX = car.x + car.openSide * TRAIN_CAR.width / 2;
  const cases: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [sideX + 0.7, doorZ + 0.4, 0.5, 0.62, 0.42, 0.2],
    [sideX + 1.4, doorZ - 0.6, 1.9, 0.55, 0.38, 0.18],
    [sideX + 0.9, doorZ - 1.5, -0.3, 0.7, 0.45, 0.22],
    [sideX + 2.6, doorZ + 1.6, 1.2, 0.6, 0.4, 0.2],
  ];
  cases.forEach(([x, z, yaw, width, depth, height], index) => {
    batch.addBox(materials.luggage[index % materials.luggage.length], x, height / 2, z, width, height, depth, 0, yaw, 0);
    batch.addBox(materials.bronze, x, height + 0.01, z, 0.16, 0.02, 0.04, 0, yaw, 0);
  });
  // One suitcase never made it off the car's floor.
  batch.addBox(materials.luggage[3], sideX - 0.25, TRAIN_CAR.floorY + 0.12, doorZ + 0.2, 0.42, 0.24, 0.62, 0, 0.2, 0);
  const holdall = new THREE.SphereGeometry(0.24, 10, 6).scale(1.4, 0.5, 0.8).rotateY(0.4).translate(sideX + 1.9, 0.11, doorZ + 0.7);
  batch.add(holdall, materials.luggage[0]);
  const random = seededRandom(3463);
  for (let index = 0; index < 9; index++) {
    const ticket = new THREE.PlaneGeometry(0.1, 0.16).rotateX(-Math.PI / 2).rotateY(random() * Math.PI * 2);
    ticket.translate(sideX + 0.4 + index * 0.35 + random() * 0.2, 0.005 + index * 0.0002, doorZ + (random() - 0.5) * 1.6);
    batch.add(ticket, materials.paper);
  }
}

/** Ballast and a sleeper torn up where the east car left the rails, and a snapped rail end. */
function addDerailment(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const car = COCHERAS_TRAIN_CARS.find((candidate) => candidate.id === 'east-derailed')!;
  const random = seededRandom(3467);
  for (let index = 0; index < 14; index++) {
    const size = 0.12 + random() * 0.18;
    batch.addBox(
      materials.rubble,
      car.x + 1.6 + random() * 0.9,
      size * 0.3,
      car.maxZ + 0.2 - random() * 2.4,
      size, size * 0.6, size,
      random() * Math.PI, random() * Math.PI, random() * Math.PI,
    );
  }
  batch.addBox(materials.serviceConcrete, car.x + 1.9, 0.06, car.maxZ - 0.9, 2.3, 0.05, 0.24, 0.15, 0.6, 0.1);
  batch.addBox(materials.railSteel, car.x + COCHERAS_TRACKS.gauge / 2 + 0.3, 0.12, car.maxZ + 0.6, 0.07, 0.12, 1.3, 0.2, 0.35, 0);
}

/** Leaflets and evacuation notices underfoot between the tracks and on the apron. */
function addLooseLitter(context: Station33BuildContext): void {
  const random = seededRandom(3469);
  const area = { minX: 7.8, maxX: 13.2, minZ: hall.minZ + 1.5, maxZ: hall.maxZ - 1 };
  for (let index = 0; index < 24; index++) {
    const sheet = new THREE.PlaneGeometry(0.14 + random() * 0.12, 0.2 + random() * 0.1);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(
      THREE.MathUtils.lerp(area.minX, area.maxX, random()),
      0.004 + index * 0.0002,
      THREE.MathUtils.lerp(area.minZ, area.maxZ, random()),
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
  const lead = COCHERAS_TRAIN_CARS.find((candidate) => candidate.id === 'west-lead')!;
  const leadSide = lead.x + TRAIN_CAR.width / 2 + 0.012;
  const doorZ = (lead.minZ + lead.maxZ) / 2;
  addDecal(context, materials.bloodSmear, leadSide, 1.6, doorZ - 1.2, 1.1, 0.9, Math.PI / 2);
  addDecal(context, materials.bloodSmear, leadSide + 1.4, 0.006, doorZ - 0.4, 1.8, 1.0, 'floor');
  const gate = STATION33_BARRIERS.find((barrier) => barrier.id === 'cocheras-blast-gate')!;
  addDecal(context, materials.bloodSplatter, gate.x - 0.6, 0.007, hall.minZ + 1.6, 1.2, 1.0, 'floor');
  const door = STATION33_BARRIERS.find((barrier) => barrier.id === 'cocheras-substation-door')!;
  // In front of the wainscot, which stands 3 cm off the wall.
  addDecal(context, materials.bloodSmear, hall.maxX - 0.036, 1.25, door.z - 1.4, 1.1, 1.0, -Math.PI / 2);
  const streakY = wallHeight - 0.9;
  for (const z of [-4.2, -12.6, -19.8, -24.8]) addDecal(context, materials.waterStreak, hall.maxX - 0.03, streakY, z, 1.2, 1.6, -Math.PI / 2);
  for (const x of [10.4, 19.6]) addDecal(context, materials.waterStreak, x, streakY, hall.minZ + 0.03, 1.2, 1.6, 0);
  const random = seededRandom(3471);
  for (let index = 0; index < 10; index++) {
    const size = 1.2 + random() * 1.6;
    addDecal(
      context, materials.floorGrime,
      THREE.MathUtils.lerp(hall.minX + 3.5, hall.maxX - 1, random()),
      0.003 + index * 0.0003,
      THREE.MathUtils.lerp(hall.minZ + 1, hall.maxZ - 1, random()),
      size, size * (0.6 + random() * 0.4), 'floor',
    );
  }
}
