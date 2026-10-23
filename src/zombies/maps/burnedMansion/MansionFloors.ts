import type * as THREE from 'three';
import { MANSION_BUNKER_DIVIDER_X } from '../BurnedMansionConfig';

/** Bounds that make a visual mesh belong to a single floor (bunker ceiling tops out at -0.14). */
const BUNKER_ONLY_MAX_Y = -0.1;
const GROUND_ONLY_MIN_Y = -0.2;
/**
 * The stair room is the only place where one floor can see the other, and
 * only that strip of it: a ray through both shaft openings stays at x >= 4.2
 * on either floor. The margin keeps the divider-wall doorway on the safe side.
 */
const STAIR_ROOM_MIN_X = MANSION_BUNKER_DIVIDER_X - 0.5;
const STAIR_ROOM_MAX_Z = 2;

export type MansionFloor = 'ground' | 'bunker';

/** Which floor a visual belongs to (null: spans both) and whether the stairwell exposes it. */
export interface MansionFloorPartition {
  readonly floor: MansionFloor | null;
  readonly nearStairs: boolean;
}

export function floorPartitionOf(bounds: THREE.Box3): MansionFloorPartition {
  const floor = bounds.max.y < BUNKER_ONLY_MAX_Y ? 'bunker' : bounds.min.y > GROUND_ONLY_MIN_Y ? 'ground' : null;
  return { floor, nearStairs: bounds.max.x > STAIR_ROOM_MIN_X && bounds.min.z < STAIR_ROOM_MAX_Z };
}

export function isInStairRoom(x: number, z: number): boolean {
  return x > STAIR_ROOM_MIN_X && z < STAIR_ROOM_MAX_Z;
}
