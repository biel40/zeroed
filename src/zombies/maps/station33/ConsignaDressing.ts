import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { CONSIGNA, CONSIGNA_LOCKER, STATION33_BARRIERS, STATION33_RING_LOCKERS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const { corridor, hall, ceilingHeight } = CONSIGNA;

/**
 * Story and wear of the luggage office, all non-solid: the lost-property
 * plate over each ring locker, the suitcases nobody came back for, tags and
 * leaflets underfoot, blood by the porters' stairs and seepage down the
 * tiles. Litter stays flat and away from the entrances.
 */
export function buildConsignaDressing(context: Station33BuildContext): void {
  for (const locker of STATION33_RING_LOCKERS) addLostPropertyPlate(context, locker.x, locker.z, locker.facingX, locker.facingZ);
  addDroppedLuggage(context);
  addLooseLitter(context);
  addDecals(context);
}

/** "Lost property office" plate on the wall above the open locker. */
function addLostPropertyPlate(context: Station33BuildContext, x: number, z: number, facingX: number, facingZ: number): void {
  const plate = new THREE.Mesh(context.signage.signGeometry('lost-property', 0.8, 0.4), context.signage.material);
  const back = CONSIGNA_LOCKER.depth - 0.012;
  plate.position.set(x + facingX * -back, CONSIGNA_LOCKER.height + 0.42, z + facingZ * -back);
  plate.rotation.y = Math.atan2(facingX, facingZ);
  plate.userData.mapRole = 'sign';
  context.group.add(plate);
}

/** Suitcases dropped flat and a burst holdall: luggage handed in and never claimed. */
function addDroppedLuggage(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const cases: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [9.2, 9.0, 0.3, 0.62, 0.42, 0.2],
    [15.2, 8.2, 1.1, 0.7, 0.45, 0.22],
    [19.6, 7.4, -0.4, 0.55, 0.38, 0.18],
    [15.0, 13.6, 2.0, 0.6, 0.4, 0.2],
    [17.0, 16.4, 0.7, 0.66, 0.44, 0.2],
  ];
  cases.forEach(([x, z, yaw, width, depth, height], index) => {
    const material = materials.luggage[(index + 1) % materials.luggage.length];
    batch.addBox(material, x, height / 2, z, width, height, depth, 0, yaw, 0);
    batch.addBox(materials.bronze, x, height + 0.01, z, 0.16, 0.02, 0.04, 0, yaw, 0);
  });
  const holdall = new THREE.SphereGeometry(0.24, 10, 6).scale(1.4, 0.5, 0.8).rotateY(0.9).translate(18.4, 0.11, 10.6);
  batch.add(holdall, materials.luggage[0]);
}

/** Claim tags and leaflets scattered over the corridor and hall floors. */
function addLooseLitter(context: Station33BuildContext): void {
  const random = seededRandom(3433);
  const rooms = [corridor, hall, hall];
  for (let index = 0; index < 22; index++) {
    const room = rooms[index % rooms.length];
    const sheet = new THREE.PlaneGeometry(0.12 + random() * 0.14, 0.18 + random() * 0.12);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(
      THREE.MathUtils.lerp(room.minX + 0.8, room.maxX - 0.8, random()),
      0.004 + index * 0.0002,
      THREE.MathUtils.lerp(room.minZ + 0.8, room.maxZ - 0.8, random()),
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
  const stairs = STATION33_BARRIERS.find((barrier) => barrier.id === 'consigna-porters-stairs')!;
  addDecal(context, materials.bloodSmear, stairs.x + 1.5, 1.1, hall.maxZ - 0.006, 1.2, 1.0, Math.PI);
  addDecal(context, materials.bloodSmear, stairs.x - 0.4, 0.006, hall.maxZ - 1.5, 1.6, 0.9, 'floor');
  addDecal(context, materials.bloodSplatter, corridor.minX + 2.2, 1.3, corridor.minZ + 0.006, 0.8, 0.9, 0);
  const streakY = ceilingHeight - 0.75;
  for (const x of [8.6, 12.4]) addDecal(context, materials.waterStreak, x, streakY, corridor.maxZ - 0.006, 1.1, 1.4, Math.PI);
  for (const z of [7.2, 16.6]) addDecal(context, materials.waterStreak, hall.minX + 0.006, streakY, z, 1.1, 1.4, Math.PI / 2);
  addDecal(context, materials.waterStreak, 15.4, streakY, hall.minZ + 0.006, 1.1, 1.4, 0);
  const random = seededRandom(3437);
  for (let index = 0; index < 6; index++) {
    const size = 1.1 + random() * 1.2;
    addDecal(
      context, materials.floorGrime,
      THREE.MathUtils.lerp(hall.minX + 1, hall.maxX - 1, random()),
      0.003 + index * 0.0003,
      THREE.MathUtils.lerp(hall.minZ + 1, hall.maxZ - 1, random()),
      size, size * (0.6 + random() * 0.4), 'floor',
    );
  }
}
