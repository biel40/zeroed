import type * as THREE from 'three';
import { wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { MILICIA, STATION33_WALL_THICKNESS, VESTIBULE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { stationWallLine as line, stationWallOpenings, type StationWallLine } from './WallOpenings';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const { hall, ceilingHeight } = MILICIA;
/** Green oil-paint wainscot of a Soviet office, under pale plaster. */
const DADO_HEIGHT = 1.3;
/** The vestibule's west wall, which the post shares as its east wall. */
const SHARED_WALL_X = VESTIBULE.minX - HALF_THICKNESS;
/** The post's paint on that wall stands just proud of the marble's back face. */
const SHARED_FACE_X = hall.maxX - 0.012;

/**
 * Walls of the militia post. Its east wall is the vestibule's west wall,
 * so only the north, south and west walls are its own; they run to the
 * back of that wall.
 */
export function miliciaWalls(): ReadonlyArray<StationWallLine> {
  const outerMinX = hall.minX - STATION33_WALL_THICKNESS;
  return [
    line('x', hall.minZ - HALF_THICKNESS, outerMinX, hall.maxX, 1),
    line('x', hall.maxZ + HALF_THICKNESS, outerMinX, hall.maxX, -1),
    line('z', hall.minX - HALF_THICKNESS, hall.minZ - STATION33_WALL_THICKNESS, hall.maxZ + STATION33_WALL_THICKNESS, 1),
  ];
}

/**
 * Tiled floor, flat plaster ceiling and plaster walls over a green
 * wainscot, also painted over the back of the vestibule's marble wall.
 * The door frame comes from `DoorFrames`.
 */
export function buildMiliciaShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const slab = (name: string, y: number, material: THREE.Material, seed: number): void => {
    // Edge to edge with the vestibule floor, which ends on the back of its west wall.
    const minX = hall.minX - STATION33_WALL_THICKNESS;
    const minZ = hall.minZ - STATION33_WALL_THICKNESS;
    const maxZ = hall.maxZ + STATION33_WALL_THICKNESS;
    structure.addBox((minX + hall.maxX) / 2, y, (minZ + maxZ) / 2, hall.maxX - minX, 0.16, maxZ - minZ, material, {
      name, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: seed, blocksPlayer: false,
    });
  };
  slab('milicia-floor', -0.08, materials.machineRoomFloor, 111);
  slab('milicia-ceiling', ceilingHeight + 0.08, materials.vaultPlaster, 113);

  let seed = 115;
  for (const wall of miliciaWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, ceilingHeight, STATION33_WALL_THICKNESS,
      wall.openings, materials.vaultPlaster,
      { surface: 'concrete', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: seed, blocksPlayer: true },
    );
    seed += 5;
    addDado(context, wall);
  }
  addSharedWallFacing(context);
}

/** Wainscot and its dark stripe on every solid stretch of a wall's room side. */
function addDado(context: Station33BuildContext, wall: StationWallLine): void {
  const face = wall.fixed + wall.inward * (HALF_THICKNESS + 0.015);
  const min = Math.max(wall.min, wall.axis === 'z' ? hall.minZ : hall.minX);
  const max = Math.min(wall.max, wall.axis === 'z' ? hall.maxZ : hall.maxX);
  for (const [from, to] of wallSpans(min, max, wall.openings)) paintDado(context, wall.axis, face, from, to);
}

function paintDado(context: Station33BuildContext, axis: 'x' | 'z', face: number, from: number, to: number): void {
  const { batch, materials } = context;
  const along = (from + to) / 2;
  const length = to - from;
  if (axis === 'z') {
    batch.addBox(materials.paintedSteel, face, DADO_HEIGHT / 2, along, 0.03, DADO_HEIGHT, length, 0, 0, 0, along);
    batch.addBox(materials.rubber, face, DADO_HEIGHT + 0.025, along, 0.035, 0.05, length);
  } else {
    batch.addBox(materials.paintedSteel, along, DADO_HEIGHT / 2, face, length, DADO_HEIGHT, 0.03, 0, 0, 0, along);
    batch.addBox(materials.rubber, along, DADO_HEIGHT + 0.025, face, length, 0.05, 0.035);
  }
}

/**
 * Plaster and wainscot over the back of the vestibule's marble west wall,
 * around the door and over its lintel, up to the post's ceiling.
 */
function addSharedWallFacing(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const openings: ReadonlyArray<WallOpening> = stationWallOpenings('z', SHARED_WALL_X, hall.minZ, hall.maxZ);
  for (const [from, to] of wallSpans(hall.minZ, hall.maxZ, openings)) {
    batch.addBox(materials.vaultPlaster, SHARED_FACE_X, ceilingHeight / 2, (from + to) / 2, 0.02, ceilingHeight, to - from, 0, 0, 0, from);
  }
  for (const opening of openings) {
    const height = ceilingHeight - opening.top;
    batch.addBox(materials.vaultPlaster, SHARED_FACE_X, opening.top + height / 2, opening.center, 0.02, height, opening.width);
  }
  addDado(context, { axis: 'z', fixed: SHARED_WALL_X, min: hall.minZ, max: hall.maxZ, inward: -1, openings });
}
