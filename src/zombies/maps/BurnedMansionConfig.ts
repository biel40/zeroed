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

/** Door costs in points. `diningHall` is the legacy key of the Mystery Box room's door. */
export const MANSION_DOOR_COSTS = {
  diningHall: 750,
  banquetHall: 1000,
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

/**
 * Great dining hall north of the Mystery Box room and the east hall, as wall
 * centre lines: its south wall is the old north facade, pierced by the doors
 * from both rooms, and its east wall continues the bunker divider. The
 * furniture footprints are shared by the arena's colliders and the dressing.
 */
const BANQUET_NORTH_Z = -17.75;
export const MANSION_BANQUET_HALL = {
  minX: -7.15,
  maxX: MANSION_BUNKER_DIVIDER_X,
  southZ: -8.15,
  northZ: BANQUET_NORTH_Z,
  /**
   * Centre of the east window, far enough from the stair room's outer corner
   * for the zombies queueing outside it.
   */
  eastWindowZ: BANQUET_NORTH_Z + 2.4,
  /** Long table together with the chairs around it. */
  table: { x: -1.5, z: -12.95, width: 5.7, depth: 2.1, height: 1 },
  /** Sideboard against the north wall, between its two windows. */
  sideboard: { x: -1.45, z: BANQUET_NORTH_Z + 0.4, width: 2.2, depth: 0.5, height: 0.95 },
  /** Glazed china cabinet against the south wall, between its two doors. */
  chinaCabinet: { x: -1, z: -8.53, width: 1.4, depth: 0.45, height: 2.1 },
  /**
   * Full-height chimney breast standing out of the east wall to `frontX`;
   * the fireplace surround is centred on its front face.
   */
  chimney: { frontX: MANSION_BUNKER_DIVIDER_X - 0.55, z: -12, breadth: 2.3, surroundWidth: 1.7 },
} as const;

/**
 * Easter egg for Pokémon's Burned Tower: opening the banquet door rarely
 * shows a ghost over the head of the table, in line with the doorway,
 * drifting `driftX` toward the west wall before it fades.
 */
export const MANSION_BANQUET_GHOST = {
  doorId: 'to-banquet',
  chance: 0.05,
  durationSeconds: 2.6,
  position: { x: -3.6, y: 1.65, z: MANSION_BANQUET_HALL.table.z },
  driftX: -1.5,
  size: 1.2,
} as const;

/** Ground-floor movement bounds. */
export const MANSION_GROUND_BOUNDS = {
  minX: -6.6,
  maxX: MANSION_EAST_WALL_X - 0.55,
  minZ: MANSION_BANQUET_HALL.northZ + 0.7,
  maxZ: 9.6,
} as const;

/** True when (x, z) lies clear of the outer faces of the house and its banquet wing. */
export function isOutsideMansion(x: number, z: number): boolean {
  const outsideMain = x < -7.45 || x > MANSION_EAST_WALL_X + 0.3 || z < -8.45 || z > 10.45;
  const insideBanquet = x > MANSION_BANQUET_HALL.minX - 0.3 && x < MANSION_BANQUET_HALL.maxX + 0.3
    && z > MANSION_BANQUET_HALL.northZ - 0.3 && z < MANSION_BANQUET_HALL.southZ;
  return outsideMain && !insideBanquet;
}

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
  // Over the banquet table.
  { x: MANSION_BANQUET_HALL.table.x, y: 2.35, z: MANSION_BANQUET_HALL.table.z, intensity: 1.9, distance: 7.5, floor: 0 },
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
  { id: 'box-west-south', x: -7.15, z: 0.3, outwardX: -1, outwardZ: 0, zone: 'to-dining' },
  { id: 'banquet-north-west', x: -5.3, z: MANSION_BANQUET_HALL.northZ, outwardX: 0, outwardZ: -1, zone: 'to-banquet' },
  { id: 'banquet-north-east', x: 2.4, z: MANSION_BANQUET_HALL.northZ, outwardX: 0, outwardZ: -1, zone: 'to-banquet' },
  { id: 'banquet-east', x: MANSION_BANQUET_HALL.maxX, z: MANSION_BANQUET_HALL.eastWindowZ, outwardX: 1, outwardZ: 0, zone: 'to-banquet' },
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
  // Both rooms north of the start room open into the banquet hall, the only way on to the bunker.
  { id: 'to-banquet', x: -3.8, z: MANSION_BANQUET_HALL.southZ, outwardX: 0, outwardZ: -1, cost: MANSION_DOOR_COSTS.banquetHall, y: 0, floor: 0 },
  { id: 'to-east-hall', x: 1.9, z: MANSION_BANQUET_HALL.southZ, outwardX: 0, outwardZ: 1, cost: MANSION_DOOR_COSTS.eastHall, y: 0, floor: 0 },
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
    // Banquet hall west wall, facing the long table.
    id: 'banquet-vector',
    weaponId: 'vector',
    price: 1200,
    ammoPrice: 600,
    position: { x: MANSION_BANQUET_HALL.minX + 0.17, y: 1.45, z: MANSION_BANQUET_HALL.table.z },
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

/** Banquet north windows: spawn, approach and breach lines. */
const BANQUET_SPAWN_Z = MANSION_BANQUET_HALL.northZ - 7;
const BANQUET_APPROACH_Z = MANSION_BANQUET_HALL.northZ - 0.9;
const BANQUET_BREACH_Z = MANSION_BANQUET_HALL.northZ + 0.6;

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
    { x: -14, z: 0.3, barrierId: 'box-west-south', approachX: -8.05, approachZ: 0.3, breachX: -6.55, breachZ: 0.3, exterior: true },
  ],
  // The east hall has no outer wall left: its zombies come in through the banquet hall.
  'to-banquet': [
    { x: -5.3, z: BANQUET_SPAWN_Z, barrierId: 'banquet-north-west', approachX: -5.3, approachZ: BANQUET_APPROACH_Z, breachX: -5.3, breachZ: BANQUET_BREACH_Z, exterior: true },
    { x: 2.4, z: BANQUET_SPAWN_Z, barrierId: 'banquet-north-east', approachX: 2.4, approachZ: BANQUET_APPROACH_Z, breachX: 2.4, breachZ: BANQUET_BREACH_Z, exterior: true },
    {
      x: 14,
      z: MANSION_BANQUET_HALL.eastWindowZ,
      barrierId: 'banquet-east',
      approachX: MANSION_BANQUET_HALL.maxX + 0.9,
      approachZ: MANSION_BANQUET_HALL.eastWindowZ,
      breachX: MANSION_BANQUET_HALL.maxX - 0.6,
      breachZ: MANSION_BANQUET_HALL.eastWindowZ,
      exterior: true,
    },
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
