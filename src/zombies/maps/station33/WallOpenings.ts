import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import type { WallAxis, WallOpening } from '../shared/ArenaStructure';
import { wallOpeningsAt, type WallCut } from '../shared/EntrancePassage';
import { STATION33_BARRIERS, STATION33_DOORS, STATION33_OPENINGS } from '../Station33Config';

const DOOR_OPENING = { width: POINT_DOOR_SIZE.width, bottom: 0, top: POINT_DOOR_SIZE.height } as const;

/** Entrances first, then doors: the order the wall pieces have always been cut in. */
const STATION_WALL_CUTS: ReadonlyArray<WallCut> = [
  ...STATION33_BARRIERS.map((barrier) => ({ x: barrier.x, z: barrier.z, opening: STATION33_OPENINGS[barrier.kind] })),
  ...STATION33_DOORS.map((door) => ({ x: door.x, z: door.z, opening: DOOR_OPENING })),
];

/**
 * Holes in the station wall centred on `fixed` along `axis` and spanning
 * [min, max]: the zombie entrances and the paid doors that sit on it. Every
 * zone shell cuts its walls with this, so an entrance or door never needs a
 * second definition. Walls of different rooms may share a line.
 */
export function stationWallOpenings(axis: WallAxis, fixed: number, min: number, max: number): WallOpening[] {
  return wallOpeningsAt(axis, fixed, min, max, STATION_WALL_CUTS);
}

/** A straight room wall on its centre line, with every hole cut in it. */
export interface StationWallLine {
  readonly axis: WallAxis;
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  /** +1/-1: the room side of the wall along its normal axis. */
  readonly inward: number;
  readonly openings: ReadonlyArray<WallOpening>;
}

/** Wall line cut by the station's entrances and doors, plus any `extra` openings of its own. */
export function stationWallLine(
  axis: WallAxis,
  fixed: number,
  min: number,
  max: number,
  inward: number,
  extra: ReadonlyArray<WallOpening> = [],
): StationWallLine {
  return { axis, fixed, min, max, inward, openings: [...stationWallOpenings(axis, fixed, min, max), ...extra] };
}
