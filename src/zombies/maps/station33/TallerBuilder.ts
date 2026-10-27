import * as THREE from 'three';
import { addLockerBank, ringLockersOn, WallFrame } from '../shared/LockerBank';
import { addSolidProxy } from '../shared/SolidProxy';
import { CONSIGNA_LOCKER, STATION33_WALL_THICKNESS, station33RingLockersIn, TALLER } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { station33LockerLook } from './Station33Machines';
import { stationWallLine } from './WallOpenings';

const { hall, ceilingHeight } = TALLER;
const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;

/** Yellow maintenance workshop reached through the substation, with one clear central aisle. */
export function buildTaller(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { structure, materials, batch } = context;
  const yellowPlaster = materials.vaultPlaster.clone();
  yellowPlaster.name = 'station33-workshop-yellow';
  yellowPlaster.color.setHex(TALLER.color);
  const centerX = (hall.minX + hall.maxX) / 2;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  const width = hall.maxX - hall.minX + 2 * STATION33_WALL_THICKNESS;
  const length = hall.maxZ - hall.minZ + STATION33_WALL_THICKNESS;
  for (const [name, y, material] of [
    ['floor', -0.08, materials.machineRoomFloor],
    ['ceiling', ceilingHeight + 0.08, materials.serviceConcrete],
  ] as const) {
    structure.addBox(centerX, y, centerZ - HALF_THICKNESS, width, 0.16, length, material, {
      name: `taller-${name}`, surface: 'concrete', mapRole: 'slab', blocksPlayer: false, castShadow: false, uvSeed: 180,
    });
  }
  // The south wall and doorway already belong to the substation.
  const walls = [
    stationWallLine('x', hall.minZ - HALF_THICKNESS, hall.minX - STATION33_WALL_THICKNESS, hall.maxX + STATION33_WALL_THICKNESS, 1),
    stationWallLine('z', hall.minX - HALF_THICKNESS, hall.minZ, hall.maxZ, 1),
    stationWallLine('z', hall.maxX + HALF_THICKNESS, hall.minZ, hall.maxZ, -1),
  ];
  for (const wall of walls) {
    structure.addWallWithOpenings(wall.axis, wall.fixed, wall.min, wall.max, 0, ceilingHeight,
      STATION33_WALL_THICKNESS, wall.openings, yellowPlaster, {
        surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: !context.profile.useReducedEffects, uvSeed: 182,
      });
  }
  const eastWall = new WallFrame('z', hall.maxX, -1);
  addLockerBank(context, station33LockerLook(context), {
    frame: eastWall, from: -53.8, to: -48.0, ajar: [2],
    ringLockers: ringLockersOn(eastWall, station33RingLockersIn('taller'), CONSIGNA_LOCKER.depth),
  }, 0);
  // A shallow bench against the west wall leaves the door and the horde's route free.
  const benchX = hall.minX + 0.45;
  const benchZ = -51.6;
  batch.addBox(materials.varnishedWood, benchX, 0.92, benchZ, 0.8, 0.1, 2.4);
  for (const z of [benchZ - 1, benchZ + 1]) {
    batch.addBox(materials.greySteel, benchX, 0.44, z, 0.65, 0.88, 0.08);
  }
  addSolidProxy(context, 'taller-workbench',
    { x: hall.minX, y: 0, z: benchZ - 1.2 }, { x: hall.minX + 0.9, y: 0.97, z: benchZ + 1.2 }, 'wood');
  const yellowLamp = lighting.registerMaterial(new THREE.MeshBasicMaterial({ color: TALLER.lightColor }), 'amber');
  batch.addBox(materials.greySteel, 5.6, 2.5, hall.maxZ - 0.08, 0.38, 0.24, 0.12);
  batch.addBox(yellowLamp, 5.6, 2.5, hall.maxZ - 0.15, 0.3, 0.16, 0.03);
  const plate = context.signage.signGeometry('maintenance', 1.1, 0.45)
    .rotateY(-Math.PI / 2).translate(hall.maxX - 0.02, 2.5, -50.8);
  batch.add(plate, context.signage.material);
}
