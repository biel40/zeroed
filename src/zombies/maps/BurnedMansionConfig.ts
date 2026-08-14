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

/** Player spawn inside the main hall. */
export const MANSION_PLAYER_SPAWN = { x: 0, y: 1.7, z: 0, floor: 0 };

/** Ground-floor movement bounds. */
export const MANSION_GROUND_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: -10,
  maxZ: 10,
} as const;

/** Upper-floor movement bounds. */
export const MANSION_UPPER_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: -10,
  maxZ: 10,
} as const;

export const MANSION_UPPER_Y = 3.2;

/** Window barriers: position, outward normal (zombies spawn on this side). */
export const MANSION_BARRIERS: ReadonlyArray<{
  id: string;
  x: number;
  z: number;
  outwardX: number;
  outwardZ: number;
}> = [
  { id: 'hall-west', x: -7.8, z: 0, outwardX: -1, outwardZ: 0 },
  { id: 'hall-north', x: 0, z: -9.8, outwardX: 0, outwardZ: -1 },
  { id: 'hall-east', x: 7.8, z: 0, outwardX: 1, outwardZ: 0 },
  { id: 'dining-south', x: -4, z: 6.8, outwardX: 0, outwardZ: 1 },
  { id: 'dining-east', x: 7.8, z: 6, outwardX: 1, outwardZ: 0 },
  { id: 'kitchen-west', x: -7.8, z: -6, outwardX: -1, outwardZ: 0 },
  { id: 'upper-north', x: 2, z: -9.8, outwardX: 0, outwardZ: -1 },
  { id: 'upper-east', x: 7.8, z: -4, outwardX: 1, outwardZ: 0 },
];

/** Point doors: position, outward normal (opens toward), cost key. */
export const MANSION_DOORS: ReadonlyArray<{
  id: string;
  x: number;
  z: number;
  outwardX: number;
  outwardZ: number;
  cost: number;
}> = [
  { id: 'to-dining', x: -2, z: 3.8, outwardX: 0, outwardZ: 1, cost: MANSION_DOOR_COSTS.diningHall },
  { id: 'to-upper', x: 4.2, z: 2.5, outwardX: 1, outwardZ: 0, cost: MANSION_DOOR_COSTS.upperFloor },
  { id: 'to-east', x: 6, z: -2, outwardX: 0, outwardZ: -1, cost: MANSION_DOOR_COSTS.eastWing },
];

/** Spawn points per unlocked zone. Zone ids match door ids + 'start'. */
export const MANSION_SPAWNS: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  start: [
    [-12, 0],
    [12, 0],
    [0, -14],
  ],
  'to-dining': [
    [-12, 8],
    [12, 8],
    [-6, 14],
  ],
  'to-upper': [
    [12, 0],
    [14, -6],
  ],
  'to-east': [
    [14, -2],
    [10, -12],
  ],
};

/** Mystery Box location: main hall corner. */
export const MANSION_BOX_PLACEMENT = {
  position: { x: 5.5, y: 0, z: -6.5 },
  yaw: 0.8,
  useRange: 2.4,
  lookDotMin: 0.5,
} as const;
