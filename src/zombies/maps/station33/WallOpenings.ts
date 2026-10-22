import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import type { WallAxis, WallOpening } from '../shared/ArenaStructure';
import { STATION33_BARRIERS, STATION33_DOORS, STATION33_OPENINGS } from '../Station33Config';

/**
 * Holes in the station wall centred on `fixed` along `axis` and spanning
 * [min, max]: the zombie entrances and the paid doors that sit on it. Every
 * zone shell cuts its walls with this, so an entrance or door never needs a
 * second definition. Walls of different rooms may share a line.
 */
export function stationWallOpenings(axis: WallAxis, fixed: number, min: number, max: number): WallOpening[] {
  const along = (point: { readonly x: number; readonly z: number }): number => (axis === 'z' ? point.z : point.x);
  const onWall = (point: { readonly x: number; readonly z: number }): boolean =>
    (axis === 'z' ? point.x : point.z) === fixed && along(point) > min && along(point) < max;
  return [
    ...STATION33_BARRIERS.filter(onWall).map((barrier) => ({ center: along(barrier), ...STATION33_OPENINGS[barrier.kind] })),
    ...STATION33_DOORS.filter(onWall).map((door) => ({ center: along(door), width: POINT_DOOR_SIZE.width, bottom: 0, top: POINT_DOOR_SIZE.height })),
  ];
}
