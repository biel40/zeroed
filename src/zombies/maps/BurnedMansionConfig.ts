import type { TranslationKey } from '../../i18n/i18n';
import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import { NUCLEAR_ENDING_DURATION } from '../ZombiesRunFlow';
import type { ArenaAmbience, ArenaEnding } from './ZombieArena';

/** Pure tuning constants for the Burned Mansion map. */

/**
 * Charred interior: warm smoke haze thick enough to swallow the grounds past
 * the fence, under a cold night sky. The shell's environment light is cut
 * back so the red bulbs and smouldering char, not a neutral sky, shape the
 * rooms (and so a previous map's setting never carries over).
 */
export const MANSION_AMBIENCE = {
  backgroundColor: 0x0d0b0a,
  fog: { color: 0x1a130e, density: 0.03 },
  hemisphereLight: { skyColor: 0x34465e, groundColor: 0x110d0a, intensity: 0.25, reducedIntensity: 0.18 },
  environmentIntensity: { intensity: 0.34, reducedIntensity: 0.3 },
  musicTrack: 'background_music_theme',
} as const satisfies ArenaAmbience;

/** The bunker's warhead: nuclear cinematic, alarm and fallout audio. */
export const MANSION_NUCLEAR_ENDING = {
  presentation: 'nuclear',
  audio: 'nuclear',
  duration: NUCLEAR_ENDING_DURATION,
} as const satisfies ArenaEnding;

/** Door costs in points. */
export const MANSION_DOOR_COSTS = {
  diningHall: 750,
  eastHall: 1250,
  nuclearBunker: 9999,
} as const;

/** Safe player spawn in the expanded south starting room. */
export const MANSION_PLAYER_SPAWN = { x: -3.5, y: 1.72, z: 7.2, floor: 0 } as const;

/** Wall and opening dimensions shared by the shell and its dressing. */
export const MANSION_WALL_THICKNESS = 0.3;
export const MANSION_WALL_HEIGHT = 3.2;
export const MANSION_DOOR_OPENING = { width: 1.6, top: 2.1 } as const;
/** Sill low enough for a zombie body to step through after the boards break. */
export const MANSION_WINDOW_OPENING = { width: 1.5, sill: 0.3, top: 1.9 } as const;
export const BARRIER_CONFIG: WindowBarrierConfig = {
  boardCount: 5,
  boardHp: 100,
  repairInterval: 0.55,
  repairRewardCap: 4,
  sill: MANSION_WINDOW_OPENING.sill,
};

/** Underside of the ground-floor roof slab (center 3.28, thickness 0.16). */
export const MANSION_GROUND_CEILING_Y = 3.2;
/** Underside of the bunker ceiling slab (center -0.22, thickness 0.16). */
export const MANSION_BUNKER_CEILING_Y = -0.3;

/** Shared east-wing topology coordinates. */
export const MANSION_EAST_WALL_X = 9.15;
export const MANSION_BUNKER_DIVIDER_X = 4.2;
export const MANSION_STAIR_CENTER_X = 6.65;
export const MANSION_STAIR_TOP_Z = -3.8;
export const MANSION_STAIR_BOTTOM_Z = -7.3;

/** Ground-floor movement bounds. */
export const MANSION_GROUND_BOUNDS = {
  minX: -6.6,
  maxX: MANSION_EAST_WALL_X - 0.55,
  minZ: -7.6,
  maxZ: 9.6,
} as const;

export const MANSION_SECRET_ROOM = {
  centerX: -9.4,
  centerZ: -4.4,
  width: 4.8,
  depth: 4.6,
  entranceX: -7,
  entranceZ: -4.4,
  entranceWidth: 2,
  boundsMinX: -11.3,
} as const;

/** Large underground bunker bounds, inset by the player body radius. */
export const MANSION_BUNKER_BOUNDS = {
  minX: MANSION_SECRET_ROOM.boundsMinX,
  maxX: MANSION_EAST_WALL_X - 0.65,
  minZ: -9,
  maxZ: 1.5,
} as const;

export const MANSION_BUNKER_Y = -3.4;

export interface MansionAreaLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly intensity: number;
  readonly distance: number;
  readonly floor: 0 | -1;
}

/**
 * Red, failing practical lights: brass chandeliers upstairs, caged
 * bulkheads in the bunker. Each hangs under a real ceiling slab; the stair
 * aperture has none to anchor a cord to.
 */
export const MANSION_AREA_LIGHTS: ReadonlyArray<MansionAreaLight> = [
  { x: -3.8, y: 2.55, z: 6.5, intensity: 2.4, distance: 6.5, floor: 0 },
  { x: -4.5, y: 2.35, z: -4.8, intensity: 1.7, distance: 6.5, floor: 0 },
  { x: 2.1, y: 2.35, z: -4.8, intensity: 1.1, distance: 5.2, floor: 0 },
  { x: 3.4, y: MANSION_BUNKER_Y + 2.45, z: -5.6, intensity: 1.05, distance: 5.5, floor: -1 },
  { x: -1.4, y: MANSION_BUNKER_Y + 2.35, z: -4.6, intensity: 1.35, distance: 7, floor: -1 },
  { x: -5.2, y: MANSION_BUNKER_Y + 2.4, z: -1.6, intensity: 1.15, distance: 6.5, floor: -1 },
  { x: -4.8, y: MANSION_BUNKER_Y + 2.4, z: -6.6, intensity: 0.95, distance: 6, floor: -1 },
];

export const MANSION_RITUAL_CIRCLE = {
  id: 'secret-room-ritual-circle',
  position: {
    x: MANSION_SECRET_ROOM.centerX,
    y: MANSION_BUNKER_Y + 0.02,
    z: MANSION_SECRET_ROOM.centerZ,
  },
  floor: -1,
  useRange: 1.85,
  lookDotMin: 0.2,
} as const;

/** Reach of the wearable gas mask; the dressing hangs it on the bunker's north wall. */
export const MANSION_GAS_MASK_RACK = {
  id: 'bunker-gas-mask',
  floor: -1,
  useRange: 1.6,
  lookDotMin: 0.8,
} as const;

export const SOUL_LAMP_REQUIRED_SOULS = 8;
export const SOUL_LAMP_CAPTURE_RADIUS = 5;

export const MANSION_SOUL_LAMPS = [
  {
    id: 'start-room',
    position: { x: -1.35, y: 1.25, z: 9.78 },
    floor: 0,
    yaw: 0,
    useRange: 2,
    lookDotMin: 0.45,
  },
  {
    id: 'mystery-box-room',
    position: { x: -1.5, y: 1.25, z: -7.78 },
    floor: 0,
    yaw: Math.PI,
    useRange: 2,
    lookDotMin: 0.45,
  },
  {
    id: 'upper-stairs',
    position: { x: 8.82, y: 1.25, z: 0.2 },
    floor: 0,
    yaw: Math.PI / 2,
    useRange: 2,
    lookDotMin: 0.45,
  },
] as const;

export const MANSION_BUNKER_ENDING = {
  id: 'radiation-ending',
  cost: 30000,
  ending: MANSION_NUCLEAR_ENDING,
  position: { x: -11.635, y: MANSION_BUNKER_Y + 1.55, z: MANSION_SECRET_ROOM.centerZ },
  floor: -1,
  useRange: 2.1,
  lookDotMin: 0.5,
  requiredDoorId: 'nuclear-bunker',
} as const;

export const MANSION_SPECIAL_WEAPON_CASES = [
  {
    id: 'bunker-raygun',
    weaponId: 'raygun' as const,
    cost: 6000,
    requiredKills: 200,
    interactionLabel: 'RAY GUN — 6000',
    position: { x: -2.2, y: MANSION_BUNKER_Y + 1.1, z: -2.35 },
    useRange: 2,
    lookDotMin: 0.42,
  },
  {
    id: 'bunker-zeus',
    weaponId: 'tesla' as const,
    cost: 10000,
    requiredKills: 300,
    interactionLabel: 'ZEUS-77 — 10000',
    position: { x: -2.2, y: MANSION_BUNKER_Y + 1.1, z: -6.05 },
    useRange: 2,
    lookDotMin: 0.42,
  },
] as const;

export const MANSION_AMMO_REFILLS = [
  {
    id: 'start-ammo-refill',
    cost: 800,
    labelKey: 'arena.refillAmmo',
    position: { x: MANSION_EAST_WALL_X - 0.9, y: 0.45, z: 9.45 },
    floor: 0,
    useRange: 1.9,
    lookDotMin: 0.4,
  },
] as const;

export const MANSION_SECRET_AREAS = [
  {
    id: 'nuclear_bunker',
    doorId: 'nuclear-bunker',
    unlockCost: MANSION_DOOR_COSTS.nuclearBunker,
    prompt: 'door.openBunker',
    floor: -1,
    rewards: MANSION_SPECIAL_WEAPON_CASES,
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
  { id: 'start-south', x: -3.5, z: 10.15, outwardX: 0, outwardZ: 1, zone: 'start' },
  { id: 'start-south-west', x: -5.5, z: 10.15, outwardX: 0, outwardZ: 1, zone: 'start' },
  { id: 'box-west', x: -7.15, z: -3.2, outwardX: -1, outwardZ: 0, zone: 'to-dining' },
  { id: 'box-north', x: -3.5, z: -8.15, outwardX: 0, outwardZ: -1, zone: 'to-dining' },
  { id: 'box-north-west', x: -5.5, z: -8.15, outwardX: 0, outwardZ: -1, zone: 'to-dining' },
  { id: 'east-hall-north', x: 1.6, z: -8.15, outwardX: 0, outwardZ: -1, zone: 'to-east-hall' },
  { id: 'bunker-east', x: MANSION_EAST_WALL_X, z: -2.5, outwardX: 1, outwardZ: 0, zone: 'nuclear-bunker' },
];

/** The sealed nuclear bunker door: a steel blast door with its own hazard-striped frame. */
export const MANSION_BLAST_DOOR_ID = 'nuclear-bunker';

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
  prompt?: TranslationKey;
  requiredMessage?: TranslationKey;
}> = [
  { id: 'to-dining', x: -3.5, z: 2, outwardX: 0, outwardZ: -1, cost: MANSION_DOOR_COSTS.diningHall, y: 0, floor: 0 },
  { id: 'to-east-hall', x: 0, z: -2.5, outwardX: 1, outwardZ: 0, cost: MANSION_DOOR_COSTS.eastHall, y: 0, floor: 0 },
  {
    id: MANSION_BLAST_DOOR_ID,
    x: MANSION_BUNKER_DIVIDER_X,
    z: -2.5,
    outwardX: 1,
    outwardZ: 0,
    cost: MANSION_DOOR_COSTS.nuclearBunker,
    y: 0,
    floor: 0,
    prompt: 'door.openBunker',
    requiredMessage: 'door.bunkerRequired',
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
    // Same starting-room wall as the M1911, on its long eastern span.
    id: 'start-l96',
    weaponId: 'l96',
    price: 1250,
    ammoPrice: 625,
    position: { x: 4.6, y: 1.45, z: 2.17 },
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
    position: { x: MANSION_BUNKER_DIVIDER_X - 0.17, y: 1.45, z: -5.4 },
    yaw: -Math.PI / 2,
    floor: 0,
  },
  {
    // Bunker east wall south of the stairwell: the stair side walls cover
    // this wall between MANSION_STAIR_BOTTOM_Z and MANSION_STAIR_TOP_Z.
    id: 'bunker-m60',
    weaponId: 'm60',
    price: 2500,
    ammoPrice: 1250,
    position: { x: MANSION_EAST_WALL_X - 0.32, y: MANSION_BUNKER_Y + 1.45, z: -1.5 },
    yaw: -Math.PI / 2,
    floor: -1,
  },
];

/** Spawn points per unlocked zone. Zone ids match door ids + 'start'. */
export const MANSION_SPAWNS: Readonly<Record<string, ReadonlyArray<ZombieSpawnPoint>>> = {
  start: [
    { x: -14, z: 5.4, barrierId: 'start-west-a', approachX: -8.05, approachZ: 5.4, breachX: -6.55, breachZ: 5.4, exterior: true },
    { x: -14, z: 3.2, barrierId: 'start-west-b', approachX: -8.05, approachZ: 3.2, breachX: -6.55, breachZ: 3.2, exterior: true },
    { x: -3.5, z: 18, barrierId: 'start-south', approachX: -3.5, approachZ: 11.05, breachX: -3.5, breachZ: 9.55, exterior: true },
    { x: -5.5, z: 18, barrierId: 'start-south-west', approachX: -5.5, approachZ: 11.05, breachX: -5.5, breachZ: 9.55, exterior: true },
  ],
  'to-dining': [
    { x: -14, z: -3.2, barrierId: 'box-west', approachX: -8.05, approachZ: -3.2, breachX: -6.55, breachZ: -3.2, exterior: true },
    { x: -3.5, z: -16, barrierId: 'box-north', approachX: -3.5, approachZ: -9.05, breachX: -3.5, breachZ: -7.55, exterior: true },
    { x: -5.5, z: -16, barrierId: 'box-north-west', approachX: -5.5, approachZ: -9.05, breachX: -5.5, breachZ: -7.55, exterior: true },
  ],
  'to-east-hall': [
    { x: 1.6, z: -16, barrierId: 'east-hall-north', approachX: 1.6, approachZ: -9.05, breachX: 1.6, breachZ: -7.55, exterior: true },
  ],
  'nuclear-bunker': [
    {
      x: 16,
      z: -2.5,
      barrierId: 'bunker-east',
      approachX: MANSION_EAST_WALL_X + 0.9,
      approachZ: -2.5,
      breachX: MANSION_EAST_WALL_X - 0.6,
      breachZ: -2.5,
      exterior: true,
    },
  ],
};

/** Mystery Box in the room immediately behind the first paid door. */
export const MANSION_BOX_PLACEMENT = {
  position: { x: -5.2, y: 0, z: -5.6 },
  yaw: -Math.PI / 2,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
} as const;

export const DEBUG_MAP_COLLIDERS = false;
