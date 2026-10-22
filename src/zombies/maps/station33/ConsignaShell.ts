import * as THREE from 'three';
import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import { wallSpans, type WallAxis, type WallOpening } from '../shared/ArenaStructure';
import { CONSIGNA, STATION33_DOORS, STATION33_WALL_THICKNESS, VESTIBULE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { stationWallOpenings } from './WallOpenings';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const SKIRTING_HEIGHT = 0.14;
const { corridor, hall, ceilingHeight } = CONSIGNA;

interface WallLine {
  readonly axis: WallAxis;
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  /** +1/-1: the room side of the wall along its normal axis. */
  readonly inward: number;
  readonly openings: ReadonlyArray<WallOpening>;
}

function line(axis: WallAxis, fixed: number, min: number, max: number, inward: number, extra: ReadonlyArray<WallOpening> = []): WallLine {
  return { axis, fixed, min, max, inward, openings: [...stationWallOpenings(axis, fixed, min, max), ...extra] };
}

/**
 * Walls of the luggage office: the corridor's two sides, then the hall,
 * whose west wall opens onto the corridor. Corridor walls stop at the
 * vestibule's east wall and at the hall's west wall.
 */
export function consignaWalls(): ReadonlyArray<WallLine> {
  const hallWest = hall.minX - HALF_THICKNESS;
  const hallOuterMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  const hallOuterMaxZ = hall.maxZ + STATION33_WALL_THICKNESS;
  const corridorOpening: WallOpening = {
    center: (corridor.minZ + corridor.maxZ) / 2,
    width: corridor.maxZ - corridor.minZ,
    bottom: 0,
    top: ceilingHeight,
  };
  return [
    line('x', corridor.minZ - HALF_THICKNESS, corridor.minX, hallWest - HALF_THICKNESS, 1),
    line('x', corridor.maxZ + HALF_THICKNESS, corridor.minX, hallWest - HALF_THICKNESS, -1),
    line('z', hallWest, hallOuterMinZ, hallOuterMaxZ, 1, [corridorOpening]),
    line('z', hall.maxX + HALF_THICKNESS, hallOuterMinZ, hallOuterMaxZ, -1),
    line('x', hall.minZ - HALF_THICKNESS, hall.minX, hall.maxX, 1),
    line('x', hall.maxZ + HALF_THICKNESS, hall.minX, hall.maxX, -1),
  ];
}

/**
 * Floor, flat ceiling and glazed-tile walls of the luggage office, with a
 * granite skirting, and the steel frame and enamel plate of its door on
 * both faces of the vestibule wall.
 */
export function buildConsignaShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const slab = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, y: number, material: THREE.Material, seed: number): void => {
    structure.addBox((minX + maxX) / 2, y, (minZ + maxZ) / 2, maxX - minX, 0.16, maxZ - minZ, material, {
      name, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: seed, blocksPlayer: false,
    });
  };
  // Slabs meet edge to edge, never overlapping (coplanar faces would flicker):
  // the corridor floor starts where the vestibule's ends, the hall's reaches
  // the entrance passages, ceilings tuck into the walls they meet.
  const hallWest = hall.minX - HALF_THICKNESS;
  const corridorMinZ = corridor.minZ - HALF_THICKNESS;
  const corridorMaxZ = corridor.maxZ + HALF_THICKNESS;
  const hallMaxX = hall.maxX + STATION33_WALL_THICKNESS;
  const hallMinZ = hall.minZ - HALF_THICKNESS;
  const hallMaxZ = hall.maxZ + STATION33_WALL_THICKNESS;
  slab('consigna-corridor-floor', corridor.minX, hallWest, corridorMinZ, corridorMaxZ, -0.08, materials.floorGranite, 41);
  slab('consigna-hall-floor', hallWest, hallMaxX, hallMinZ, hallMaxZ, -0.08, materials.floorGranite, 43);
  const ceilingY = ceilingHeight + 0.08;
  slab('consigna-corridor-ceiling', corridor.minX - HALF_THICKNESS, hallWest, corridorMinZ, corridorMaxZ, ceilingY, materials.vaultPlaster, 47);
  slab('consigna-hall-ceiling', hallWest, hallMaxX, hallMinZ, hallMaxZ, ceilingY, materials.vaultPlaster, 53);

  let seed = 60;
  for (const wall of consignaWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, ceilingHeight, STATION33_WALL_THICKNESS,
      wall.openings, materials.tiledWall,
      { surface: 'concrete', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: seed, blocksPlayer: true },
    );
    seed += 5;
    addSkirting(context, wall);
  }
  for (const door of STATION33_DOORS) addDoorFrame(context, door.x, door.z);
}

function addSkirting(context: Station33BuildContext, wall: WallLine): void {
  const face = wall.fixed + wall.inward * (HALF_THICKNESS + 0.015);
  for (const [from, to] of wallSpans(wall.min, wall.max, wall.openings)) {
    const along = (from + to) / 2;
    const length = to - from;
    if (wall.axis === 'z') context.batch.addBox(context.materials.darkGranite, face, SKIRTING_HEIGHT / 2, along, 0.03, SKIRTING_HEIGHT, length, 0, 0, 0, along);
    else context.batch.addBox(context.materials.darkGranite, along, SKIRTING_HEIGHT / 2, face, length, SKIRTING_HEIGHT, 0.03, 0, 0, 0, along);
  }
}

/** Painted steel jambs and lintel on both faces of a door in the vestibule's east wall, plate on the hall side. */
function addDoorFrame(context: Station33BuildContext, wallX: number, z: number): void {
  const { batch, materials, signage, group } = context;
  const { width, height } = POINT_DOOR_SIZE;
  for (const side of [-1, 1]) {
    const x = wallX + side * (HALF_THICKNESS + 0.03);
    for (const jamb of [-1, 1]) batch.addBox(materials.paintedSteel, x, height / 2, z + jamb * (width / 2 + 0.05), 0.07, height, 0.1);
    batch.addBox(materials.paintedSteel, x, height + 0.05, z, 0.07, 0.1, width + 0.2);
  }
  const plate = new THREE.Mesh(signage.signGeometry('luggage-office', 0.7, 0.35), signage.material);
  plate.position.set(VESTIBULE.maxX - 0.012, height + 0.32, z);
  plate.rotation.y = -Math.PI / 2;
  plate.userData.mapRole = 'sign';
  group.add(plate);
}
