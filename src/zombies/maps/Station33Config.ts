import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { AmbientEventTiming } from './shared/AmbientEventScheduler';
import type { ArenaAmbience, ArenaAmbientCue, MysteryBoxPlacement, PlayerBounds, ZombieNavigationBounds } from './ZombieArena';

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
 * - Phase 2 opens a side zone off the vestibule through a paid door in the
 *   east or west wall (x beyond +-7.15), between the entrance passages, and
 *   keeps z >= 0. Wall decoration may move to make room; passages may not.
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

export type Station33ZoneId = 'vestibule';

export const STATION33_START_ZONE: Station33ZoneId = 'vestibule';

const WEST_WALL_X = VESTIBULE.minX - STATION33_WALL_THICKNESS / 2;
const EAST_WALL_X = VESTIBULE.maxX + STATION33_WALL_THICKNESS / 2;
const SOUTH_WALL_Z = VESTIBULE.maxZ + STATION33_WALL_THICKNESS / 2;

/** Zombie entrances of the vestibule: the surface stairs, a service door and two vents. */
export const STATION33_BARRIERS: ReadonlyArray<Station33Barrier> = [
  { id: 'surface-stairs', x: -3.6, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'vestibule' },
  { id: 'service-door-west', x: WEST_WALL_X, z: 4.0, outwardX: -1, outwardZ: 0, kind: 'gate', zone: 'vestibule' },
  { id: 'vent-east-north', x: EAST_WALL_X, z: 6.4, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
  { id: 'vent-east-south', x: EAST_WALL_X, z: 13.6, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
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
};

/** Weapon outlines 2 cm in front of the wall face; prices follow the mansion's balance. */
export const STATION33_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    id: 'vestibule-m1911',
    weaponId: 'm1911',
    price: 500,
    ammoPrice: 250,
    position: { x: EAST_WALL_X - 0.17, y: 1.45, z: 16.2 },
    yaw: -Math.PI / 2,
    floor: 0,
  },
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

/** Next to the sealed escalator, facing the hall. */
export const STATION33_BOX_PLACEMENT: MysteryBoxPlacement = {
  position: { x: 4.9, y: 0, z: 0.95 },
  yaw: Math.PI,
  useRange: 2.2,
  lookDotMin: 0.5,
  floor: 0,
};

export const STATION33_PLAYER_SPAWN = { x: 0, y: 1.72, z: 15.2, floor: 0 } as const;

/** Player movement inside the vestibule, inset by the body radius. */
export const STATION33_PLAYER_BOUNDS: PlayerBounds = {
  minX: VESTIBULE.minX + 0.4,
  maxX: VESTIBULE.maxX - 0.4,
  minZ: VESTIBULE.minZ + 0.4,
  maxZ: VESTIBULE.maxZ - 0.4,
};

/** Hall plus every entrance passage on the vestibule level. */
export const STATION33_NAVIGATION_BOUNDS: ReadonlyArray<ZombieNavigationBounds> = [
  { floor: 0, minX: -13.5, maxX: 13.5, minZ: 0, maxZ: 24.5, baseY: 0 },
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
}

export const FLUORESCENT_COLOR = 0xd2eadf;
export const AMBER_LAMP_COLOR = 0xffa65a;
export const EMERGENCY_COLOR = 0xff2a12;

/** Battery emergency lamp beside the sealed escalator portal. */
export const EMERGENCY_LAMP = { x: -3.75, y: 2.6, z: VESTIBULE.minZ } as const;

/**
 * Dynamic lights in priority order: a quality level keeps the first
 * POINT_LIGHT_BUDGET entries. Everything else glows through emissive meshes.
 */
export const STATION33_POINT_LIGHTS: ReadonlyArray<Station33PointLight> = [
  { x: 0, y: 3.85, z: 5.6, color: FLUORESCENT_COLOR, intensity: 9, distance: 12, circuit: 'steady' },
  { x: 0, y: 3.85, z: 13.2, color: FLUORESCENT_COLOR, intensity: 8, distance: 12, circuit: 'unstable' },
  { x: EMERGENCY_LAMP.x, y: EMERGENCY_LAMP.y, z: EMERGENCY_LAMP.z + 0.6, color: EMERGENCY_COLOR, intensity: 4, distance: 6.5, circuit: 'emergency' },
  { x: -6.1, y: 2.75, z: 13.5, color: AMBER_LAMP_COLOR, intensity: 3.2, distance: 6.5, circuit: 'amber' },
  { x: 6.1, y: 2.75, z: 8.2, color: AMBER_LAMP_COLOR, intensity: 3, distance: 6.5, circuit: 'amber' },
  { x: -2, y: 3.85, z: 2.5, color: FLUORESCENT_COLOR, intensity: 5, distance: 9, circuit: 'failing' },
];

/**
 * Linear fluorescent fixtures hung under the vault, along Z. The slot at
 * (2, 6.75) is empty: that fixture tore loose and dangles from one chain.
 */
export const FLUORESCENT_FIXTURES: ReadonlyArray<{ readonly x: number; readonly z: number; readonly circuit: Station33LightCircuit | 'dead' }> = [
  { x: -2, z: 2.5, circuit: 'failing' },
  { x: 2, z: 2.5, circuit: 'steady' },
  { x: -2, z: 6.75, circuit: 'steady' },
  { x: -2, z: 11.25, circuit: 'unstable' },
  { x: 2, z: 11.25, circuit: 'dead' },
  { x: -2, z: 15.5, circuit: 'steady' },
  { x: 2, z: 15.5, circuit: 'failing' },
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
