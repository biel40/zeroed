import {
  MANSION_BANQUET_HALL,
  MANSION_BARRIERS,
  MANSION_BLAST_DOOR_ID,
  MANSION_BOX_ROOM,
  MANSION_BUNKER_CEILING_Y,
  MANSION_BUNKER_DIVIDER_X,
  MANSION_BUNKER_Y,
  MANSION_DOOR_OPENING,
  MANSION_DOORS,
  MANSION_EAST_WALL_X,
  MANSION_GROUND_CEILING_Y,
  MANSION_SECRET_ROOM,
  MANSION_SOUL_LAMPS,
  MANSION_STAIR_BOTTOM_Z,
  MANSION_STAIR_TOP_Z,
  MANSION_WALL_THICKNESS,
} from '../BurnedMansionConfig';

/**
 * Room-side faces of the mansion's walls, derived from the shell: the
 * dressing builders hang trim, panelling and paint on them. Openings are
 * centres along the face; door and window sizes come from the config.
 */
export interface MansionWallFace {
  readonly id: string;
  /** World axis the face runs along; the face plane is perpendicular to the other one. */
  readonly axis: 'x' | 'z';
  /** Coordinate of the wall surface on the perpendicular axis. */
  readonly plane: number;
  /** Sign of the room side on the perpendicular axis. */
  readonly inward: 1 | -1;
  readonly from: number;
  readonly to: number;
  readonly floorY: number;
  readonly ceilingY: number;
  readonly doors: ReadonlyArray<number>;
  /** Doors framed by a wooden casing: all but the blast door, which brings its own steel frame. */
  readonly casedDoors: ReadonlyArray<number>;
  readonly doorWidth: number;
  readonly windows: ReadonlyArray<number>;
  /** Wall-mounted gameplay pieces (soul lamps) that panelling must leave uncovered. */
  readonly mounts: ReadonlyArray<number>;
}

const HALF = MANSION_WALL_THICKNESS / 2;
const WEST_FACE_X = -7.15 + HALF;
const BOX_WEST_FACE_X = MANSION_BOX_ROOM.westWallX + HALF;
const BOX_EAST_FACE_X = MANSION_BOX_ROOM.eastWallX - HALF;
const BOX_NORTH_FACE_Z = MANSION_BOX_ROOM.northWallZ + HALF;
const BOX_SOUTH_FACE_Z = MANSION_BOX_ROOM.southWallZ - HALF;
const EAST_FACE_X = MANSION_EAST_WALL_X - HALF;
const NORTH_FACE_Z = MANSION_BANQUET_HALL.southZ + HALF;
const SOUTH_FACE_Z = 10.15 - HALF;
const DIVIDER_Z = 2;
const BANQUET_SOUTH_FACE_Z = MANSION_BANQUET_HALL.southZ - HALF;
const BANQUET_NORTH_FACE_Z = MANSION_BANQUET_HALL.northZ + HALF;
const BANQUET_WEST_FACE_X = MANSION_BANQUET_HALL.minX + HALF;
const BANQUET_EAST_FACE_X = MANSION_BANQUET_HALL.maxX - HALF;
const CHIMNEY = MANSION_BANQUET_HALL.chimney;

function windowsOn(axis: 'x' | 'z', plane: number, from: number, to: number): number[] {
  return MANSION_BARRIERS
    .filter((barrier) => (axis === 'x' ? barrier.outwardZ !== 0 : barrier.outwardX !== 0))
    .filter((barrier) => Math.abs((axis === 'x' ? barrier.z : barrier.x) - plane) <= HALF + 0.01)
    .map((barrier) => (axis === 'x' ? barrier.x : barrier.z))
    .filter((center) => center > from && center < to);
}

function doorsOn(axis: 'x' | 'z', plane: number, from: number, to: number, include: (doorId: string) => boolean = () => true): number[] {
  return MANSION_DOORS
    .filter((door) => include(door.id))
    .filter((door) => (axis === 'x' ? door.outwardZ !== 0 : door.outwardX !== 0))
    .filter((door) => Math.abs((axis === 'x' ? door.z : door.x) - plane) <= HALF + 0.01)
    .map((door) => (axis === 'x' ? door.x : door.z))
    .filter((center) => center > from && center < to);
}

function mountsOn(axis: 'x' | 'z', plane: number, from: number, to: number): number[] {
  return MANSION_SOUL_LAMPS
    .filter((lamp) => lamp.floor === 0 && Math.abs((axis === 'x' ? lamp.position.z : lamp.position.x) - plane) < 0.35)
    .map((lamp) => (axis === 'x' ? lamp.position.x : lamp.position.z))
    .filter((center) => center > from && center < to);
}

function groundFace(id: string, axis: 'x' | 'z', plane: number, inward: 1 | -1, from: number, to: number): MansionWallFace {
  const wallCenter = plane - inward * HALF;
  return {
    id,
    axis,
    plane,
    inward,
    from,
    to,
    floorY: 0,
    ceilingY: MANSION_GROUND_CEILING_Y,
    doors: doorsOn(axis, wallCenter, from, to),
    casedDoors: doorsOn(axis, wallCenter, from, to, (doorId) => doorId !== MANSION_BLAST_DOOR_ID),
    doorWidth: MANSION_DOOR_OPENING.width,
    windows: windowsOn(axis, wallCenter, from, to),
    mounts: mountsOn(axis, plane, from, to),
  };
}

/** Faces of the five ground-floor rooms: start, Mystery Box room, banquet hall, east hall and stair room. */
export const MANSION_GROUND_FACES: ReadonlyArray<MansionWallFace> = [
  groundFace('start-south', 'x', SOUTH_FACE_Z, -1, WEST_FACE_X, EAST_FACE_X),
  groundFace('start-north', 'x', DIVIDER_Z + HALF, 1, WEST_FACE_X, EAST_FACE_X),
  groundFace('start-west', 'z', WEST_FACE_X, 1, DIVIDER_Z + HALF, SOUTH_FACE_Z),
  groundFace('start-east', 'z', EAST_FACE_X, -1, DIVIDER_Z + HALF, SOUTH_FACE_Z),
  groundFace('box-north', 'x', BOX_NORTH_FACE_Z, 1, BOX_WEST_FACE_X, BOX_EAST_FACE_X),
  // The west end is the new return wall overlooking the garden beside the start room.
  groundFace('box-south', 'x', BOX_SOUTH_FACE_Z, -1, BOX_WEST_FACE_X, BOX_EAST_FACE_X),
  groundFace('box-west', 'z', BOX_WEST_FACE_X, 1, BOX_NORTH_FACE_Z, BOX_SOUTH_FACE_Z),
  groundFace('box-east', 'z', BOX_EAST_FACE_X, -1, BOX_NORTH_FACE_Z, BOX_SOUTH_FACE_Z),
  groundFace('banquet-south', 'x', BANQUET_SOUTH_FACE_Z, -1, BANQUET_WEST_FACE_X, BANQUET_EAST_FACE_X),
  groundFace('banquet-north', 'x', BANQUET_NORTH_FACE_Z, 1, BANQUET_WEST_FACE_X, BANQUET_EAST_FACE_X),
  groundFace('banquet-west', 'z', BANQUET_WEST_FACE_X, 1, BANQUET_NORTH_FACE_Z, BANQUET_SOUTH_FACE_Z),
  groundFace('banquet-east', 'z', BANQUET_EAST_FACE_X, -1, BANQUET_NORTH_FACE_Z, BANQUET_SOUTH_FACE_Z),
  // The fireplace surround interrupts the chimney breast's panelling like a doorway.
  {
    ...groundFace('banquet-chimney', 'z', CHIMNEY.frontX, -1, CHIMNEY.z - CHIMNEY.breadth / 2, CHIMNEY.z + CHIMNEY.breadth / 2),
    doors: [CHIMNEY.z],
    doorWidth: CHIMNEY.surroundWidth,
  },
  groundFace('hall-north', 'x', NORTH_FACE_Z, 1, HALF, MANSION_BUNKER_DIVIDER_X - HALF),
  groundFace('hall-south', 'x', DIVIDER_Z - HALF, -1, HALF, MANSION_BUNKER_DIVIDER_X - HALF),
  groundFace('hall-west', 'z', HALF, 1, NORTH_FACE_Z, DIVIDER_Z - HALF),
  groundFace('hall-east', 'z', MANSION_BUNKER_DIVIDER_X - HALF, -1, NORTH_FACE_Z, DIVIDER_Z - HALF),
  // North of the stairwell mouth the shaft walls hide the stair room's side walls.
  groundFace('stairs-south', 'x', DIVIDER_Z - HALF, -1, MANSION_BUNKER_DIVIDER_X + HALF, EAST_FACE_X),
  groundFace('stairs-west', 'z', MANSION_BUNKER_DIVIDER_X + HALF, 1, MANSION_STAIR_TOP_Z, DIVIDER_Z - HALF),
  groundFace('stairs-east', 'z', EAST_FACE_X, -1, MANSION_STAIR_TOP_Z, DIVIDER_Z - HALF),
];

const BUNKER_WEST_FACE_X = MANSION_SECRET_ROOM.entranceX + HALF;
/** The bunker east wall stands one thickness west of the ground-floor one. */
const BUNKER_EAST_FACE_X = MANSION_EAST_WALL_X - MANSION_WALL_THICKNESS;
const BUNKER_NORTH_FACE_Z = -9.5 + HALF;
const BUNKER_SOUTH_FACE_Z = DIVIDER_Z - HALF;
/** West face of the stair shaft's west wall, which stands in the bunker hall. */
const SHAFT_WEST_FACE_X = 4.35;

function bunkerFace(id: string, axis: 'x' | 'z', plane: number, inward: 1 | -1, from: number, to: number, doors: number[] = []): MansionWallFace {
  return {
    id,
    axis,
    plane,
    inward,
    from,
    to,
    floorY: MANSION_BUNKER_Y,
    ceilingY: MANSION_BUNKER_CEILING_Y,
    doors,
    casedDoors: [],
    doorWidth: MANSION_SECRET_ROOM.entranceWidth,
    windows: [],
    mounts: [],
  };
}

/**
 * Faces of the bunker hall. The secret room keeps its bare, ritual
 * concrete; its hidden entrance counts as a door so nothing covers it.
 */
export const MANSION_BUNKER_FACES: ReadonlyArray<MansionWallFace> = [
  bunkerFace('bunker-north', 'x', BUNKER_NORTH_FACE_Z, 1, BUNKER_WEST_FACE_X, BUNKER_EAST_FACE_X),
  bunkerFace('bunker-south', 'x', BUNKER_SOUTH_FACE_Z, -1, BUNKER_WEST_FACE_X, BUNKER_EAST_FACE_X),
  bunkerFace('bunker-west', 'z', BUNKER_WEST_FACE_X, 1, BUNKER_NORTH_FACE_Z, BUNKER_SOUTH_FACE_Z, [MANSION_SECRET_ROOM.entranceZ]),
  bunkerFace('bunker-east-landing', 'z', BUNKER_EAST_FACE_X, -1, BUNKER_NORTH_FACE_Z, MANSION_STAIR_BOTTOM_Z),
  bunkerFace('bunker-east', 'z', BUNKER_EAST_FACE_X, -1, MANSION_STAIR_TOP_Z, BUNKER_SOUTH_FACE_Z),
  bunkerFace('bunker-shaft', 'z', SHAFT_WEST_FACE_X, -1, MANSION_STAIR_BOTTOM_Z, MANSION_STAIR_TOP_Z),
];
