import type { WindowBarrierConfig } from '../barriers/WindowBarrier';

/** Pure tuning constants for the Burned Mansion map. */

export const BARRIER_CONFIG: WindowBarrierConfig = {
  boardCount: 5,
  boardHp: 100,
  repairInterval: 0.55,
  repairRewardCap: 4,
};

/** Door costs in points. */
export const MANSION_DOOR_COSTS = {
  diningHall: 750,
  upperFloor: 1000,
  eastWing: 1250,
} as const;

/** Safe player spawn in the south-west starting room. */
export const MANSION_PLAYER_SPAWN = { x: -3.5, y: 1.72, z: 5.8, floor: 0 } as const;

/** Ground-floor movement bounds. */
export const MANSION_GROUND_BOUNDS = {
  minX: -6.6,
  maxX: 6.6,
  minZ: -7.6,
  maxZ: 7.6,
} as const;

/** Upper-floor movement bounds. */
export const MANSION_UPPER_BOUNDS = {
  minX: 0.35,
  maxX: 6.6,
  minZ: -7.6,
  maxZ: 1.6,
} as const;

export const MANSION_UPPER_Y = 3.4;

/** Window barriers: position, outward normal (zombies spawn on this side). */
export const MANSION_BARRIERS: ReadonlyArray<{
  id: string;
  x: number;
  z: number;
  outwardX: number;
  outwardZ: number;
  zone: string;
}> = [
  { id: 'start-west-a', x: -7.15, z: 5.4, outwardX: -1, outwardZ: 0, zone: 'start' },
  { id: 'start-west-b', x: -7.15, z: 3.2, outwardX: -1, outwardZ: 0, zone: 'start' },
  { id: 'start-south', x: -3.5, z: 8.15, outwardX: 0, outwardZ: 1, zone: 'start' },
  { id: 'box-west', x: -7.15, z: -3.2, outwardX: -1, outwardZ: 0, zone: 'to-dining' },
  { id: 'box-north', x: -3.5, z: -8.15, outwardX: 0, outwardZ: -1, zone: 'to-dining' },
  { id: 'bunker-east', x: 7.15, z: -4.5, outwardX: 1, outwardZ: 0, zone: 'to-east' },
];

/** Point doors: position, outward normal (opens toward), cost key. */
export const MANSION_DOORS: ReadonlyArray<{
  id: string;
  x: number;
  z: number;
  outwardX: number;
  outwardZ: number;
  cost: number;
  y: number;
  floor: number;
}> = [
  { id: 'to-dining', x: -3.5, z: 2, outwardX: 0, outwardZ: -1, cost: MANSION_DOOR_COSTS.diningHall, y: 0, floor: 0 },
  { id: 'to-upper', x: 0, z: -2.5, outwardX: 1, outwardZ: 0, cost: MANSION_DOOR_COSTS.upperFloor, y: 0, floor: 0 },
  { id: 'to-east', x: 3.2, z: -4.5, outwardX: 1, outwardZ: 0, cost: MANSION_DOOR_COSTS.eastWing, y: 0, floor: 0 },
];

/** Spawn points per unlocked zone. Zone ids match door ids + 'start'. */
export const MANSION_SPAWNS: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  start: [
    [-9.2, 5.4],
    [-9.2, 3.2],
    [-3.5, 10.2],
  ],
  'to-dining': [
    [-9.2, -3.2],
    [-3.5, -10.2],
  ],
  'to-upper': [
    [-9.2, -3.2],
  ],
  'to-east': [
    [9.2, -4.5],
  ],
};

/** Mystery Box in the room immediately behind the first paid door. */
export const MANSION_BOX_PLACEMENT = {
  position: { x: -5.2, y: 0, z: -5.6 },
  yaw: Math.PI / 2,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
} as const;

export const DEBUG_MAP_COLLIDERS = false;
