import { POINT_DOOR_SIZE } from '../doors/PointDoor';
import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { QualityLevel } from '../../core/DeviceProfile';
import { entranceSpawn, type WallCut } from './shared/EntrancePassage';
import type { ArenaAmbience, MysteryBoxPlacement, PlayerBounds, ZombieNavigationBounds } from './ZombieArena';

/**
 * La Seu layout data. Every coordinate is in metres, feet height 0 on the
 * nave floor.
 *
 * AXIS PLAN (later phases grow around what exists without moving it):
 * - Z is the cathedral's long axis. The main front stands on z = 0; the nave
 *   runs north from it (z < 0) to the chancel arch, and the chancel (the
 *   Capella Reial) closes the building further north. The map's "north" is
 *   the liturgical east: the great rose window hangs over the chancel arch.
 * - The nave is three aisles wide: the central one between the column rows
 *   at x = ±NAVE.columnX, a side aisle beyond each row out to the walls.
 * - The entrance plaza lies south of the front (z > 0), closed by its side
 *   walls and by the parapet over the sea. Everything beyond the parapet is
 *   scenery (`PlazaVista`): the bay, the moon and the Almudaina's outline.
 * - Zombie entrances run LA_SEU_PASSAGE.length outward from their wall:
 *   later zones (side chapels, cloister, bell tower, the Almudaina, Parc de
 *   la Mar) must leave those footprints free or re-route the entrance.
 */

export const LA_SEU_WALL_THICKNESS = 0.3;
const HALF_WALL = LA_SEU_WALL_THICKNESS / 2;

/** Interior faces of the nave; walls are centred half a thickness outside. */
export const NAVE = {
  minX: -14,
  maxX: 14,
  minZ: -49,
  maxZ: 0,
  /** Column rows either side of the central aisle. */
  columnX: 6.5,
  bayLength: 7,
  bays: 7,
  /** Capitals: where the arcade and the side-aisle vaults spring. */
  aisleSpringY: 11,
  aisleApexY: 14.5,
  /** Spring and crown of the central vault, above the clerestory. */
  naveSpringY: 17,
  naveApexY: 23,
  /** Side walls rise past the aisle vault; end walls past the central one. */
  sideWallHeight: 14.7,
  endWallHeight: 23.3,
} as const;

/** Circumradius of the octagonal shafts: very slender for their height, as in Palma. */
export const NAVE_COLUMN = { radius: 0.85, baseHeight: 0.9, capitalHeight: 0.7 } as const;

/** Z of bay line `index`: 0 is the front wall, NAVE.bays the chancel arch. */
export function naveBayLine(index: number): number {
  return NAVE.maxZ - index * NAVE.bayLength;
}

/** Z of the middle of bay `index` (0 is the bay behind the front). */
export function naveBayCenter(index: number): number {
  return naveBayLine(index) - NAVE.bayLength / 2;
}

/** Column lines: every bay line between the two end walls. */
export const NAVE_COLUMN_ZS: ReadonlyArray<number> = Array.from({ length: NAVE.bays - 1 }, (_, index) => naveBayLine(index + 1));

/** The chancel behind the arch: as wide as the central aisle, lower than the nave. */
export const CHANCEL = {
  minX: -6,
  maxX: 6,
  minZ: -59,
  maxZ: NAVE.minZ,
  springY: 9,
  apexY: 13,
  wallHeight: 13.2,
} as const;

/** The entrance plaza in front of the main front, as wide as the nave. */
export const PLAZA = {
  minX: NAVE.minX,
  maxX: NAVE.maxX,
  /** Outer face of the front wall. */
  minZ: NAVE.maxZ + LA_SEU_WALL_THICKNESS,
  maxZ: 17,
  wallHeight: 5,
  parapetHeight: 1.1,
} as const;

/** Walkable rooms, for placement checks. */
export const LA_SEU_ROOMS = [NAVE, CHANCEL, PLAZA] as const;

const WEST_WALL_X = NAVE.minX - HALF_WALL;
const EAST_WALL_X = NAVE.maxX + HALF_WALL;
/** Centre line of the main front, between the nave and the plaza. */
const FRONT_WALL_Z = NAVE.maxZ + HALF_WALL;
const CHANCEL_EAST_WALL_X = CHANCEL.maxX + HALF_WALL;

/**
 * The great doors of the main front: closed for good, with the wicket (the
 * paid door) cut through them. Leaves below a carved tympanum.
 */
export const MAIN_PORTAL = { width: 4.2, leafHeight: 4.6, apexY: 6.6 } as const;

/** Rose windows: the great one over the chancel arch and the front's own. */
export const ROSE_WINDOWS = {
  chancel: { y: 18.4, radius: 3.2 },
  front: { y: 15.6, radius: 2.8 },
} as const;

/** Lancet windows of the side walls (one per bay) and of the chancel's end wall. */
export const LANCET = {
  aisle: { width: 1.5, sillY: 5, shoulderY: 10, apexY: 12 },
  chancel: { width: 1.3, sillY: 4, shoulderY: 9.2, apexY: 11, xs: [-3.6, 0, 3.6] },
} as const;

/** Board tuning shared with the other maps' balance. */
export const LA_SEU_BARRIER_CONFIG: WindowBarrierConfig = {
  boardCount: 5,
  boardHp: 100,
  repairInterval: 0.55,
  repairRewardCap: 4,
};

/** Wall apertures by entrance: doors are walk-through, chapel windows keep a low sill. */
export const LA_SEU_OPENINGS = {
  door: { width: 1.5, bottom: 0, top: 2.2 },
  window: { width: 1.5, bottom: 0.3, top: 1.9 },
} as const;

export type LaSeuEntranceKind = keyof typeof LA_SEU_OPENINGS;

/** `nave` holds the chancel too; `plaza` opens with the wicket in the great doors. */
export type LaSeuZoneId = 'nave' | 'plaza';

export const LA_SEU_START_ZONE: LaSeuZoneId = 'nave';

export interface LaSeuEntrance {
  readonly id: string;
  /** Centre of the opening on the wall's centre line. */
  readonly x: number;
  readonly z: number;
  /** Outward normal: the side its zombies come from. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly kind: LaSeuEntranceKind;
  /** Zone whose unlock wakes this entrance. */
  readonly zone: LaSeuZoneId;
}

/**
 * Zombie entrances. The nave's are staggered along both side walls so the
 * horde arrives through either side aisle, plus the sacristy door beside the
 * altar; the plaza adds a gate in each of its side walls.
 */
export const LA_SEU_ENTRANCES: ReadonlyArray<LaSeuEntrance> = [
  { id: 'nave-almoina-door', x: WEST_WALL_X, z: naveBayCenter(1), outwardX: -1, outwardZ: 0, kind: 'door', zone: 'nave' },
  { id: 'nave-mirador-door', x: EAST_WALL_X, z: naveBayCenter(3), outwardX: 1, outwardZ: 0, kind: 'door', zone: 'nave' },
  { id: 'nave-west-chapel', x: WEST_WALL_X, z: naveBayCenter(5), outwardX: -1, outwardZ: 0, kind: 'window', zone: 'nave' },
  { id: 'nave-east-chapel', x: EAST_WALL_X, z: naveBayCenter(6), outwardX: 1, outwardZ: 0, kind: 'window', zone: 'nave' },
  { id: 'chancel-sacristy', x: CHANCEL_EAST_WALL_X, z: -54, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'nave' },
  { id: 'plaza-almudaina-gate', x: WEST_WALL_X, z: 10, outwardX: -1, outwardZ: 0, kind: 'door', zone: 'plaza' },
  { id: 'plaza-palau-gate', x: EAST_WALL_X, z: 6.5, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'plaza' },
];

export interface LaSeuDoor {
  readonly id: string;
  /** Centre of the door on its wall's centre line. */
  readonly x: number;
  readonly z: number;
  /** Towards the zone it opens: debris bursts that way. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly cost: number;
  readonly zone: LaSeuZoneId;
}

/** The wicket in the great doors, the only way out to the plaza. */
export const LA_SEU_DOORS: ReadonlyArray<LaSeuDoor> = [
  { id: 'to-plaza', x: 0, z: FRONT_WALL_Z, outwardX: 0, outwardZ: 1, cost: 1000, zone: 'plaza' },
];

const DOOR_OPENING = { width: POINT_DOOR_SIZE.width, bottom: 0, top: POINT_DOOR_SIZE.height } as const;

/** Every hole the entrances and doors cut in the walls, shared by all shells. */
export const LA_SEU_WALL_CUTS: ReadonlyArray<WallCut> = [
  ...LA_SEU_ENTRANCES.map((entrance) => ({ x: entrance.x, z: entrance.z, opening: LA_SEU_OPENINGS[entrance.kind] })),
  ...LA_SEU_DOORS.map((door) => ({ x: door.x, z: door.z, opening: DOOR_OPENING })),
];

/** Dead-end passage behind every entrance, where its zombies appear. */
export const LA_SEU_PASSAGE = {
  length: 6,
  width: { door: 2.2, window: 1.8 },
  height: { door: 2.6, window: 2.2 },
  /** Distance from the wall centre line to the spawn, along the outward normal. */
  spawnDepth: 4.6,
  /** Exterior waiting point in front of the boards. */
  approachDepth: 0.9,
  /** First point inside once the boards are gone. */
  breachDepth: 0.6,
} as const;

function spawnsOf(zone: LaSeuZoneId): ReadonlyArray<ZombieSpawnPoint> {
  return LA_SEU_ENTRANCES.filter((entrance) => entrance.zone === zone).map((entrance) => entranceSpawn(entrance, LA_SEU_PASSAGE));
}

/** Spawn points per unlocked zone, one at the end of each entrance passage. */
export const LA_SEU_SPAWNS: Readonly<Record<LaSeuZoneId, ReadonlyArray<ZombieSpawnPoint>>> = {
  nave: spawnsOf('nave'),
  plaza: spawnsOf('plaza'),
};

/** Weapon outlines 2 cm in front of the wall face. */
export const LA_SEU_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    // Beside the great doors, in reach from the first round.
    id: 'nave-m14',
    weaponId: 'm14',
    price: 800,
    ammoPrice: 625,
    position: { x: NAVE.minX + 0.02, y: 1.45, z: naveBayCenter(0) },
    yaw: Math.PI / 2,
    floor: 0,
  },
  {
    // The far end of the nave: the rifle hangs in the chancel, facing the sacristy door.
    id: 'chancel-ak47',
    weaponId: 'ak47',
    price: 1750,
    ammoPrice: 900,
    position: { x: CHANCEL.minX + 0.02, y: 1.45, z: -52.4 },
    yaw: Math.PI / 2,
    floor: 0,
  },
  {
    // The reward for opening the wicket, on the front itself.
    id: 'plaza-m60',
    weaponId: 'm60',
    price: 2500,
    ammoPrice: 1250,
    position: { x: -7.2, y: 1.45, z: PLAZA.minZ + 0.02 },
    yaw: 0,
    floor: 0,
  },
];

/** The plaza's crate, against the front east of the great doors, facing the sea. */
export const LA_SEU_BOX_PLACEMENT: MysteryBoxPlacement = {
  position: { x: 7.4, y: 0, z: PLAZA.minZ + 0.6 },
  yaw: Math.PI,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
};

/** Just inside the great doors, on the central aisle, looking at the altar. */
export const LA_SEU_PLAYER_SPAWN = { x: 0, y: 1.72, z: -3.6, floor: 0 } as const;

/**
 * One rectangle over the nave, the chancel and the plaza, inset by the body
 * radius: walls and the closed wicket keep the player out of what is not
 * open yet, and the arena stops them at every walk-through entrance.
 */
export const LA_SEU_PLAYER_BOUNDS: PlayerBounds = {
  minX: NAVE.minX + 0.4,
  maxX: NAVE.maxX - 0.4,
  minZ: CHANCEL.minZ + 0.4,
  maxZ: PLAZA.maxZ - 0.4,
};

const PASSAGE_REACH = HALF_WALL + LA_SEU_PASSAGE.length + LA_SEU_WALL_THICKNESS + 0.3;

/** Every room plus every entrance passage. Walls longer than the zombie obstacle limit (20 m) are built in pieces. */
export const LA_SEU_NAVIGATION_BOUNDS: ReadonlyArray<ZombieNavigationBounds> = [
  {
    floor: 0,
    minX: WEST_WALL_X - PASSAGE_REACH,
    maxX: EAST_WALL_X + PASSAGE_REACH,
    minZ: CHANCEL.minZ - LA_SEU_WALL_THICKNESS - 0.3,
    maxZ: PLAZA.maxZ + LA_SEU_WALL_THICKNESS + 0.3,
    baseY: 0,
  },
];

/**
 * Night in an unlit cathedral: thin blue haze that lets the vault be read
 * from the floor and swallows the far end of the nave.
 */
export const LA_SEU_AMBIENCE = {
  backgroundColor: 0x05070e,
  fog: { color: 0x070a13, density: 0.021 },
  hemisphereLight: { skyColor: 0x56648a, groundColor: 0x1c1610, intensity: 0.5, reducedIntensity: 0.72 },
  // Candles, glass and the moon shape the space; the shell's sky-like fill barely reaches in.
  environmentIntensity: { intensity: 0.14, reducedIntensity: 0.18 },
  musicTrack: 'background_music_theme',
  ambientBed: 'wind',
} as const satisfies ArenaAmbience;

/** Unshadowed moonlight from over the bay (south-east), grazing so it models walls and shafts more than floors. */
export const LA_SEU_MOON = {
  color: 0x93a9d6,
  intensity: 0.42,
  reducedIntensity: 0.34,
  /** Where the moon hangs in the sky, seen from the plaza. */
  position: { x: 46, y: 62, z: 150 },
  /** Direction the light travels. */
  direction: { x: -0.42, y: -0.5, z: -0.76 },
} as const;

const CANDLE_COLOR = 0xffb469;
const MOON_GLASS_COLOR = 0x86a4ff;
const ROSE_GLASS_COLOR = 0xd268c8;
const LANTERN_COLOR = 0xffc27a;

export interface LaSeuLightSite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  /** Candle flames waver; glass and moon glows hold still. */
  readonly flicker: boolean;
}

/** Hanging height of the wrought-iron candle rings round the columns. */
export const COLUMN_RING_Y = 4.4;

/** Columns that still carry lit candles on their rings, by row side and column index. */
export const LIT_COLUMN_RINGS: ReadonlyArray<{ readonly side: -1 | 1; readonly column: number }> = [
  { side: -1, column: 0 }, { side: 1, column: 1 }, { side: -1, column: 2 },
  { side: 1, column: 3 }, { side: -1, column: 4 }, { side: 1, column: 5 },
];

/** The altar: a stone table on its dais under the hanging canopy. */
export const ALTAR = { x: 0, z: -55.2, daisWidth: 5.2, daisDepth: 2.8, daisHeight: 0.3, tableWidth: 3.2, tableDepth: 1.1, tableHeight: 1.05, canopyY: 6.2 } as const;

/** Votive candle racks against the side walls. */
export const VOTIVE_RACKS: ReadonlyArray<{ readonly id: string; readonly side: -1 | 1; readonly z: number }> = [
  { id: 'votive-west', side: -1, z: naveBayCenter(3) },
  { id: 'votive-east', side: 1, z: naveBayCenter(1) },
];

/**
 * Every place a real light may burn. The lighting keeps only the quality
 * budget's worth alive, the ones nearest the player; the rest glow through
 * emissive glass and flames.
 */
export const LA_SEU_LIGHT_SITES: ReadonlyArray<LaSeuLightSite> = [
  { id: 'entry-moon', x: 0, y: 4.2, z: -2.4, color: MOON_GLASS_COLOR, intensity: 7, distance: 13, flicker: false },
  ...LIT_COLUMN_RINGS.map(({ side, column }) => ({
    id: `ring-${side < 0 ? 'west' : 'east'}-${column}`,
    x: side * (NAVE.columnX - 1.5),
    y: COLUMN_RING_Y - 0.3,
    z: NAVE_COLUMN_ZS[column],
    color: CANDLE_COLOR,
    intensity: 9,
    distance: 13,
    flicker: true,
  })),
  ...VOTIVE_RACKS.map((rack) => ({
    id: rack.id, x: rack.side * (NAVE.maxX - 1.3), y: 1.7, z: rack.z, color: CANDLE_COLOR, intensity: 5, distance: 8, flicker: true,
  })),
  { id: 'altar-candles', x: ALTAR.x, y: 2.4, z: ALTAR.z + 1.2, color: CANDLE_COLOR, intensity: 12, distance: 14, flicker: true },
  { id: 'chancel-rose', x: 0, y: 9, z: NAVE.minZ + 5, color: ROSE_GLASS_COLOR, intensity: 14, distance: 18, flicker: false },
  { id: 'plaza-lantern-west', x: -4.7, y: 3.3, z: PLAZA.minZ + 1.7, color: LANTERN_COLOR, intensity: 9, distance: 11, flicker: true },
  { id: 'plaza-lantern-east', x: 4.7, y: 3.3, z: PLAZA.minZ + 1.7, color: LANTERN_COLOR, intensity: 9, distance: 11, flicker: true },
  { id: 'plaza-lamp-west', x: -9.5, y: 3.9, z: 12.2, color: LANTERN_COLOR, intensity: 10, distance: 12, flicker: false },
  { id: 'plaza-lamp-east', x: 9.5, y: 3.9, z: 12.2, color: LANTERN_COLOR, intensity: 10, distance: 12, flicker: false },
];

/** State of the pews of one bay on one side of the central aisle. */
export type PewBlockState = 'rows' | 'toppled' | 'cleared';

export interface PewBlock {
  readonly bay: number;
  readonly side: -1 | 1;
  readonly state: PewBlockState;
}

/** Rows of a pew block and the footprint its solid covers (centred on its bay). */
export const PEW = { length: 3.4, innerX: 1.3, rows: 4, rowSpacing: 1.1, depth: 0.6, blockDepth: 4, solidHeight: 0.95 } as const;

/**
 * Pews fill the central aisle from the second bay to the crossing, leaving a
 * cross-aisle at every column line. Whoever held out here dragged one block
 * into a barricade and cleared another: those gaps are the open ground of
 * the fight.
 */
export const PEW_BLOCKS: ReadonlyArray<PewBlock> = [
  { bay: 1, side: -1, state: 'toppled' }, { bay: 1, side: 1, state: 'rows' },
  { bay: 2, side: -1, state: 'rows' }, { bay: 2, side: 1, state: 'rows' },
  { bay: 3, side: -1, state: 'rows' }, { bay: 3, side: 1, state: 'cleared' },
  { bay: 4, side: -1, state: 'rows' }, { bay: 4, side: 1, state: 'rows' },
  { bay: 5, side: -1, state: 'cleared' }, { bay: 5, side: 1, state: 'toppled' },
];

/** Dust motes drifting in the nave, per quality tier. */
export const LA_SEU_DUST_COUNT: Readonly<Record<QualityLevel, number>> = { low: 90, medium: 180, high: 340, ultraMax: 520 };
