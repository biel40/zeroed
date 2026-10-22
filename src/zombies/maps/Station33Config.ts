import type { RingId } from '../../game/rings/RingCatalog';
import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { AmbientEventTiming } from './shared/AmbientEventScheduler';
import type {
  ArenaAmbience,
  ArenaAmbientCue,
  ArenaIntro,
  MysteryBoxPlacement,
  PlayerBounds,
  ZombieNavigationBounds,
} from './ZombieArena';

/**
 * Station 33 layout data. Every coordinate is in metres, feet height 0 on
 * the vestibule floor.
 *
 * AXIS PLAN (the map grows by phases without moving what already exists):
 * - Z is the station's longitudinal axis. The vestibule (phase 1) is the
 *   southern end, z in [0, 18]; its south wall is the collapsed way up to
 *   the surface, which is never shown.
 * - z = 0 is the vestibule's north wall: the escalator portal. Everything
 *   deeper lies at z < 0 and below y = 0, descending northwards.
 * - Phase 2 (built) is the luggage office (`consigna`), behind a paid door
 *   in the vestibule's east wall: a corridor between the two east vent
 *   passages, then the locker hall past their dead ends, all at z >= 0.
 * - Phase 3 opens the escalator: an incline from z = 0 down to the mezzanine
 *   (floor -1), joined with `floorTransitions` like the mansion stairs.
 * - Phase 4 is the central platform (floor -2) with tracks along Z further
 *   north; tunnels, substation, service level and bunker follow beyond it.
 * Zombie spawn passages run 6 m outward from each entrance at y = 0 (see
 * SERVICE_PASSAGE); later zones must leave those footprints free.
 */

export const STATION33_WALL_THICKNESS = 0.3;

/** Interior faces of the vestibule hall; walls are centred half a thickness outside. */
export const VESTIBULE = {
  minX: -7,
  maxX: 7,
  minZ: 0,
  maxZ: 18,
  /** Spring line of the vault: top of the side walls and the cornice. */
  wallHeight: 3.9,
  vaultApexY: 4.9,
} as const;

/** The sealed frontier: escalator mouth in the north wall, opened in phase 3. */
export const ESCALATOR_PORTAL = {
  centerX: 0,
  width: 6.4,
  height: 3.0,
} as const;

/** Two rows of square marble columns flanking the central nave. */
export const VESTIBULE_COLUMNS = {
  xs: [-3.5, 3.5],
  zs: [4.5, 9, 13.5],
  size: 0.7,
} as const;

/**
 * Turnstile cabinets between the middle columns. Passages of ~1.37 m let a
 * zombie body (radius 0.42) and the navigation grid (0.35 m cells) through.
 */
export const TURNSTILE_LINE = {
  z: 9,
  xs: [-1.65, 0, 1.65],
  width: 0.28,
  length: 1.0,
  height: 1.0,
} as const;

/** Ticket-office facade against the west wall, near the surface entrance. */
export const TICKET_OFFICE = {
  minZ: 10.5,
  maxZ: 16.5,
  depth: 0.65,
  height: 2.7,
  windows: 3,
} as const;

/** Benches against the east wall; one bench lies overturned near the escalator. */
export const VESTIBULE_BENCHES = [
  // Yaw turns the backrest (local -Z) against the wall.
  { id: 'east-bench', x: 6.68, z: 10.6, yaw: -Math.PI / 2, overturned: false },
  { id: 'overturned-bench', x: -5.1, z: 2.0, yaw: 0, overturned: true },
] as const;

/** Board tuning shared with the mansion's balance. */
export const STATION33_BARRIER_CONFIG: WindowBarrierConfig = {
  boardCount: 5,
  boardHp: 100,
  repairInterval: 0.55,
  repairRewardCap: 4,
};

/** Wall apertures by barrier skin: gates are walk-through, vents keep a low sill. */
export const STATION33_OPENINGS = {
  gate: { width: 1.5, bottom: 0, top: 2.2 },
  vent: { width: 1.5, bottom: 0.3, top: 1.9 },
} as const;

export type Station33BarrierKind = keyof typeof STATION33_OPENINGS;

export interface Station33Barrier {
  readonly id: string;
  /** Centre of the opening on the wall's centre line. */
  readonly x: number;
  readonly z: number;
  /** Outward normal: the side its zombies come from. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly kind: Station33BarrierKind;
  /** Zone whose unlock activates this entrance. */
  readonly zone: Station33ZoneId;
}

export type Station33ZoneId = 'vestibule' | 'consigna';

export const STATION33_START_ZONE: Station33ZoneId = 'vestibule';

/**
 * Phase 2 luggage office, interior faces like VESTIBULE. The corridor runs
 * east from the vestibule door between the two east vent passages (5.8 m
 * wide, room for the horde and the player to pass each other); the hall
 * starts past their dead ends (x = 13.6) and shares the vestibule's south
 * line, so the player bounds close its south entrance the same way.
 */
export const CONSIGNA = {
  corridor: { minX: VESTIBULE.maxX + STATION33_WALL_THICKNESS, maxX: 14, minZ: 7, maxZ: 12.8 },
  hall: { minX: 14, maxX: 21, minZ: 6, maxZ: VESTIBULE.maxZ },
  /** Flat service ceiling, lower than the vestibule vault. */
  ceilingHeight: 3.2,
} as const;

const WEST_WALL_X = VESTIBULE.minX - STATION33_WALL_THICKNESS / 2;
const EAST_WALL_X = VESTIBULE.maxX + STATION33_WALL_THICKNESS / 2;
const SOUTH_WALL_Z = VESTIBULE.maxZ + STATION33_WALL_THICKNESS / 2;
const CONSIGNA_EAST_WALL_X = CONSIGNA.hall.maxX + STATION33_WALL_THICKNESS / 2;

/**
 * Zombie entrances: the vestibule's surface stairs, service door and two
 * vents, then the luggage office's porters' stairs and grille, which only
 * wake once its door is bought.
 */
export const STATION33_BARRIERS: ReadonlyArray<Station33Barrier> = [
  { id: 'surface-stairs', x: -3.6, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'vestibule' },
  { id: 'service-door-west', x: WEST_WALL_X, z: 4.0, outwardX: -1, outwardZ: 0, kind: 'gate', zone: 'vestibule' },
  // Spread apart in phase 2 so the luggage-office corridor fits between their passages.
  { id: 'vent-east-north', x: EAST_WALL_X, z: 4.6, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
  { id: 'vent-east-south', x: EAST_WALL_X, z: 15.4, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
  { id: 'consigna-porters-stairs', x: 17.5, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'consigna' },
  { id: 'consigna-vent-east', x: CONSIGNA_EAST_WALL_X, z: 15.4, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'consigna' },
];

export interface Station33Door {
  readonly id: string;
  /** Centre of the door on its wall's centre line. */
  readonly x: number;
  readonly z: number;
  /** Towards the zone it opens: debris bursts that way. */
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly cost: number;
  readonly zone: Station33ZoneId;
}

/**
 * Paid doors. The first one costs what the mansion's first door does (750);
 * it sits beside the east bench, clear of both vent openings.
 */
export const STATION33_DOORS: ReadonlyArray<Station33Door> = [
  { id: 'to-consigna', x: EAST_WALL_X, z: 8.8, outwardX: 1, outwardZ: 0, cost: 750, zone: 'consigna' },
];

/** Dead-end service passage behind every entrance, where its zombies appear. */
export const SERVICE_PASSAGE = {
  length: 6,
  width: { gate: 2.2, vent: 1.8 },
  height: { gate: 2.6, vent: 2.2 },
  /** Distance from the wall centre line to the spawn, along the outward normal. */
  spawnDepth: 4.6,
  /** Exterior waiting point in front of the boards. */
  approachDepth: 0.9,
  /** First point inside the hall once the boards are gone. */
  breachDepth: 0.6,
} as const;

function spawnBehind(barrier: Station33Barrier): ZombieSpawnPoint {
  const along = (depth: number): { x: number; z: number } => ({
    x: barrier.x + barrier.outwardX * depth,
    z: barrier.z + barrier.outwardZ * depth,
  });
  const spawn = along(SERVICE_PASSAGE.spawnDepth);
  const approach = along(SERVICE_PASSAGE.approachDepth);
  const breach = along(-SERVICE_PASSAGE.breachDepth);
  return {
    x: spawn.x,
    z: spawn.z,
    barrierId: barrier.id,
    approachX: approach.x,
    approachZ: approach.z,
    breachX: breach.x,
    breachZ: breach.z,
    exterior: true,
  };
}

/** Spawn points per unlocked zone, one at the end of each entrance passage. */
export const STATION33_SPAWNS: Readonly<Record<Station33ZoneId, ReadonlyArray<ZombieSpawnPoint>>> = {
  vestibule: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'vestibule').map(spawnBehind),
  consigna: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'consigna').map(spawnBehind),
};

/** Weapon outlines 2 cm in front of the wall face; prices follow the mansion's balance. */
export const STATION33_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    // A Soviet station keeps the rifle of the era by the turnstiles.
    id: 'vestibule-ak47',
    weaponId: 'ak47',
    price: 1750,
    ammoPrice: 900,
    position: { x: WEST_WALL_X + 0.17, y: 1.45, z: 8.0 },
    yaw: Math.PI / 2,
    floor: 0,
  },
];

/** The luggage office's crate, against the north lockers with its front to the hall. */
export const STATION33_BOX_PLACEMENT: MysteryBoxPlacement = {
  position: { x: 17.6, y: 0, z: CONSIGNA.hall.minZ + 0.6 },
  yaw: Math.PI,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
};

/** Open luggage locker holding a ring, at the end of the corridor's axis. */
export interface Station33RingLocker {
  readonly id: string;
  readonly ringId: RingId;
  /** Centre of the locker's open front, on the hall face of its bank. */
  readonly x: number;
  readonly z: number;
  /** Direction the open front faces (into the hall). */
  readonly facingX: number;
  readonly facingZ: number;
}

/** Depth and height of the luggage lockers that line the hall walls. */
export const CONSIGNA_LOCKER = { depth: 0.5, height: 2.0, columnWidth: 0.42, rows: 3, ringLockerWidth: 0.62 } as const;

export const STATION33_RING_LOCKERS: ReadonlyArray<Station33RingLocker> = [
  { id: 'consigna-resurrection', ringId: 'resurrection', x: CONSIGNA.hall.maxX - CONSIGNA_LOCKER.depth, z: 9.9, facingX: -1, facingZ: 0 },
];

export const STATION33_PLAYER_SPAWN = { x: 0, y: 1.72, z: 15.2, floor: 0 } as const;

/**
 * Player movement over the vestibule and the luggage office, inset by the
 * body radius. One rectangle covers both: walls and the closed door keep
 * the player out of the office (and out of the gap between the rooms)
 * until it is bought; the shared south line keeps both south gates shut.
 */
export const STATION33_PLAYER_BOUNDS: PlayerBounds = {
  minX: VESTIBULE.minX + 0.4,
  maxX: CONSIGNA.hall.maxX - 0.4,
  minZ: VESTIBULE.minZ + 0.4,
  maxZ: VESTIBULE.maxZ - 0.4,
};

/** Both rooms plus every entrance passage on the vestibule level. */
export const STATION33_NAVIGATION_BOUNDS: ReadonlyArray<ZombieNavigationBounds> = [
  { floor: 0, minX: -13.5, maxX: 27.8, minZ: 0, maxZ: 24.7, baseY: 0 },
];

/** Cold, damp underground air: green-grey haze, nothing of the mansion's smoke. */
export const STATION33_AMBIENCE = {
  backgroundColor: 0x030504,
  fog: { color: 0x080c0a, density: 0.075 },
  hemisphereLight: { skyColor: 0x3c4c46, groundColor: 0x120e0a, intensity: 0.5, reducedIntensity: 0.7 },
  // Underground: almost no sky-like fill, the fluorescents and lamps do the lighting.
  environmentIntensity: { intensity: 0.1, reducedIntensity: 0.12 },
  // Provisional: the only gameplay bed until the station gets its own track.
  musicTrack: 'background_music_theme',
} as const satisfies ArenaAmbience;

/**
 * Flicker personality of a light circuit. Mains circuits die during a power
 * dip; the emergency circuit runs on batteries.
 */
export type Station33LightCircuit = 'steady' | 'unstable' | 'failing' | 'amber' | 'emergency';

export interface Station33PointLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  readonly circuit: Station33LightCircuit;
  /** Room it lights: the player's room gets its lights first. */
  readonly zone: Station33ZoneId;
}

export const FLUORESCENT_COLOR = 0xd2eadf;
export const AMBER_LAMP_COLOR = 0xffa65a;
export const EMERGENCY_COLOR = 0xff2a12;

/** Zone holding a floor point at `x`: the vestibule's east wall separates the rooms. */
export function station33ZoneAt(x: number): Station33ZoneId {
  return x > EAST_WALL_X ? 'consigna' : 'vestibule';
}

/** Battery emergency lamp beside the sealed escalator portal. */
export const EMERGENCY_LAMP = { x: -3.75, y: 2.6, z: VESTIBULE.minZ } as const;

/**
 * Dynamic lights in priority order within each room. A quality level keeps
 * the first POINT_LIGHT_BUDGET entries, taking the player's room first and
 * filling up with the other room's; everything else glows through emissive
 * meshes. The luggage-office lights are short so they never leak through
 * the wall it shares with the vestibule.
 */
export const STATION33_POINT_LIGHTS: ReadonlyArray<Station33PointLight> = [
  { x: 0, y: 3.85, z: 5.6, color: FLUORESCENT_COLOR, intensity: 9, distance: 12, circuit: 'steady', zone: 'vestibule' },
  { x: 0, y: 3.85, z: 13.2, color: FLUORESCENT_COLOR, intensity: 8, distance: 12, circuit: 'unstable', zone: 'vestibule' },
  { x: EMERGENCY_LAMP.x, y: EMERGENCY_LAMP.y, z: EMERGENCY_LAMP.z + 0.6, color: EMERGENCY_COLOR, intensity: 4, distance: 6.5, circuit: 'emergency', zone: 'vestibule' },
  { x: -6.1, y: 2.75, z: 13.5, color: AMBER_LAMP_COLOR, intensity: 3.2, distance: 6.5, circuit: 'amber', zone: 'vestibule' },
  { x: 6.1, y: 2.75, z: 8.2, color: AMBER_LAMP_COLOR, intensity: 3, distance: 6.5, circuit: 'amber', zone: 'vestibule' },
  { x: -2, y: 3.85, z: 2.5, color: FLUORESCENT_COLOR, intensity: 5, distance: 9, circuit: 'failing', zone: 'vestibule' },
  { x: 17.5, y: 2.95, z: 9.2, color: FLUORESCENT_COLOR, intensity: 5, distance: 7, circuit: 'steady', zone: 'consigna' },
  { x: 17.5, y: 2.95, z: 14.8, color: FLUORESCENT_COLOR, intensity: 4.5, distance: 7, circuit: 'failing', zone: 'consigna' },
  { x: 10.6, y: 2.95, z: 9.9, color: FLUORESCENT_COLOR, intensity: 4, distance: 4.5, circuit: 'unstable', zone: 'consigna' },
];

/**
 * Linear fluorescent fixtures along Z, hung under the vault or the
 * luggage-office ceiling. The vestibule slot at (2, 6.75) is empty: that
 * fixture tore loose and dangles from one chain.
 */
export const FLUORESCENT_FIXTURES: ReadonlyArray<{ readonly x: number; readonly z: number; readonly circuit: Station33LightCircuit | 'dead' }> = [
  { x: -2, z: 2.5, circuit: 'failing' },
  { x: 2, z: 2.5, circuit: 'steady' },
  { x: -2, z: 6.75, circuit: 'steady' },
  { x: -2, z: 11.25, circuit: 'unstable' },
  { x: 2, z: 11.25, circuit: 'dead' },
  { x: -2, z: 15.5, circuit: 'steady' },
  { x: 2, z: 15.5, circuit: 'failing' },
  { x: 10.6, z: 9.9, circuit: 'unstable' },
  { x: 17.5, z: 9.2, circuit: 'steady' },
  { x: 19.4, z: 12, circuit: 'dead' },
  { x: 17.5, z: 14.8, circuit: 'failing' },
];

/** Amber glass sconces on the side walls; `yaw` faces the hall. */
export const AMBER_SCONCES: ReadonlyArray<{ readonly x: number; readonly z: number; readonly lit: boolean }> = [
  { x: VESTIBULE.minX, z: 13.5, lit: true },
  { x: VESTIBULE.minX, z: 2.5, lit: false },
  { x: VESTIBULE.maxX, z: 8.2, lit: true },
  { x: VESTIBULE.maxX, z: 2.6, lit: true },
  { x: VESTIBULE.maxX, z: 16.9, lit: false },
];

export type Station33AmbientEffect = 'none' | 'tremor' | 'blackout';

/** A scheduled ambient event: what it sounds like and what it does to the hall. */
export interface Station33AmbientEvent extends AmbientEventTiming, ArenaAmbientCue {
  readonly id: string;
  readonly effect: Station33AmbientEffect;
  /** Seconds the visual effect lasts. */
  readonly duration: number;
}

/**
 * Occasional life of the dead station. Each one has a procedural voice; set
 * `sampleFile` to an MP3 in `public/assets/audio/` to replace it.
 */
export const STATION33_AMBIENT_EVENTS: ReadonlyArray<Station33AmbientEvent> = [
  {
    id: 'pa-announcement',
    sound: 'pa-crackle',
    position: { x: -3.5, y: 3.3, z: 9.4 },
    effect: 'none',
    duration: 0,
    initialDelay: 20,
    minInterval: 55,
    maxInterval: 110,
  },
  {
    id: 'distant-train',
    sound: 'distant-train',
    position: { x: 0, y: -8, z: -30 },
    effect: 'tremor',
    duration: 4.5,
    initialDelay: 45,
    minInterval: 70,
    maxInterval: 140,
  },
  {
    id: 'power-dip',
    sound: 'power-dip',
    position: { x: 0, y: 4.2, z: 9 },
    effect: 'blackout',
    duration: 1.4,
    initialDelay: 75,
    minInterval: 90,
    maxInterval: 170,
  },
];

/**
 * Opening cinematic: the camera wakes at the sealed escalator in the dark,
 * a train shakes the vault, the circuits kick on one after another and the
 * view cranes back over the turnstiles into the player's eyes at the spawn.
 * Shots stay inside the hall, clear of columns, fixtures and the vault.
 */
export const STATION33_INTRO: ArenaIntro = {
  presentation: 'station33',
  duration: 8,
  shots: [
    { time: 0, position: { x: 1.4, y: 1.15, z: 2.4 }, target: { x: -1.6, y: 1.9, z: 0 } },
    { time: 2.2, position: { x: 0.3, y: 2.3, z: 5.2 }, target: { x: -0.4, y: 1.5, z: 0.4 } },
    { time: 4.6, position: { x: -1.1, y: 3.4, z: 10.8 }, target: { x: 0, y: 1.1, z: 4 } },
    { time: 6.5, position: { x: 0.5, y: 2.3, z: 17.1 }, target: { x: 0, y: 1.6, z: 8 } },
  ],
};

/**
 * Seconds into the intro when each mains circuit kicks on (the battery
 * emergency lamp never goes out). Ordered so light sweeps the hall.
 */
export const STATION33_INTRO_POWER_UP: Readonly<Record<Exclude<Station33LightCircuit, 'emergency'>, number>> = {
  amber: 1.1,
  failing: 1.8,
  steady: 2.4,
  unstable: 3.1,
};

/** Ambient events the intro fires on its own clock, by `STATION33_AMBIENT_EVENTS` id. */
export const STATION33_INTRO_CUES: ReadonlyArray<{ readonly time: number; readonly eventId: string }> = [
  { time: 0.2, eventId: 'distant-train' },
  { time: 4.4, eventId: 'pa-announcement' },
];
