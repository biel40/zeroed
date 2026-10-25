import * as THREE from 'three';
import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import { STATION33_DOORS, STATION33_WALL_THICKNESS, type Station33Door } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;

/**
 * Painted steel jambs and lintel on both faces of every paid door, and its
 * enamel plate on the side the door is bought from.
 */
export function buildDoorFrames(context: Station33BuildContext): void {
  for (const door of STATION33_DOORS) addDoorFrame(context, door);
}

function addDoorFrame(context: Station33BuildContext, door: Station33Door): void {
  const { batch, materials, signage, group } = context;
  const { width, height } = POINT_DOOR_SIZE;
  // Unit vector along the wall; box sizes swap with the wall's axis.
  const alongX = -door.outwardZ;
  const alongZ = door.outwardX;
  const size = (normal: number, along: number): { x: number; z: number } =>
    door.outwardX !== 0 ? { x: normal, z: along } : { x: along, z: normal };
  for (const side of [-1, 1]) {
    const x = door.x + door.outwardX * side * (HALF_THICKNESS + 0.03);
    const z = door.z + door.outwardZ * side * (HALF_THICKNESS + 0.03);
    const jambSize = size(0.07, 0.1);
    for (const jamb of [-1, 1]) {
      const offset = jamb * (width / 2 + 0.05);
      batch.addBox(materials.paintedSteel, x + alongX * offset, height / 2, z + alongZ * offset, jambSize.x, height, jambSize.z);
    }
    const lintelSize = size(0.07, width + 0.2);
    batch.addBox(materials.paintedSteel, x, height + 0.05, z, lintelSize.x, 0.1, lintelSize.z);
  }
  const plate = new THREE.Mesh(signage.signGeometry(door.plate, 0.7, 0.35), signage.material);
  const back = HALF_THICKNESS + 0.012;
  plate.position.set(door.x - door.outwardX * back, height + 0.32, door.z - door.outwardZ * back);
  plate.rotation.y = Math.atan2(-door.outwardX, -door.outwardZ);
  plate.userData.mapRole = 'sign';
  group.add(plate);
}
