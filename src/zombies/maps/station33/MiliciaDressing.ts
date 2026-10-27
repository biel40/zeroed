import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { CONSIGNA_LOCKER, MILICIA, STATION33_BARRIERS, STATION33_RING_LOCKERS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { SignId } from './Station33Signage';

const { hall, ceilingHeight } = MILICIA;

/**
 * Story and wear of the militia post, all non-solid: the evidence plate
 * over the Armour locker, "wanted" bulletins stripped of their photos,
 * reports scattered off the desk, blood by the back door and seepage down
 * the plaster. Litter stays flat and away from the entrances.
 */
export function buildMiliciaDressing(context: Station33BuildContext): void {
  addEvidencePlates(context);
  addSign(context, 'wanted', -9.0, 1.85, hall.minZ + 0.012, 0.8, 0.4, 0);
  addSign(context, 'wanted', -8.4, 1.8, hall.maxZ - 0.012, 0.8, 0.4, Math.PI);
  addLooseReports(context);
  addDecals(context);
}

function addSign(context: Station33BuildContext, id: SignId, x: number, y: number, z: number, width: number, height: number, yaw: number): void {
  const sign = context.signage.signGeometry(id, width, height).rotateY(yaw).translate(x, y, z);
  context.batch.add(sign, context.signage.material);
}

/** "Material evidence" plate on the wall above each open locker of the post. */
function addEvidencePlates(context: Station33BuildContext): void {
  const back = CONSIGNA_LOCKER.depth - 0.012;
  for (const locker of STATION33_RING_LOCKERS.filter((candidate) => candidate.zone === 'milicia')) {
    addSign(
      context, 'evidence',
      locker.x - locker.facingX * back, CONSIGNA_LOCKER.height + 0.4, locker.z - locker.facingZ * back,
      0.9, 0.45, Math.atan2(locker.facingX, locker.facingZ),
    );
  }
}

/** Report forms blown off the duty desk across the floor. */
function addLooseReports(context: Station33BuildContext): void {
  const random = seededRandom(3449);
  for (let index = 0; index < 14; index++) {
    const sheet = new THREE.PlaneGeometry(0.21, 0.3);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(
      THREE.MathUtils.lerp(-12.2, hall.maxX - 0.8, random()),
      0.004 + index * 0.0002,
      THREE.MathUtils.lerp(hall.minZ + 1.2, 14.0, random()),
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
  const backDoor = STATION33_BARRIERS.find((barrier) => barrier.id === 'milicia-back-door')!;
  addDecal(context, materials.bloodSmear, backDoor.x + 1.4, 1.0, hall.maxZ - 0.006, 1.1, 0.9, Math.PI);
  addDecal(context, materials.bloodSmear, backDoor.x - 0.3, 0.006, hall.maxZ - 1.4, 1.5, 0.8, 'floor');
  addDecal(context, materials.bloodSplatter, -13.4, 0.006, 16.3, 0.9, 0.9, 'floor');
  const streakY = ceilingHeight - 0.7;
  for (const z of [6.6, 13.2]) addDecal(context, materials.waterStreak, hall.minX + 0.006, streakY, z, 1.1, 1.4, Math.PI / 2);
  addDecal(context, materials.waterStreak, -12.6, streakY, hall.minZ + 0.006, 1.1, 1.4, 0);
  const random = seededRandom(3457);
  for (let index = 0; index < 5; index++) {
    const size = 1.0 + random() * 1.1;
    addDecal(
      context, materials.floorGrime,
      THREE.MathUtils.lerp(hall.minX + 1, hall.maxX - 1, random()),
      0.003 + index * 0.0003,
      THREE.MathUtils.lerp(hall.minZ + 1, hall.maxZ - 1, random()),
      size, size * (0.6 + random() * 0.4), 'floor',
    );
  }
}
