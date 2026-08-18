import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { WallBuyConfig } from '../wallbuys/WallBuy';

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
  eastHall: 1250,
  nuclearBunker: 9999,
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

/** Large underground bunker bounds, inset by the player body radius. */
export const MANSION_BUNKER_BOUNDS = {
  minX: -2.7,
  maxX: 6.5,
  minZ: -7.5,
  maxZ: 0.5,
} as const;

export const MANSION_BUNKER_Y = -3.4;

export const MANSION_SECRET_AREAS = [
  {
    id: 'nuclear_bunker',
    doorId: 'nuclear-bunker',
    unlockCost: MANSION_DOOR_COSTS.nuclearBunker,
    prompt: 'Open sealed bunker',
    floor: -1,
    rewards: [
      {
        id: 'bunker-raygun',
        weaponId: 'raygun' as const,
        position: { x: -1.2, y: MANSION_BUNKER_Y + 1.05, z: -2.2 },
        useRange: 1.8,
        lookDotMin: 0.45,
      },
      {
        id: 'bunker-zeus',
        weaponId: 'tesla' as const,
        position: { x: -1.7, y: MANSION_BUNKER_Y + 1.25, z: -6.1 },
        useRange: 1.9,
        lookDotMin: 0.42,
      },
    ],
  },
] as const;

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
  { id: 'east-hall-north', x: 1.6, z: -8.15, outwardX: 0, outwardZ: -1, zone: 'to-east-hall' },
  { id: 'bunker-east', x: 7.15, z: -2.5, outwardX: 1, outwardZ: 0, zone: 'nuclear-bunker' },
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
  prompt?: string;
  requiredMessage?: string;
}> = [
  { id: 'to-dining', x: -3.5, z: 2, outwardX: 0, outwardZ: -1, cost: MANSION_DOOR_COSTS.diningHall, y: 0, floor: 0 },
  { id: 'to-east-hall', x: 0, z: -2.5, outwardX: 1, outwardZ: 0, cost: MANSION_DOOR_COSTS.eastHall, y: 0, floor: 0 },
  {
    id: 'nuclear-bunker',
    x: 3.2,
    z: -2.5,
    outwardX: 1,
    outwardZ: 0,
    cost: MANSION_DOOR_COSTS.nuclearBunker,
    y: 0,
    floor: 0,
    prompt: 'Open sealed bunker',
    requiredMessage: '9999 PTS REQUIRED',
  },
];

/** Weapon outlines sit 2 cm in front of the interior wall face. */
export const MANSION_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    id: 'start-m1911',
    weaponId: 'm1911',
    price: 500,
    ammoPrice: 250,
    position: { x: -1.2, y: 1.45, z: 2.17 },
    yaw: 0,
    floor: 0,
  },
  {
    id: 'box-ak47',
    weaponId: 'ak47',
    price: 1750,
    ammoPrice: 900,
    position: { x: -6.98, y: 1.45, z: -5.4 },
    yaw: Math.PI / 2,
    floor: 0,
  },
  {
    id: 'east-hall-m4a1',
    weaponId: 'm4a1',
    price: 1500,
    ammoPrice: 750,
    position: { x: 3.03, y: 1.45, z: -5.4 },
    yaw: -Math.PI / 2,
    floor: 0,
  },
  {
    id: 'bunker-m60',
    weaponId: 'm60',
    price: 2500,
    ammoPrice: 1250,
    position: { x: 6.42, y: MANSION_BUNKER_Y + 1.45, z: -5.7 },
    yaw: -Math.PI / 2,
    floor: -1,
  },
];

/** Spawn points per unlocked zone. Zone ids match door ids + 'start'. */
export const MANSION_SPAWNS: Readonly<Record<string, ReadonlyArray<ZombieSpawnPoint>>> = {
  start: [
    { x: -14, z: 5.4, barrierId: 'start-west-a', approachX: -8.05, approachZ: 5.4, breachX: -6.55, breachZ: 5.4, exterior: true },
    { x: -14, z: 3.2, barrierId: 'start-west-b', approachX: -8.05, approachZ: 3.2, breachX: -6.55, breachZ: 3.2, exterior: true },
    { x: -3.5, z: 16, barrierId: 'start-south', approachX: -3.5, approachZ: 9.05, breachX: -3.5, breachZ: 7.55, exterior: true },
  ],
  'to-dining': [
    { x: -14, z: -3.2, barrierId: 'box-west', approachX: -8.05, approachZ: -3.2, breachX: -6.55, breachZ: -3.2, exterior: true },
    { x: -3.5, z: -16, barrierId: 'box-north', approachX: -3.5, approachZ: -9.05, breachX: -3.5, breachZ: -7.55, exterior: true },
  ],
  'to-east-hall': [
    { x: 1.6, z: -16, barrierId: 'east-hall-north', approachX: 1.6, approachZ: -9.05, breachX: 1.6, breachZ: -7.55, exterior: true },
  ],
  'nuclear-bunker': [
    { x: 14, z: -2.5, barrierId: 'bunker-east', approachX: 8.05, approachZ: -2.5, breachX: 6.55, breachZ: -2.5, exterior: true },
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
