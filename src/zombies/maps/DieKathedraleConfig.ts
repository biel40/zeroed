import { POINT_DOOR_SIZE } from '../doors/PointDoor';
import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { ZombieSkinShare } from '../skins/ZombieSkinShares';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { ZombieEyeColors } from '../ZombieVisual';
import type { QualityLevel } from '../../core/DeviceProfile';
import type { AmbientEventTiming } from './shared/AmbientEventScheduler';
import type { WallAxis } from './shared/ArenaStructure';
import { entranceSpawn, type WallCut } from './shared/EntrancePassage';
import type { ArenaAmbience, ArenaAmbientCue, ArenaIntro, MysteryBoxPlacement, PlayerBounds, ZombieNavigationBounds } from './ZombieArena';

/**
 * Die Kathedrale layout data. Every coordinate is in metres, feet height 0 on the
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
 * - Zombie entrances run DIE_KATHEDRALE_PASSAGE.length outward from their wall:
 *   later zones (cloister, bell tower, the Almudaina, Parc de la Mar) must
 *   leave those footprints free or re-route the entrance.
 * - The nave is one room to the eye and five to the feet: `DIE_KATHEDRALE_SCREENS`
 *   (iron grilles, waist-high parapets, a collapse) split it into zones along
 *   its own lines, the bay lines and the two column rows. Nothing rises to
 *   the vault, so the whole cathedral stays in sight from every zone.
 */

export const DIE_KATHEDRALE_WALL_THICKNESS = 0.3;
const HALF_WALL = DIE_KATHEDRALE_WALL_THICKNESS / 2;

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
  minZ: NAVE.maxZ + DIE_KATHEDRALE_WALL_THICKNESS,
  maxZ: 17,
  wallHeight: 5,
  parapetHeight: 1.1,
} as const;

/** Walkable rooms, for placement checks. */
export const DIE_KATHEDRALE_ROOMS = [NAVE, CHANCEL, PLAZA] as const;

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
export const DIE_KATHEDRALE_BARRIER_CONFIG: WindowBarrierConfig = {
  boardCount: 5,
  boardHp: 100,
  repairInterval: 0.55,
  repairRewardCap: 4,
};

/** Wall apertures by entrance: doors are walk-through, chapel windows keep a low sill. */
export const DIE_KATHEDRALE_OPENINGS = {
  door: { width: 1.5, bottom: 0, top: 2.2 },
  window: { width: 1.5, bottom: 0.3, top: 1.9 },
} as const;

export type DieKathedraleEntranceKind = keyof typeof DIE_KATHEDRALE_OPENINGS;

/**
 * Zones of the run, in the order their spawns are listed:
 * - `narthex`: the foot of the nave, its two bays behind the great doors.
 * - `nave`: the central aisle from the rood grille to the choir grille.
 * - `westAisle` / `eastAisle`: the side aisles beside it, with their chapels.
 * - `crossing`: the last bay, wall to wall, and the chancel behind its arch.
 * - `plaza`: outside, through the wicket in the great doors.
 */
export const DIE_KATHEDRALE_ZONES = ['narthex', 'nave', 'westAisle', 'eastAisle', 'crossing', 'plaza'] as const;

export type DieKathedraleZoneId = typeof DIE_KATHEDRALE_ZONES[number];

export const DIE_KATHEDRALE_START_ZONE: DieKathedraleZoneId = 'narthex';

/** Bay lines the nave is cut on: the rood grille and the choir grille. */
const ROOD_Z = naveBayLine(2);
const CHOIR_Z = naveBayLine(6);

export interface FloorRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Floor of every zone inside the nave, for placement checks. The crossing also holds `CHANCEL`. */
export const DIE_KATHEDRALE_ZONE_AREAS: Readonly<Record<Exclude<DieKathedraleZoneId, 'plaza'>, FloorRect>> = {
  narthex: { minX: NAVE.minX, maxX: NAVE.maxX, minZ: ROOD_Z, maxZ: NAVE.maxZ },
  nave: { minX: -NAVE.columnX, maxX: NAVE.columnX, minZ: CHOIR_Z, maxZ: ROOD_Z },
  westAisle: { minX: NAVE.minX, maxX: -NAVE.columnX, minZ: CHOIR_Z, maxZ: ROOD_Z },
  eastAisle: { minX: NAVE.columnX, maxX: NAVE.maxX, minZ: CHOIR_Z, maxZ: ROOD_Z },
  crossing: { minX: NAVE.minX, maxX: NAVE.maxX, minZ: NAVE.minZ, maxZ: CHOIR_Z },
};

export interface DieKathedraleEntrance {
  readonly id: string;
  /** Centre of the opening on the wall's centre line. */
  readonly x: number;
  readonly z: number;
  /** Outward normal: the side its zombies come from. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly kind: DieKathedraleEntranceKind;
  /** Zone whose unlock wakes this entrance. */
  readonly zone: DieKathedraleZoneId;
}

/**
 * Zombie entrances, two per zone that has an outer wall: one each side of
 * the narthex, a door and a chapel window along each side aisle, the last
 * east chapel and the sacristy door for the crossing, and a gate in each
 * side wall of the plaza. The central nave has no wall of its own: its horde
 * comes through whichever grilles are open.
 */
export const DIE_KATHEDRALE_ENTRANCES: ReadonlyArray<DieKathedraleEntrance> = [
  { id: 'nave-almoina-door', x: WEST_WALL_X, z: naveBayCenter(1), outwardX: -1, outwardZ: 0, kind: 'door', zone: 'narthex' },
  { id: 'narthex-east-chapel', x: EAST_WALL_X, z: naveBayCenter(0), outwardX: 1, outwardZ: 0, kind: 'window', zone: 'narthex' },
  { id: 'west-aisle-door', x: WEST_WALL_X, z: naveBayCenter(2), outwardX: -1, outwardZ: 0, kind: 'door', zone: 'westAisle' },
  { id: 'nave-west-chapel', x: WEST_WALL_X, z: naveBayCenter(5), outwardX: -1, outwardZ: 0, kind: 'window', zone: 'westAisle' },
  { id: 'nave-mirador-door', x: EAST_WALL_X, z: naveBayCenter(3), outwardX: 1, outwardZ: 0, kind: 'door', zone: 'eastAisle' },
  { id: 'east-aisle-chapel', x: EAST_WALL_X, z: naveBayCenter(5), outwardX: 1, outwardZ: 0, kind: 'window', zone: 'eastAisle' },
  { id: 'nave-east-chapel', x: EAST_WALL_X, z: naveBayCenter(6), outwardX: 1, outwardZ: 0, kind: 'window', zone: 'crossing' },
  { id: 'chancel-sacristy', x: CHANCEL_EAST_WALL_X, z: -54, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'crossing' },
  { id: 'plaza-almudaina-gate', x: WEST_WALL_X, z: 10, outwardX: -1, outwardZ: 0, kind: 'door', zone: 'plaza' },
  { id: 'plaza-palau-gate', x: EAST_WALL_X, z: 6.5, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'plaza' },
];

/** `wicket`: boards over a hole in the great doors. `gate`: an iron leaf in one of the nave's screens. */
export type DieKathedraleDoorKind = 'wicket' | 'gate';

export interface DieKathedraleDoor {
  readonly id: string;
  /** Centre of the door on the centre line of its wall or screen. */
  readonly x: number;
  readonly z: number;
  /** Away from the start: debris bursts that way. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly cost: number;
  readonly kind: DieKathedraleDoorKind;
  /** The two zones it joins: buying it wakes whichever still sleeps. */
  readonly zones: readonly [DieKathedraleZoneId, DieKathedraleZoneId];
}

/** X of the side-aisle gates: the middle of the walkway the chapels leave beside the column row. */
const AISLE_GATE_X = 9.2;

/**
 * Paid ways through. From the narthex: the rood gate up the central nave,
 * a gate into each side aisle and the wicket out to the plaza. The central
 * nave opens sideways into both aisles, in the two bays whose pews were
 * cleared, and through the choir gate onto the crossing and the chancel; the west aisle reaches the crossing too, the
 * east one ends under the collapse.
 */
export const DIE_KATHEDRALE_DOORS: ReadonlyArray<DieKathedraleDoor> = [
  { id: 'rood-gate', x: 0, z: ROOD_Z, outwardX: 0, outwardZ: -1, cost: 750, kind: 'gate', zones: ['narthex', 'nave'] },
  { id: 'almoina-gate', x: -AISLE_GATE_X, z: ROOD_Z, outwardX: 0, outwardZ: -1, cost: 1000, kind: 'gate', zones: ['narthex', 'westAisle'] },
  { id: 'mirador-gate', x: AISLE_GATE_X, z: ROOD_Z, outwardX: 0, outwardZ: -1, cost: 1000, kind: 'gate', zones: ['narthex', 'eastAisle'] },
  { id: 'nave-west-gate', x: -NAVE.columnX, z: naveBayCenter(5), outwardX: -1, outwardZ: 0, cost: 750, kind: 'gate', zones: ['nave', 'westAisle'] },
  { id: 'nave-east-gate', x: NAVE.columnX, z: naveBayCenter(3), outwardX: 1, outwardZ: 0, cost: 750, kind: 'gate', zones: ['nave', 'eastAisle'] },
  { id: 'choir-gate', x: 0, z: CHOIR_Z, outwardX: 0, outwardZ: -1, cost: 1500, kind: 'gate', zones: ['nave', 'crossing'] },
  { id: 'ambulatory-gate', x: -AISLE_GATE_X, z: CHOIR_Z, outwardX: 0, outwardZ: -1, cost: 1250, kind: 'gate', zones: ['westAisle', 'crossing'] },
  { id: 'to-plaza', x: 0, z: FRONT_WALL_Z, outwardX: 0, outwardZ: 1, cost: 1250, kind: 'wicket', zones: ['narthex', 'plaza'] },
];

const DOOR_OPENING = { width: POINT_DOOR_SIZE.width, bottom: 0, top: POINT_DOOR_SIZE.height } as const;

/** The hole every paid door needs in the wall or screen it stands on. */
export const DIE_KATHEDRALE_DOOR_CUTS: ReadonlyArray<WallCut> = DIE_KATHEDRALE_DOORS.map((door) => ({ x: door.x, z: door.z, opening: DOOR_OPENING }));

/** Every hole the entrances and doors cut in the walls, shared by all shells. */
export const DIE_KATHEDRALE_WALL_CUTS: ReadonlyArray<WallCut> = [
  ...DIE_KATHEDRALE_ENTRANCES.map((entrance) => ({ x: entrance.x, z: entrance.z, opening: DIE_KATHEDRALE_OPENINGS[entrance.kind] })),
  ...DIE_KATHEDRALE_DOOR_CUTS,
];

/**
 * How a screen is built. None reaches the vault:
 * - `grille`: iron bars on a stone plinth, the cathedral's own chapel closures.
 * - `parapet`: a waist-high stone wall under an iron rail.
 * - `rubble`: fallen masonry from the vault above.
 */
export type DieKathedraleScreenStyle = 'grille' | 'parapet' | 'rubble';

export interface DieKathedraleScreen {
  readonly id: string;
  /** Axis the screen runs along; `fixed` is its centre line on the other one. */
  readonly axis: WallAxis;
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  readonly style: DieKathedraleScreenStyle;
  /** Centres of the free ways through it, besides the paid doors on its line. */
  readonly gaps?: ReadonlyArray<number>;
}

/** What the player, the horde and low shots meet of a screen; above it, bars are only drawn. */
export const DIE_KATHEDRALE_SCREEN = { thickness: 0.3, solidHeight: 1.15, gapWidth: 1.8, rubbleDepth: 1.8, rubbleHeight: 1.9 } as const;

function arcadeScreens(side: -1 | 1, bays: ReadonlyArray<number>): DieKathedraleScreen[] {
  return bays.map((bay) => ({
    id: `arcade-${side < 0 ? 'west' : 'east'}-${bay}`,
    axis: 'z' as const, fixed: side * NAVE.columnX, min: naveBayLine(bay + 1), max: naveBayLine(bay), style: 'parapet' as const,
  }));
}

/** Bays whose arcade is closed: the pewed bay of the narthex and the whole central nave. */
const CLOSED_ARCADE_BAYS = [1, 2, 3, 4, 5] as const;

/**
 * The nave's divisions. Two lines run wall to wall, the rood line and the
 * choir line (where the east aisle lies under a fallen vault); parapets
 * close the arcades beside the central nave and the second bay of the
 * narthex, whose first bay, clear of pews, stays open into both side aisles.
 */
export const DIE_KATHEDRALE_SCREENS: ReadonlyArray<DieKathedraleScreen> = [
  { id: 'rood-west', axis: 'x', fixed: ROOD_Z, min: NAVE.minX, max: -NAVE.columnX, style: 'grille' },
  { id: 'rood-centre', axis: 'x', fixed: ROOD_Z, min: -NAVE.columnX, max: NAVE.columnX, style: 'grille' },
  { id: 'rood-east', axis: 'x', fixed: ROOD_Z, min: NAVE.columnX, max: NAVE.maxX, style: 'grille' },
  { id: 'choir-west', axis: 'x', fixed: CHOIR_Z, min: NAVE.minX, max: -NAVE.columnX, style: 'grille' },
  { id: 'choir-centre', axis: 'x', fixed: CHOIR_Z, min: -NAVE.columnX, max: NAVE.columnX, style: 'grille' },
  { id: 'collapse-east', axis: 'x', fixed: CHOIR_Z, min: NAVE.columnX, max: NAVE.maxX, style: 'rubble' },
  ...arcadeScreens(-1, CLOSED_ARCADE_BAYS),
  ...arcadeScreens(1, CLOSED_ARCADE_BAYS),
];

/** What a side chapel holds: a rifle on its wall, a boarded window the dead come through, or the dead themselves. */
export type DieKathedraleChapelRole = 'arms' | 'breach' | 'mortuary';

export interface DieKathedraleChapel {
  readonly id: string;
  readonly side: -1 | 1;
  readonly bay: number;
  readonly role: DieKathedraleChapelRole;
  /** Candles still burn on its altar. */
  readonly lit: boolean;
}

/** Depth of a chapel from the side wall, how far its side grilles stand from the bay lines, and its altar against the wall. */
export const CHAPEL = { depth: 3, inset: 0.5, altarOffsetZ: -1.9, altarWidth: 1.4, altarDepth: 0.75, altarHeight: 1 } as const;

/**
 * Side chapels: a bay of a side aisle fenced off against the wall by its
 * own grille, open in the middle. They narrow the aisle to a walkway beside
 * the column row.
 */
export const DIE_KATHEDRALE_CHAPELS: ReadonlyArray<DieKathedraleChapel> = [
  { id: 'chapel-west-4', side: -1, bay: 4, role: 'arms', lit: true },
  { id: 'chapel-west-5', side: -1, bay: 5, role: 'breach', lit: false },
  { id: 'chapel-east-2', side: 1, bay: 2, role: 'mortuary', lit: true },
  { id: 'chapel-east-5', side: 1, bay: 5, role: 'breach', lit: false },
];

/** Floor of a chapel, from the side wall to its front grille. */
export function chapelArea(chapel: DieKathedraleChapel): FloorRect {
  const wall = chapel.side * NAVE.maxX;
  const front = chapel.side * (NAVE.maxX - CHAPEL.depth);
  return {
    minX: Math.min(wall, front), maxX: Math.max(wall, front),
    minZ: naveBayLine(chapel.bay + 1) + CHAPEL.inset, maxZ: naveBayLine(chapel.bay) - CHAPEL.inset,
  };
}

/** The three grilles of a chapel: its front, open in the middle, and both sides. */
export function chapelScreens(chapel: DieKathedraleChapel): DieKathedraleScreen[] {
  const area = chapelArea(chapel);
  const front = chapel.side * (NAVE.maxX - CHAPEL.depth);
  return [
    { id: `${chapel.id}-front`, axis: 'z', fixed: front, min: area.minZ, max: area.maxZ, style: 'grille', gaps: [naveBayCenter(chapel.bay)] },
    { id: `${chapel.id}-north`, axis: 'x', fixed: area.minZ, min: area.minX, max: area.maxX, style: 'grille' },
    { id: `${chapel.id}-south`, axis: 'x', fixed: area.maxZ, min: area.minX, max: area.maxX, style: 'grille' },
  ];
}

/** Dead-end passage behind every entrance, where its zombies appear. */
export const DIE_KATHEDRALE_PASSAGE = {
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

function spawnsOf(zone: DieKathedraleZoneId): ReadonlyArray<ZombieSpawnPoint> {
  return DIE_KATHEDRALE_ENTRANCES.filter((entrance) => entrance.zone === zone).map((entrance) => entranceSpawn(entrance, DIE_KATHEDRALE_PASSAGE));
}

/** Spawn points per unlocked zone, one at the end of each entrance passage. */
export const DIE_KATHEDRALE_SPAWNS: Readonly<Record<DieKathedraleZoneId, ReadonlyArray<ZombieSpawnPoint>>> = {
  narthex: spawnsOf('narthex'),
  nave: spawnsOf('nave'),
  westAisle: spawnsOf('westAisle'),
  eastAisle: spawnsOf('eastAisle'),
  crossing: spawnsOf('crossing'),
  plaza: spawnsOf('plaza'),
};

/** Weapon outlines 2 cm in front of the wall face. */
export const DIE_KATHEDRALE_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
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
    // The arms chapel of the west aisle: the first automatic, behind its grille.
    id: 'chapel-ppsh41',
    weaponId: 'ppsh41',
    price: 1250,
    ammoPrice: 625,
    position: { x: NAVE.minX + 0.02, y: 1.45, z: naveBayCenter(4) },
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
export const DIE_KATHEDRALE_BOX_PLACEMENT: MysteryBoxPlacement = {
  position: { x: 7.4, y: 0, z: PLAZA.minZ + 0.6 },
  yaw: Math.PI,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
};

/** Just inside the great doors, on the central aisle, looking at the altar. */
export const DIE_KATHEDRALE_PLAYER_SPAWN = { x: 0, y: 1.72, z: -3.6, floor: 0 } as const;

/**
 * One unbroken move: the moonlit front across the plaza, a low passage
 * through the wicket, then a crane above the rood grille towards the rose
 * and a gentle retreat into the player's eyes. Times are on the shared
 * eased path, equally spaced to keep Catmull-Rom velocity continuous;
 * the final key is supplied by IntroCinematic from the live rig.
 */
export const DIE_KATHEDRALE_INTRO: ArenaIntro = {
  presentation: 'dieKathedrale',
  duration: 16,
  shots: [
    { time: 0, position: { x: 6.5, y: 7.6, z: 28 }, target: { x: 0, y: 12, z: 0 } },
    { time: 1, position: { x: 6, y: 7.2, z: 26 }, target: { x: 0, y: 11.6, z: 0 } },
    { time: 2, position: { x: 4.8, y: 6.2, z: 21.5 }, target: { x: 0, y: 10, z: 0 } },
    { time: 3, position: { x: 2.8, y: 4.3, z: 15 }, target: { x: 0, y: 7, z: 0 } },
    { time: 4, position: { x: 0.8, y: 2.1, z: 8 }, target: { x: 0, y: 3, z: -1 } },
    { time: 5, position: { x: 0, y: 1.4, z: 3.5 }, target: { x: 0, y: 1.7, z: -7 } },
    { time: 6, position: { x: 0, y: 1.35, z: 0.8 }, target: { x: 0, y: 1.9, z: -10 } },
    { time: 7, position: { x: 0, y: 1.6, z: -2.4 }, target: { x: 0, y: 4.6, z: -18 } },
    { time: 8, position: { x: 0.7, y: 3.4, z: -7.4 }, target: { x: 0, y: 10, z: -28 } },
    { time: 9, position: { x: 2, y: 5.8, z: -14.6 }, target: { x: 0, y: 15, z: -42 } },
    { time: 10, position: { x: 2.4, y: 7.4, z: -20.5 }, target: { x: 0, y: 17, z: -49 } },
    { time: 11, position: { x: 0.4, y: 7.5, z: -23.5 }, target: { x: 0, y: 14.5, z: -49 } },
    { time: 12, position: { x: -1.4, y: 6.3, z: -21 }, target: { x: 0, y: 10.5, z: -45 } },
    { time: 13, position: { x: -2, y: 4.8, z: -14.8 }, target: { x: 0, y: 7.5, z: -39 } },
    { time: 14, position: { x: -0.8, y: 2.9, z: -8 }, target: { x: 0, y: 3.5, z: -23 } },
    { time: 15, position: { x: 0, y: 1.95, z: -4.7 }, target: { x: 0, y: 1.9, z: -15.2 } },
  ],
};

/**
 * One rectangle over the nave, the chancel and the plaza, inset by the body
 * radius: walls and the closed wicket keep the player out of what is not
 * open yet, and the arena stops them at every walk-through entrance.
 */
export const DIE_KATHEDRALE_PLAYER_BOUNDS: PlayerBounds = {
  minX: NAVE.minX + 0.4,
  maxX: NAVE.maxX - 0.4,
  minZ: CHANCEL.minZ + 0.4,
  maxZ: PLAZA.maxZ - 0.4,
};

const PASSAGE_REACH = HALF_WALL + DIE_KATHEDRALE_PASSAGE.length + DIE_KATHEDRALE_WALL_THICKNESS + 0.3;

/** Every room plus every entrance passage. Walls longer than the zombie obstacle limit (20 m) are built in pieces. */
export const DIE_KATHEDRALE_NAVIGATION_BOUNDS: ReadonlyArray<ZombieNavigationBounds> = [
  {
    floor: 0,
    minX: WEST_WALL_X - PASSAGE_REACH,
    maxX: EAST_WALL_X + PASSAGE_REACH,
    minZ: CHANCEL.minZ - DIE_KATHEDRALE_WALL_THICKNESS - 0.3,
    maxZ: PLAZA.maxZ + DIE_KATHEDRALE_WALL_THICKNESS + 0.3,
    baseY: 0,
  },
];

/**
 * The horde: the people who kept the cathedral and the pilgrims who came to
 * it, every walker dressed, rolled per spawn by weight (appearance only; tune
 * freely). Eleven looks, the common ones first; the bishop stays the rarest.
 */
export const DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES: readonly ZombieSkinShare[] = [
  { skin: 'condemnedMonk', weight: 13 },
  { skin: 'dominicanFriar', weight: 11 },
  { skin: 'pilgrim', weight: 11 },
  { skin: 'profanedPriest', weight: 10 },
  { skin: 'undeadNun', weight: 10 },
  { skin: 'cathedralCanon', weight: 9 },
  { skin: 'cantor', weight: 9 },
  { skin: 'cathedralGuardian', weight: 8 },
  { skin: 'cathedralCustodian', weight: 8 },
  { skin: 'abbess', weight: 7 },
  { skin: 'fallenBishop', weight: 4 },
];

/** Blue eyes for the whole horde, with a pale blue core against the cathedral gloom. */
export const DIE_KATHEDRALE_ZOMBIE_EYES: ZombieEyeColors = { glow: 0x142aff, core: 0x7a9aff };

/**
 * Night in a dead cathedral: almost no fill, so stone only shows where a
 * flame or the moon reaches it. The haze stays thin enough to read the
 * vault from the floor and thick enough to lose the far end of the nave.
 */
export const DIE_KATHEDRALE_AMBIENCE = {
  backgroundColor: 0x020308,
  fog: { color: 0x04060b, density: 0.024 },
  hemisphereLight: { skyColor: 0x39466c, groundColor: 0x0b0907, intensity: 0.24, reducedIntensity: 0.34 },
  // The shell's sky-like fill would flatten every shadow: let next to none in.
  environmentIntensity: { intensity: 0.05, reducedIntensity: 0.07 },
  musicTrack: 'background_music_theme',
  ambientBed: 'wind',
} as const satisfies ArenaAmbience;

/** Unshadowed moonlight from over the bay (south-east): a cold graze that only separates shafts from walls. */
export const DIE_KATHEDRALE_MOON = {
  color: 0x7f97c8,
  intensity: 0.14,
  reducedIntensity: 0.17,
  /** Where the moon hangs in the sky, seen from the plaza. */
  position: { x: 46, y: 62, z: 150 },
  /** Direction the light travels. */
  direction: { x: -0.42, y: -0.5, z: -0.76 },
} as const;

/** East lancets the moon still comes through: their glass glows, a beam slants in and a cold pool lies on the floor. Every other window is dead. */
export const MOONLIT_LANCET_BAYS: ReadonlyArray<number> = [0, 4];

/**
 * Floor band a moonlit lancet lights, as distances in from the east wall. It
 * stays centred on its window's bay so the beam, the coloured pool and the
 * glow read as the window's own light, not as a pool beside it.
 */
export const MOONLIT_LANCET_LANDING = { nearX: 1, farX: 6.2 } as const;

const CANDLE_COLOR = 0xffa552;
const MOON_GLASS_COLOR = 0x7d9cf0;
const SANCTUARY_LAMP_COLOR = 0xc8231a;
const LANTERN_COLOR = 0xffb866;

export interface DieKathedraleLightSite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  /** Candle flames waver; glass and moon glows hold still. */
  readonly flicker: boolean;
  /** Omitted for permanent sources such as moonlight, votives and the sanctuary lamp. */
  readonly ignition?: {
    readonly radius: number;
    readonly seconds: number;
    readonly initiallyLit: boolean;
    readonly zones: ReadonlyArray<DieKathedraleZoneId>;
  };
}

/** Hanging height of the wrought-iron candle rings round the columns. */
export const COLUMN_RING_Y = 4.4;
export const COLUMN_RING_RADIUS = NAVE_COLUMN.radius + 0.6;
export const COLUMN_RING_CANDLES = 8;

/** Real seconds, rather than eased path time: wind outside, oak at the threshold, iron high in the nave. */
export const DIE_KATHEDRALE_INTRO_CUES: ReadonlyArray<ArenaAmbientCue & { readonly time: number }> = [
  { time: 0.5, sound: 'wind-gust', position: { x: 0, y: 7, z: 9 } },
  { time: 6.2, sound: 'wood-creak', position: { x: 0, y: 1.4, z: NAVE.maxZ } },
  { time: 8.8, sound: 'metal-echo', position: { x: 5, y: COLUMN_RING_Y, z: -28 } },
];

/** Existing column candelabra: the first pair guides the start; the rest kindle as the player explores. */
export const COLUMN_CANDLE_RINGS = ([-1, 1] as const).flatMap((side) => NAVE_COLUMN_ZS.map((z, column) => ({
  id: `ring-${side < 0 ? 'west' : 'east'}-${column}`,
  side,
  column,
  z,
  // Keep the original distant candle island visible, too.
  initiallyLit: column === 0 || (side === 1 && column === 3),
  zones: column <= 1
    ? ['narthex'] as const
    : column === NAVE_COLUMN_ZS.length - 1
      ? ['nave', side < 0 ? 'westAisle' : 'eastAisle', 'crossing'] as const
      : ['nave', side < 0 ? 'westAisle' : 'eastAisle'] as const,
})));

/** The altar: a stone table on its dais under the hanging canopy. */
export const ALTAR = { x: 0, z: -55.2, daisWidth: 5.2, daisDepth: 2.8, daisHeight: 0.3, tableWidth: 3.2, tableDepth: 1.1, tableHeight: 1.05, canopyY: 6.2 } as const;

/** Votive candle racks against the side walls of the narthex: the west one lights the rifle beside the great doors. */
export const VOTIVE_RACKS: ReadonlyArray<{ readonly id: string; readonly side: -1 | 1; readonly z: number }> = [
  { id: 'votive-west', side: -1, z: naveBayCenter(0) + 2 },
  { id: 'votive-east', side: 1, z: naveBayCenter(1) },
];

/** The sanctuary lamp hung in the crossing, before the chancel arch on the sacristy side. */
export const SANCTUARY_LAMP = { x: CHANCEL.maxX + 2.5, y: 2.6, z: NAVE.minZ + 1.8 } as const;

/**
 * Local candle islands and moonlight. Discovered column rings stay lit for
 * the run; only the nearest quality-budget's worth receive real lights.
 */
export const DIE_KATHEDRALE_LIGHT_SITES: ReadonlyArray<DieKathedraleLightSite> = [
  // The front rose: the only cold light of the narthex, on the spot the run starts.
  { id: 'entry-moon', x: 0, y: 4.6, z: -3.2, color: MOON_GLASS_COLOR, intensity: 6, distance: 13, flicker: false },
  ...COLUMN_CANDLE_RINGS.map(({ id, side, column, z, initiallyLit, zones }) => ({
    id,
    x: side * (NAVE.columnX - 1.5),
    y: COLUMN_RING_Y - 0.3,
    z,
    color: CANDLE_COLOR,
    intensity: column <= 1 ? 20 : 16,
    distance: 12,
    flicker: true,
    ignition: { radius: 9, seconds: 0.9, initiallyLit, zones },
  })),
  ...VOTIVE_RACKS.map((rack) => ({
    id: rack.id, x: rack.side * (NAVE.maxX - 1.3), y: 1.7, z: rack.z, color: CANDLE_COLOR, intensity: 4, distance: 7, flicker: true,
  })),
  ...DIE_KATHEDRALE_CHAPELS.filter((chapel) => chapel.lit).map((chapel) => ({
    id: `${chapel.id}-candles`, x: chapel.side * (NAVE.maxX - 0.9), y: 1.7, z: naveBayCenter(chapel.bay) + CHAPEL.altarOffsetZ,
    color: CANDLE_COLOR, intensity: 5, distance: 7, flicker: true,
  })),
  ...MOONLIT_LANCET_BAYS.map((bay) => ({
    id: `lancet-moon-${bay}`,
    x: NAVE.maxX - (MOONLIT_LANCET_LANDING.nearX + MOONLIT_LANCET_LANDING.farX) / 2,
    y: 2.2,
    z: naveBayCenter(bay),
    color: MOON_GLASS_COLOR, intensity: 3.5, distance: 8, flicker: false,
  })),
  { id: 'altar-candles', x: ALTAR.x, y: 2.4, z: ALTAR.z + 1.2, color: CANDLE_COLOR, intensity: 11, distance: 13, flicker: true },
  // The one red light in the building.
  { id: 'sanctuary-lamp', ...SANCTUARY_LAMP, color: SANCTUARY_LAMP_COLOR, intensity: 4, distance: 8, flicker: true },
  { id: 'plaza-lantern-west', x: -4.7, y: 3.3, z: PLAZA.minZ + 1.7, color: LANTERN_COLOR, intensity: 6, distance: 10, flicker: true },
  { id: 'plaza-lantern-east', x: 4.7, y: 3.3, z: PLAZA.minZ + 1.7, color: LANTERN_COLOR, intensity: 6, distance: 10, flicker: true },
  { id: 'plaza-lamp-west', x: -9.5, y: 3.9, z: 12.2, color: LANTERN_COLOR, intensity: 7, distance: 11, flicker: false },
  { id: 'plaza-lamp-east', x: 9.5, y: 3.9, z: 12.2, color: LANTERN_COLOR, intensity: 7, distance: 11, flicker: false },
];

/**
 * Sounds of an empty building that is not empty: iron settling, wind in the
 * tracery, wood giving, something knocking behind the sacristy. Rare and
 * far apart, so silence does most of the work.
 */
export const DIE_KATHEDRALE_AMBIENT_EVENTS: ReadonlyArray<AmbientEventTiming & ArenaAmbientCue> = [
  // The choir grille working on its hinges.
  { sound: 'metal-echo', position: { x: 0, y: 2, z: CHOIR_Z }, initialDelay: 30, minInterval: 45, maxInterval: 100 },
  // Chains of a dead lamp, high in the west aisle.
  { sound: 'metal-echo', position: { x: -10, y: 12, z: naveBayCenter(4) }, initialDelay: 75, minInterval: 80, maxInterval: 170 },
  // Wind through the broken tracery of the front rose.
  { sound: 'wind-gust', position: { x: 0, y: ROSE_WINDOWS.front.y, z: NAVE.maxZ - 1 }, initialDelay: 20, minInterval: 40, maxInterval: 90 },
  // A pew taking weight in the dark of the central nave.
  { sound: 'wood-creak', position: { x: -3, y: 0.5, z: naveBayCenter(3) }, initialDelay: 45, minInterval: 55, maxInterval: 120 },
  // Knocking from behind the sacristy door.
  { sound: 'distant-knock', position: { x: CHANCEL.maxX + 4, y: 1, z: -54 }, initialDelay: 70, minInterval: 85, maxInterval: 170 },
  // Something out in the old town, beyond the plaza.
  { sound: 'distant-howl', position: { x: -20, y: 3, z: 40 }, initialDelay: 100, minInterval: 120, maxInterval: 240 },
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
export const DIE_KATHEDRALE_DUST_COUNT: Readonly<Record<QualityLevel, number>> = { low: 90, medium: 180, high: 340, ultraMax: 520 };

/** Low mist lying where the air does not move: the chapels, the collapse, the west aisle door and the foot of the choir. */
export const DIE_KATHEDRALE_MIST_PATCHES: ReadonlyArray<{ readonly x: number; readonly z: number; readonly radius: number }> = [
  ...DIE_KATHEDRALE_CHAPELS.map((chapel) => ({ x: chapel.side * (NAVE.maxX - CHAPEL.depth / 2), z: naveBayCenter(chapel.bay), radius: 3.4 })),
  { x: 10, z: CHOIR_Z + 2.6, radius: 4.2 },
  { x: -10.2, z: naveBayCenter(2), radius: 3.6 },
  { x: 0, z: NAVE.minZ + 2.5, radius: 5 },
  { x: 0, z: naveBayCenter(4), radius: 4.4 },
];

/** A pew dragged out of the central nave and left broken in an aisle; it lies along `axis`. */
export interface BrokenPew {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly axis: WallAxis;
}

export const BROKEN_PEWS: ReadonlyArray<BrokenPew> = [
  { id: 'broken-pew-west', x: -7.35, z: naveBayCenter(2) - 1, axis: 'z' },
  { id: 'broken-pew-east', x: 7.35, z: naveBayCenter(4) - 1, axis: 'z' },
  { id: 'broken-pew-crossing', x: -10, z: naveBayCenter(6) - 0.6, axis: 'x' },
];
