import type { ZombieEmergenceSite, ZombieEmergenceTuning } from '../emergence/ZombieEmergence';
import type { ZombieFloorLook } from '../skins/ZombieSkinShares';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { AmbientEventTiming } from './shared/AmbientEventScheduler';
import type { WallAxis, WallOpening } from './shared/ArenaStructure';
import type { ArenaAmbientCue } from './ZombieArena';
import type { DieKathedraleDoor, DieKathedraleEntrance, DieKathedraleLightSite, FloorRect } from './DieKathedraleConfig';

/**
 * The royal catacombs under Die Kathedrale: a second floor reached by a
 * stair from the crossing. Pure data, in metres; heights inside rooms are
 * measured from the catacomb floor (`CATACOMB_FLOOR_Y`), while `y` of a
 * placed object is a world height.
 *
 * PLAN (north is -z, as in the cathedral): the stair runs north from the
 * crossing's west bay, beside and below the chancel, to a landing that opens
 * on the burial galleries (two blocks of loculi wrapped in corridors). The
 * royal pantheon lies east of them, the reliquary north of the pantheon, and
 * the circular sanctuary north of the galleries: the breath passage joins it
 * to the reliquary and the ossuary passage back to the galleries, closing a
 * loop. Everything lies outside the cathedral's footprint except the stair.
 *
 * Only `type` imports from `DieKathedraleConfig`, which imports this file:
 * values that both need (the stair head on the nave's wall) are repeated
 * here as literals and checked by the tests.
 */

export const CATACOMB_FLOOR = -1;
/** Feet height of every catacomb room. */
export const CATACOMB_FLOOR_Y = -6;
/** Load-bearing masonry, twice the cathedral's curtain walls. */
export const CATACOMB_WALL_THICKNESS = 0.6;
const HALF_WALL = CATACOMB_WALL_THICKNESS / 2;

/**
 * Progression zones below ground, in the order their spawns are listed:
 * - `galleries`: the stair, its landing and the burial galleries.
 * - `pantheon`: the royal tombs.
 * - `reliquary`: the relic chamber and its altar.
 * - `sanctuary`: the round shrine, reached from the reliquary or from the galleries.
 */
export const CATACOMB_ZONES = ['galleries', 'pantheon', 'reliquary', 'sanctuary'] as const;
export type CatacombZoneId = typeof CATACOMB_ZONES[number];

/** A vaulted room: its floor and the spring and crown of its vault, above its own floor. */
export interface CatacombVaultedRoom extends FloorRect {
  readonly springY: number;
  readonly apexY: number;
}

/**
 * The stair of the condemned: a straight flight from the head landing behind
 * the nave's north wall (floor 0) down to the landing (floor -1).
 * `headZ` is the inner face of that wall (NAVE.minZ minus its thickness).
 */
export const CRYPT_STAIR = {
  minX: -11.2,
  maxX: -8.8,
  headZ: -49.3,
  topZ: -50.6,
  bottomZ: -60.2,
  steps: 24,
  /** Clear height above the treads and over the head landing. */
  headroom: 3,
} as const;

export const CRYPT_STAIR_X = (CRYPT_STAIR.minX + CRYPT_STAIR.maxX) / 2;

/** Where the stair walls stand, either side of the flight. */
export const CRYPT_STAIR_WALL_XS = [CRYPT_STAIR.minX - HALF_WALL, CRYPT_STAIR.maxX + HALF_WALL] as const;

/** Foot of the stair: a small vaulted landing open on the galleries. */
export const CRYPT_LANDING: CatacombVaultedRoom = { minX: -13, maxX: -7, minZ: -65, maxZ: CRYPT_STAIR.bottomZ, springY: 2.6, apexY: 3.6 };

/** The burial galleries: corridors round two blocks of loculi. */
export const GALLERIES: CatacombVaultedRoom = { minX: -30, maxX: -7, minZ: -82.6, maxZ: -65, springY: 2.4, apexY: 3.4 };

/** Solid masonry pierced with loculi on every face; they carry the vaults and split the galleries into a figure of eight. */
export const NICHE_BLOCKS: ReadonlyArray<FloorRect & { readonly id: string }> = [
  { id: 'niche-block-west', minX: -26.6, maxX: -20.2, minZ: -79.2, maxZ: -68.4 },
  { id: 'niche-block-east', minX: -16.8, maxX: -10.4, minZ: -79.2, maxZ: -68.4 },
];

/**
 * The corridors round the blocks, 3.4 m wide (room for a body to pass
 * another), that the galleries' vault bays are laid along; the crossings
 * belong to the long ones.
 */
export const GALLERY_CORRIDORS: ReadonlyArray<FloorRect> = [
  { minX: GALLERIES.minX, maxX: GALLERIES.maxX, minZ: -68.4, maxZ: GALLERIES.maxZ },
  { minX: GALLERIES.minX, maxX: GALLERIES.maxX, minZ: GALLERIES.minZ, maxZ: -79.2 },
  { minX: GALLERIES.minX, maxX: -26.6, minZ: -79.2, maxZ: -68.4 },
  { minX: -20.2, maxX: -16.8, minZ: -79.2, maxZ: -68.4 },
  { minX: -10.4, maxX: GALLERIES.maxX, minZ: -79.2, maxZ: -68.4 },
];

/** The royal pantheon: three by three bays on four clustered piers, the tallest vault below ground. */
export const PANTHEON: CatacombVaultedRoom & { readonly bays: number } = {
  minX: -6.4, maxX: 13.6, minZ: -84, maxZ: -64, springY: 3.2, apexY: 5.4, bays: 3,
};

/** Bay lines of the pantheon on one axis, wall to wall. */
export function pantheonBayLines(axis: WallAxis): number[] {
  const [min, max] = axis === 'x' ? [PANTHEON.minX, PANTHEON.maxX] : [PANTHEON.maxZ, PANTHEON.minZ];
  return Array.from({ length: PANTHEON.bays + 1 }, (_, index) => min + (max - min) * index / PANTHEON.bays);
}

/** Centre of pantheon bay (`column`, `row`): column 0 is the west, row 0 the south. */
export function pantheonBayCenter(column: number, row: number): { readonly x: number; readonly z: number } {
  const xs = pantheonBayLines('x');
  const zs = pantheonBayLines('z');
  return { x: (xs[column] + xs[column + 1]) / 2, z: (zs[row] + zs[row + 1]) / 2 };
}

/** Half-width of a clustered pier's solid. */
export const PANTHEON_PIER = { halfWidth: 0.75, shaftRadius: 0.32 } as const;

/** The four piers, where the inner bay lines cross. */
export const PANTHEON_PIERS: ReadonlyArray<{ readonly x: number; readonly z: number }> = (() => {
  const xs = pantheonBayLines('x').slice(1, -1);
  const zs = pantheonBayLines('z').slice(1, -1);
  return zs.flatMap((z) => xs.map((x) => ({ x, z })));
})();

/** How a monarch lies on the lid of their tomb. `empty`: the lid is off and nobody lies inside. */
export type RoyalEffigy = 'swordKing' | 'sceptreKing' | 'queen' | 'empty';

export interface RoyalTomb {
  readonly id: string;
  /** Centre of the chest; every tomb lies along z with its head to the north, as the dead face the altar. */
  readonly x: number;
  readonly z: number;
  readonly effigy: RoyalEffigy;
}

/** Footprint and height of a tomb chest, without its lid. */
export const ROYAL_TOMB = { width: 1.3, length: 2.7, chestHeight: 0.95, lidHeight: 0.18, plinthHeight: 0.12 } as const;

/** Four tombs in the side bays, the central bay left clear under the crown of candles. */
export const ROYAL_TOMBS: ReadonlyArray<RoyalTomb> = [
  { id: 'tomb-south', ...pantheonBayCenter(1, 0), effigy: 'swordKing' },
  { id: 'tomb-west', ...pantheonBayCenter(0, 1), effigy: 'queen' },
  { id: 'tomb-north', ...pantheonBayCenter(1, 2), effigy: 'sceptreKing' },
  { id: 'tomb-east', ...pantheonBayCenter(2, 1), effigy: 'empty' },
];

/** The cracked east wall behind the empty tomb, where a wind is heard from somewhere unreachable. */
export const PANTHEON_CRACK = { x: PANTHEON.maxX, z: pantheonBayCenter(2, 1).z, height: 3.6, width: 1.4 } as const;

/** The relic chamber north of the pantheon. */
export const RELIQUARY: CatacombVaultedRoom = { minX: -5, maxX: 5, minZ: -93, maxZ: -84.6, springY: 2.6, apexY: 4 };

/** The round shrine: its centre, radius and domed vault. */
export const SANCTUARY = { x: -18.5, z: -91.2, radius: 6, springY: 3, apexY: 5.4 } as const;

/** Square the shrine's round wall is set in: what the corner masonry and the floor fill. */
export const SANCTUARY_SQUARE: FloorRect = {
  minX: SANCTUARY.x - SANCTUARY.radius, maxX: SANCTUARY.x + SANCTUARY.radius,
  minZ: SANCTUARY.z - SANCTUARY.radius, maxZ: SANCTUARY.z + SANCTUARY.radius,
};

/** Low passages: from the reliquary to the shrine, and from the shrine back to the galleries. */
export const CATACOMB_PASSAGE_HEIGHT = { springY: 2.3, apexY: 2.95 } as const;
export const BREATH_PASSAGE: CatacombVaultedRoom = {
  minX: SANCTUARY_SQUARE.maxX, maxX: RELIQUARY.minX - CATACOMB_WALL_THICKNESS, minZ: SANCTUARY.z - 1.2, maxZ: SANCTUARY.z + 1.2, ...CATACOMB_PASSAGE_HEIGHT,
};
export const OSSUARY_PASSAGE: CatacombVaultedRoom = {
  minX: SANCTUARY.x - 1.2, maxX: SANCTUARY.x + 1.2, minZ: SANCTUARY_SQUARE.maxZ, maxZ: GALLERIES.minZ - CATACOMB_WALL_THICKNESS, ...CATACOMB_PASSAGE_HEIGHT,
};

/** Every walkable floor below ground, for placement checks (the shrine by its square). */
export const CATACOMB_ROOMS: Readonly<Record<'landing' | 'galleries' | 'pantheon' | 'reliquary' | 'sanctuary' | 'breathPassage' | 'ossuaryPassage', FloorRect>> = {
  landing: CRYPT_LANDING,
  galleries: GALLERIES,
  pantheon: PANTHEON,
  reliquary: RELIQUARY,
  sanctuary: SANCTUARY_SQUARE,
  breathPassage: BREATH_PASSAGE,
  ossuaryPassage: OSSUARY_PASSAGE,
};

/** Wall centre lines shared by rooms, doors and entrances. */
const LANDING_WEST_X = CRYPT_LANDING.minX - HALF_WALL;
const EAST_SPINE_X = GALLERIES.maxX + HALF_WALL;
const GALLERY_SOUTH_Z = GALLERIES.maxZ + HALF_WALL;
const GALLERY_WEST_X = GALLERIES.minX - HALF_WALL;
const GALLERY_NORTH_Z = GALLERIES.minZ - HALF_WALL;
const PANTHEON_SOUTH_Z = PANTHEON.maxZ + HALF_WALL;
const PANTHEON_EAST_X = PANTHEON.maxX + HALF_WALL;
const PANTHEON_NORTH_Z = PANTHEON.minZ - HALF_WALL;
const RELIQUARY_WEST_X = RELIQUARY.minX - HALF_WALL;
const RELIQUARY_EAST_X = RELIQUARY.maxX + HALF_WALL;
const RELIQUARY_NORTH_Z = RELIQUARY.minZ - HALF_WALL;
const SANCTUARY_WEST_X = SANCTUARY_SQUARE.minX - HALF_WALL;
const SANCTUARY_EAST_X = SANCTUARY_SQUARE.maxX + HALF_WALL;
const SANCTUARY_NORTH_Z = SANCTUARY_SQUARE.minZ - HALF_WALL;
const SANCTUARY_SOUTH_Z = SANCTUARY_SQUARE.maxZ + HALF_WALL;

/** Paid ways on below ground: iron gates, every one of them on floor -1. */
export const CATACOMB_DOORS: ReadonlyArray<DieKathedraleDoor> = [
  { id: 'pantheon-gate', x: EAST_SPINE_X, z: pantheonBayCenter(0, 1).z, outwardX: 1, outwardZ: 0, cost: 1500, kind: 'gate', zones: ['galleries', 'pantheon'], floor: CATACOMB_FLOOR },
  { id: 'reliquary-gate', x: 0, z: PANTHEON_NORTH_Z, outwardX: 0, outwardZ: -1, cost: 1250, kind: 'gate', zones: ['pantheon', 'reliquary'], floor: CATACOMB_FLOOR },
  { id: 'sanctuary-gate', x: RELIQUARY_WEST_X, z: SANCTUARY.z, outwardX: -1, outwardZ: 0, cost: 1500, kind: 'gate', zones: ['reliquary', 'sanctuary'], floor: CATACOMB_FLOOR },
  // The way back: an ossuary passage from the shrine to the galleries, dear from the galleries' side.
  { id: 'ossuary-gate', x: SANCTUARY.x, z: GALLERY_NORTH_Z, outwardX: 0, outwardZ: -1, cost: 2500, kind: 'gate', zones: ['galleries', 'sanctuary'], floor: CATACOMB_FLOOR },
];

/**
 * Zombie entrances below ground: a collapsed burial and a broken loculus
 * in the galleries, two doors of the pantheon, a broken relic alcove and a
 * fissure in the shrine's rock. The stair and its landing have none.
 */
export const CATACOMB_ENTRANCES: ReadonlyArray<DieKathedraleEntrance> = [
  { id: 'gallery-south-burial', x: -23.4, z: GALLERY_SOUTH_Z, outwardX: 0, outwardZ: 1, kind: 'door', zone: 'galleries', floor: CATACOMB_FLOOR },
  { id: 'gallery-west-loculus', x: GALLERY_WEST_X, z: -74, outwardX: -1, outwardZ: 0, kind: 'window', zone: 'galleries', floor: CATACOMB_FLOOR },
  { id: 'pantheon-south-door', x: pantheonBayCenter(2, 0).x, z: PANTHEON_SOUTH_Z, outwardX: 0, outwardZ: 1, kind: 'door', zone: 'pantheon', floor: CATACOMB_FLOOR },
  { id: 'pantheon-east-door', x: PANTHEON_EAST_X, z: pantheonBayCenter(2, 2).z, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'pantheon', floor: CATACOMB_FLOOR },
  { id: 'reliquary-alcove', x: RELIQUARY_EAST_X, z: -89, outwardX: 1, outwardZ: 0, kind: 'window', zone: 'reliquary', floor: CATACOMB_FLOOR },
  { id: 'sanctuary-fissure', x: SANCTUARY_WEST_X, z: SANCTUARY.z, outwardX: -1, outwardZ: 0, kind: 'door', zone: 'sanctuary', floor: CATACOMB_FLOOR },
];

export interface CatacombWallLine {
  readonly id: string;
  readonly axis: WallAxis;
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  /** Above the catacomb floor. */
  readonly height: number;
  /** Splits keeping every solid under the horde's 20 m obstacle limit (never on a door). */
  readonly breaks?: ReadonlyArray<number>;
  /** Free openings of the wall's own (the passages), besides its doors and entrances. */
  readonly extraOpenings?: ReadonlyArray<WallOpening>;
  /** Drawn by something else (the shrine's round wall): only its solid stands here. */
  readonly hidden?: boolean;
}

const PASSAGE_OPENING = { width: 2.4, bottom: 0, top: CATACOMB_PASSAGE_HEIGHT.apexY } as const;
const STAIR_OPENING = { center: CRYPT_STAIR_X, width: CRYPT_STAIR.maxX - CRYPT_STAIR.minX, bottom: 0, top: CRYPT_STAIR.headroom } as const;

/**
 * Every wall below ground, as centre lines 0.6 m thick. Shared lines run
 * once (the spine between the galleries and the pantheon, the pantheon's
 * north wall that is the reliquary's south). The shrine's square walls are
 * hidden behind its round one.
 */
export const CATACOMB_WALLS: ReadonlyArray<CatacombWallLine> = [
  { id: 'landing-south', axis: 'x', fixed: CRYPT_STAIR.bottomZ + HALF_WALL, min: CRYPT_LANDING.minX - CATACOMB_WALL_THICKNESS, max: CRYPT_LANDING.maxX, height: CRYPT_LANDING.apexY, extraOpenings: [STAIR_OPENING] },
  { id: 'landing-west', axis: 'z', fixed: LANDING_WEST_X, min: GALLERIES.maxZ, max: CRYPT_STAIR.bottomZ + CATACOMB_WALL_THICKNESS, height: CRYPT_LANDING.apexY },
  { id: 'east-spine', axis: 'z', fixed: EAST_SPINE_X, min: PANTHEON.minZ - CATACOMB_WALL_THICKNESS, max: CRYPT_STAIR.bottomZ + CATACOMB_WALL_THICKNESS, height: PANTHEON.apexY, breaks: [-68, -80] },
  { id: 'gallery-south', axis: 'x', fixed: GALLERY_SOUTH_Z, min: GALLERIES.minX - CATACOMB_WALL_THICKNESS, max: CRYPT_LANDING.minX, height: GALLERIES.apexY },
  { id: 'gallery-west', axis: 'z', fixed: GALLERY_WEST_X, min: GALLERIES.minZ - CATACOMB_WALL_THICKNESS, max: GALLERIES.maxZ + CATACOMB_WALL_THICKNESS, height: GALLERIES.apexY },
  { id: 'gallery-north', axis: 'x', fixed: GALLERY_NORTH_Z, min: GALLERIES.minX - CATACOMB_WALL_THICKNESS, max: GALLERIES.maxX, height: GALLERIES.apexY, breaks: [-14] },
  { id: 'pantheon-south', axis: 'x', fixed: PANTHEON_SOUTH_Z, min: PANTHEON.minX - CATACOMB_WALL_THICKNESS, max: PANTHEON.maxX + CATACOMB_WALL_THICKNESS, height: PANTHEON.apexY, breaks: [pantheonBayLines('x')[1]] },
  { id: 'pantheon-east', axis: 'z', fixed: PANTHEON_EAST_X, min: PANTHEON.minZ - CATACOMB_WALL_THICKNESS, max: PANTHEON.maxZ + CATACOMB_WALL_THICKNESS, height: PANTHEON.apexY, breaks: [pantheonBayLines('z')[1]] },
  { id: 'pantheon-north', axis: 'x', fixed: PANTHEON_NORTH_Z, min: PANTHEON.minX - CATACOMB_WALL_THICKNESS, max: PANTHEON.maxX + CATACOMB_WALL_THICKNESS, height: PANTHEON.apexY, breaks: [pantheonBayLines('x')[2]] },
  { id: 'reliquary-west', axis: 'z', fixed: RELIQUARY_WEST_X, min: RELIQUARY.minZ - CATACOMB_WALL_THICKNESS, max: RELIQUARY.maxZ, height: RELIQUARY.apexY },
  { id: 'reliquary-east', axis: 'z', fixed: RELIQUARY_EAST_X, min: RELIQUARY.minZ - CATACOMB_WALL_THICKNESS, max: RELIQUARY.maxZ, height: RELIQUARY.apexY },
  { id: 'reliquary-north', axis: 'x', fixed: RELIQUARY_NORTH_Z, min: RELIQUARY.minX - CATACOMB_WALL_THICKNESS, max: RELIQUARY.maxX + CATACOMB_WALL_THICKNESS, height: RELIQUARY.apexY },
  { id: 'breath-north', axis: 'x', fixed: BREATH_PASSAGE.maxZ + HALF_WALL, min: BREATH_PASSAGE.minX + CATACOMB_WALL_THICKNESS, max: BREATH_PASSAGE.maxX, height: CATACOMB_PASSAGE_HEIGHT.apexY },
  { id: 'breath-south', axis: 'x', fixed: BREATH_PASSAGE.minZ - HALF_WALL, min: BREATH_PASSAGE.minX + CATACOMB_WALL_THICKNESS, max: BREATH_PASSAGE.maxX, height: CATACOMB_PASSAGE_HEIGHT.apexY },
  { id: 'ossuary-west', axis: 'z', fixed: OSSUARY_PASSAGE.minX - HALF_WALL, min: OSSUARY_PASSAGE.minZ + CATACOMB_WALL_THICKNESS, max: OSSUARY_PASSAGE.maxZ, height: CATACOMB_PASSAGE_HEIGHT.apexY },
  { id: 'ossuary-east', axis: 'z', fixed: OSSUARY_PASSAGE.maxX + HALF_WALL, min: OSSUARY_PASSAGE.minZ + CATACOMB_WALL_THICKNESS, max: OSSUARY_PASSAGE.maxZ, height: CATACOMB_PASSAGE_HEIGHT.apexY },
  { id: 'sanctuary-north', axis: 'x', fixed: SANCTUARY_NORTH_Z, min: SANCTUARY_SQUARE.minX - CATACOMB_WALL_THICKNESS, max: SANCTUARY_SQUARE.maxX + CATACOMB_WALL_THICKNESS, height: SANCTUARY.apexY, hidden: true },
  { id: 'sanctuary-south', axis: 'x', fixed: SANCTUARY_SOUTH_Z, min: SANCTUARY_SQUARE.minX - CATACOMB_WALL_THICKNESS, max: SANCTUARY_SQUARE.maxX + CATACOMB_WALL_THICKNESS, height: SANCTUARY.apexY, hidden: true, extraOpenings: [{ center: SANCTUARY.x, ...PASSAGE_OPENING }] },
  { id: 'sanctuary-west', axis: 'z', fixed: SANCTUARY_WEST_X, min: SANCTUARY_SQUARE.minZ - CATACOMB_WALL_THICKNESS, max: SANCTUARY_SQUARE.maxZ + CATACOMB_WALL_THICKNESS, height: SANCTUARY.apexY, hidden: true },
  { id: 'sanctuary-east', axis: 'z', fixed: SANCTUARY_EAST_X, min: SANCTUARY_SQUARE.minZ - CATACOMB_WALL_THICKNESS, max: SANCTUARY_SQUARE.maxZ + CATACOMB_WALL_THICKNESS, height: SANCTUARY.apexY, hidden: true, extraOpenings: [{ center: SANCTUARY.z, ...PASSAGE_OPENING }] },
];

/**
 * Wall arcs of the round shrine, as (cos, sin) half-extents of the
 * rectangles inscribed in its circle: their union is where a body may
 * stand, so nobody walks through the curved wall drawn at the radius.
 */
export const SANCTUARY_INSCRIBED_STEPS: ReadonlyArray<readonly [number, number]> = [15, 30, 45, 60, 75].map((degrees) => {
  const angle = degrees * Math.PI / 180;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

/** The cuts the passages make in the round wall: half-widths of their mouths, around their compass points. */
export const SANCTUARY_OPENINGS: ReadonlyArray<{ readonly angle: number; readonly halfWidth: number; readonly top: number }> = [
  // East: the breath passage from the reliquary.
  { angle: 0, halfWidth: PASSAGE_OPENING.width / 2, top: PASSAGE_OPENING.top },
  // South: the ossuary passage back to the galleries.
  { angle: Math.PI / 2, halfWidth: PASSAGE_OPENING.width / 2, top: PASSAGE_OPENING.top },
  // West: the fissure the dead climb out of.
  { angle: Math.PI, halfWidth: 0.85, top: 2.3 },
];

/** Shrine pedestal: a stepped drum crowned by an empty cup. */
export const SANCTUARY_PEDESTAL = { baseRadius: 1.15, steps: 2, stepHeight: 0.18, shaftRadius: 0.34, height: 1.15 } as const;

/** The Wind Bow's three parts. Stable ids: save data and future quest logic will key on them. */
export const WIND_BOW_COMPONENTS = ['oathwood', 'whisperstring', 'tempestCore'] as const;
export type WindBowComponentId = typeof WIND_BOW_COMPONENTS[number];

/**
 * Where each part will one day wait. Reserved spots only: nothing is spawned,
 * shown or interactive yet. `area` names the place for people reading this.
 */
export const WIND_BOW_COMPONENT_SITES: Readonly<Record<WindBowComponentId, {
  readonly area: string;
  readonly floor: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}>> = {
  // Inside the empty royal tomb, under the crack the wind comes through.
  oathwood: { area: 'royal-pantheon/tomb-east', floor: CATACOMB_FLOOR, position: { x: pantheonBayCenter(2, 1).x, y: CATACOMB_FLOOR_Y + 0.55, z: pantheonBayCenter(2, 1).z } },
  // Hidden upstairs, in the priest's booth of the confessional (east aisle, bay 4; see NaveFurniture).
  whisperstring: { area: 'cathedral/confessional', floor: 0, position: { x: 13.45, y: 1.1, z: -31.5 } },
  // On the shrine's pedestal.
  tempestCore: { area: 'sanctuary/pedestal', floor: CATACOMB_FLOOR, position: { x: SANCTUARY.x, y: CATACOMB_FLOOR_Y + SANCTUARY_PEDESTAL.height + 0.12, z: SANCTUARY.z } },
};

/**
 * The reliquary's altar, the bow's future assembly: a stone table with three
 * empty sockets on its top, one per part, ordered as `WIND_BOW_COMPONENTS`.
 */
export const WIND_BOW_ALTAR = {
  x: 0,
  z: -89.4,
  width: 2.4,
  depth: 1.2,
  height: 1.02,
  socketRadius: 0.17,
  socketSpacing: 0.72,
} as const;

/** World position of a socket on the altar's top, where its part will be set. */
export function windBowSocket(component: WindBowComponentId): { readonly x: number; readonly y: number; readonly z: number } {
  const index = WIND_BOW_COMPONENTS.indexOf(component);
  return {
    x: WIND_BOW_ALTAR.x + (index - 1) * WIND_BOW_ALTAR.socketSpacing,
    y: CATACOMB_FLOOR_Y + WIND_BOW_ALTAR.height + 0.02,
    z: WIND_BOW_ALTAR.z,
  };
}

/** Weapons below ground, each in reach of a light. */
export const CATACOMB_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    // The south corridor of the galleries, facing the stair's landing.
    id: 'gallery-vector',
    weaponId: 'vector',
    price: 1200,
    ammoPrice: 600,
    position: { x: -16.5, y: CATACOMB_FLOOR_Y + 1.45, z: GALLERIES.maxZ - 0.02 },
    yaw: Math.PI,
    floor: CATACOMB_FLOOR,
  },
  {
    // On the pantheon's south wall, at the warrior king's feet.
    id: 'pantheon-m4a1',
    weaponId: 'm4a1',
    price: 1500,
    ammoPrice: 750,
    position: { x: 1.9, y: CATACOMB_FLOOR_Y + 1.45, z: PANTHEON.maxZ - 0.02 },
    yaw: Math.PI,
    floor: CATACOMB_FLOOR,
  },
];

/** Stone corbels carrying candles, on a wall face looking (`facingX`, `facingZ`). */
export const GALLERY_CANDLE_LEDGES: ReadonlyArray<{ readonly id: string; readonly x: number; readonly z: number; readonly facingX: number; readonly facingZ: number }> = [
  { id: 'gallery-south-west-candles', x: GALLERIES.minX, z: -66.7, facingX: 1, facingZ: 0 },
  { id: 'gallery-south-candles', x: -18.5, z: GALLERIES.maxZ, facingX: 0, facingZ: -1 },
  { id: 'gallery-west-candles', x: NICHE_BLOCKS[0].minX, z: -76.5, facingX: -1, facingZ: 0 },
  { id: 'gallery-north-candles', x: -24, z: GALLERIES.minZ, facingX: 0, facingZ: 1 },
  { id: 'gallery-east-candles', x: GALLERIES.maxX, z: -79, facingX: -1, facingZ: 0 },
];
/** Height of a corbel's top above the floor, and how far it carries its candles out from the wall. */
export const GALLERY_LEDGE_HEIGHT = 1.45;
export const GALLERY_LEDGE_REACH = 0.22;

const TORCH_COLOR = 0xff9548;
const CANDLE_COLOR = 0xffa552;
/** The pale, cold green-blue of the wind: kept for the places of the future bow. */
export const WIND_ACCENT_COLOR = 0x86d6cb;

const lowY = (height: number): number => CATACOMB_FLOOR_Y + height;

/** Desaturated blue-grey of the cathedral's night, as little of it as reaches down the stair. */
const STAIR_SPILL_COLOR = 0x7d8ea6;

/**
 * Light below ground. Torches mark the stair and the reliquary gate, a few
 * candles keep the galleries readable, a crown of candles hangs over the
 * pantheon's central bay with candles at two tombs, and the reliquary has
 * its altar candles. The west tomb stays dark. A faint cold spill of the
 * night above comes down the stair; only the crack behind the empty tomb and
 * the shrine glow with the wind's cold light. Every site is permanent.
 */
export const CATACOMB_LIGHT_SITES: ReadonlyArray<DieKathedraleLightSite> = [
  { id: 'crypt-head-torch', x: CRYPT_STAIR.maxX - 0.15, y: 2.2, z: CRYPT_STAIR.topZ - 0.3, color: TORCH_COLOR, intensity: 6, distance: 8, flicker: true },
  { id: 'crypt-foot-torch', x: CRYPT_LANDING.minX + 0.15, y: lowY(2.2), z: -62.3, color: TORCH_COLOR, intensity: 6, distance: 8, flicker: true },
  { id: 'crypt-stair-spill', x: CRYPT_STAIR_X, y: lowY(2.4), z: CRYPT_STAIR.bottomZ - 0.8, color: STAIR_SPILL_COLOR, intensity: 1.4, distance: 6, flicker: false },
  { id: 'pantheon-reliquary-torch', x: -2.6, y: lowY(2.2), z: PANTHEON.minZ + 0.15, color: TORCH_COLOR, intensity: 5.5, distance: 8, flicker: true },
  ...GALLERY_CANDLE_LEDGES.map((ledge) => ({
    id: ledge.id,
    x: ledge.x + ledge.facingX * GALLERY_LEDGE_REACH,
    y: lowY(GALLERY_LEDGE_HEIGHT + 0.2),
    z: ledge.z + ledge.facingZ * GALLERY_LEDGE_REACH,
    color: CANDLE_COLOR, intensity: 4.5, distance: 7, flicker: true,
  })),
  { id: 'pantheon-crown', ...pantheonBayCenter(1, 1), y: lowY(PANTHEON.apexY - 1.2), color: CANDLE_COLOR, intensity: 10, distance: 12, flicker: true },
  { id: 'pantheon-tomb-south-candles', x: pantheonBayCenter(1, 0).x, y: lowY(1.5), z: pantheonBayCenter(1, 0).z + ROYAL_TOMB.length / 2 + 0.55, color: CANDLE_COLOR, intensity: 5, distance: 7, flicker: true },
  { id: 'pantheon-tomb-north-candles', x: pantheonBayCenter(1, 2).x, y: lowY(1.5), z: pantheonBayCenter(1, 2).z - ROYAL_TOMB.length / 2 - 0.55, color: CANDLE_COLOR, intensity: 5, distance: 7, flicker: true },
  { id: 'pantheon-crack', x: PANTHEON_CRACK.x - 0.9, y: lowY(1.9), z: PANTHEON_CRACK.z, color: WIND_ACCENT_COLOR, intensity: 1.6, distance: 5, flicker: false },
  { id: 'reliquary-candles', x: WIND_BOW_ALTAR.x, y: lowY(2), z: RELIQUARY.minZ + 0.9, color: CANDLE_COLOR, intensity: 6, distance: 8, flicker: true },
  { id: 'sanctuary-breath', x: SANCTUARY.x, y: lowY(2.4), z: SANCTUARY.z, color: WIND_ACCENT_COLOR, intensity: 3.5, distance: 9, flicker: false },
];

/**
 * The underground's own sounds, heard only below ground: water dripping by
 * the stair and in the far gallery, stone settling, a gate working, the
 * wind behind the cracked wall and round the shrine, and once in a long
 * while something knocking from inside the dark tomb.
 */
export const CATACOMB_AMBIENT_EVENTS: ReadonlyArray<AmbientEventTiming & ArenaAmbientCue> = [
  { sound: 'water-drip', position: { x: -12.2, y: lowY(2.6), z: -63.4 }, initialDelay: 8, minInterval: 14, maxInterval: 32 },
  { sound: 'water-drip', position: { x: -28.6, y: lowY(2.6), z: -81 }, initialDelay: 20, minInterval: 26, maxInterval: 55 },
  { sound: 'stone-settle', position: { x: -23.4, y: lowY(3), z: -74 }, initialDelay: 30, minInterval: 60, maxInterval: 140 },
  { sound: 'wind-gust', position: { x: PANTHEON_CRACK.x + 2, y: lowY(2), z: PANTHEON_CRACK.z }, initialDelay: 25, minInterval: 40, maxInterval: 90 },
  { sound: 'metal-echo', position: { x: EAST_SPINE_X, y: lowY(1.5), z: pantheonBayCenter(0, 1).z }, initialDelay: 60, minInterval: 80, maxInterval: 170 },
  { sound: 'distant-knock', position: { x: pantheonBayCenter(0, 1).x, y: lowY(0.8), z: pantheonBayCenter(0, 1).z }, initialDelay: 90, minInterval: 110, maxInterval: 220 },
  { sound: 'wind-gust', position: { x: SANCTUARY.x, y: lowY(3.5), z: SANCTUARY_SQUARE.minZ - 1 }, initialDelay: 45, minInterval: 50, maxInterval: 110 },
];

/**
 * How the night changes below ground: no moon, half the sky-like fill turned
 * a cold desaturated blue-grey, and a closer, colder haze, so the warm
 * torches and candles shape every room against it while silhouettes still
 * read in the corners. The shares scale the cathedral's own values
 * (`DIE_KATHEDRALE_AMBIENCE`); the fill's colors replace its own.
 */
export const CATACOMB_MOOD = {
  fogColor: 0x05070a,
  fogDensity: 0.046,
  hemisphereShare: 0.5,
  hemisphereSky: 0x2e3742,
  hemisphereGround: 0x080706,
  environmentShare: 0.35,
  moonShare: 0,
} as const;

/**
 * Soft additive glow round every flame below ground, so a candle far from
 * any real light still lights its own air: its size grows with the reach of
 * its site, kept faint so nothing blooms.
 */
export const CATACOMB_FLAME_HALO = { sizePerDistance: 0.18, opacity: 0.2 } as const;

/**
 * The dead of the royal crypt: walkers rising below ground are centuries-old
 * remains in shrouds, rusted mail or a noble's cloak, and stay so wherever
 * they chase. Their sockets keep only a faint cold glint instead of the
 * horde's blue eyes.
 */
export const CRYPT_ZOMBIE_LOOK: ZombieFloorLook = {
  floor: CATACOMB_FLOOR,
  skinShares: [
    { skin: 'cryptShrouded', weight: 5 },
    { skin: 'cryptKnight', weight: 3 },
    { skin: 'cryptNoble', weight: 2 },
  ],
  eyes: { glow: 0x06080c, core: 0x2a3242 },
};

/**
 * Royal tombs the dead of the crypt climb out of, a hand-picked few: the
 * dark queen's tomb, whose lid grinds aside the first time and stays ajar
 * until the run restarts, and the empty one, already open. `side` is the
 * long side a body climbs out by (+1 east, -1 west), towards the room;
 * `inset` how far from the chest's middle towards that side it rises,
 * `along` how far south (+) or north (-); `lidShift` how far the lid
 * grinds away from that side (none: the chest stands open).
 */
export interface CryptTombEmergence {
  readonly tombId: string;
  readonly side: 1 | -1;
  readonly inset: number;
  readonly along: number;
  readonly lidShift?: number;
}

export const CRYPT_TOMB_EMERGENCES: ReadonlyArray<CryptTombEmergence> = [
  { tombId: 'tomb-west', side: 1, inset: 0.4, along: 0, lidShift: 0.5 },
  // North of the broken head and the rubble on its west side.
  { tombId: 'tomb-east', side: -1, inset: 0.1, along: -0.35 },
];

/** What a rising body climbs over: the top of the chest. */
const TOMB_RIM = ROYAL_TOMB.plinthHeight + ROYAL_TOMB.chestHeight;
/** From a chest's middle to clear floor beyond its side: half the chest, its solid's margin, a walker's body and a hand's breadth. */
const TOMB_EXIT_REACH = ROYAL_TOMB.width / 2 + 0.17 + 0.42 + 0.16;

/** Where each picked tomb's dead rise and land, awake once the pantheon is open. */
export const CRYPT_EMERGENCE_SITES: ReadonlyArray<ZombieEmergenceSite & { readonly zone: CatacombZoneId }> = CRYPT_TOMB_EMERGENCES.map((emergence) => {
  const tomb = ROYAL_TOMBS.find((candidate) => candidate.id === emergence.tombId);
  if (!tomb) throw new Error(`Unknown royal tomb ${emergence.tombId}`);
  const z = tomb.z + emergence.along;
  return {
    id: tomb.id,
    zone: 'pantheon',
    floor: CATACOMB_FLOOR,
    rise: { x: tomb.x + emergence.side * emergence.inset, y: CATACOMB_FLOOR_Y, z },
    exit: { x: tomb.x + emergence.side * TOMB_EXIT_REACH, z },
    rim: TOMB_RIM,
    rimDistance: ROYAL_TOMB.width / 2 - emergence.inset,
  };
});

/**
 * How the tombs take their share of the crypt's walkers: a quarter of those
 * spawning below ground from the second round, each tomb resting a while
 * after, never beside the player. The tomb stirs for a beat with nobody
 * seen, the body rises in place, then climbs over the rim and hunts.
 */
export const CRYPT_TOMB_EMERGENCE: ZombieEmergenceTuning = {
  chance: 0.25,
  minRound: 2,
  cooldown: 20,
  minPlayerDistance: 5,
  timing: { stir: 1.2, rise: 1.6, climb: 1.1 },
};

/** Pale motes turning round the shrine's pedestal, per quality tier. */
export const SANCTUARY_MOTE_COUNT = { low: 36, medium: 60, high: 96, ultraMax: 140 } as const;
