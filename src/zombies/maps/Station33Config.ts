import type { WindowBarrierConfig } from '../barriers/WindowBarrier';
import type { ZombieSkinId } from '../skins/ZombieSkinCatalog';
import type { ZombieEyeColors } from '../ZombieVisual';
import type { WallBuyConfig } from '../wallbuys/WallBuy';
import type { WeaponStationPlacement } from './shared/WeaponStation';
import { BARRETT_CHEST_CODE, type CodeWeaponChestPlacement } from './shared/CodeWeaponChestConfig';
import type { ZombieSpawnPoint } from '../ZombieSpawner';
import type { AmbientEventTiming } from './shared/AmbientEventScheduler';
import type { LockerSize } from './shared/LockerBank';
import type { PowerLeverPlacement } from './shared/PowerLever';
import type { RingLockerPlacement } from './shared/RingLocker';
import type { SignId } from './station33/Station33Signage';
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
 * - Phase 3 (built) is the train sheds (`cocheras`), behind a paid door in
 *   the vestibule's north wall east of the escalator portal: a stabling
 *   siding on the vestibule level, x >= 4.2 and z < 0, with its tracks
 *   along Z. The column x in [-4, 4] north of z = 0 stays free for the
 *   escalator shaft.
 * - Phase 4 (built) is the machine room (`subestacion`), behind a paid door
 *   in the sheds' north wall: a gallery between the west track's dead
 *   tunnel and the blast-gate passage, then the traction substation past
 *   their dead ends, z down to -46.4, with the station's main switch.
 * - The militia post (`milicia`, built) is a side room behind the dearest
 *   paid door, in the vestibule's west wall: x < -7.3 and z >= 5.8, north
 *   of nothing but the vestibule service door's passage.
 * - The maintenance workshop (`taller`) continues north of the substation,
 *   west of the cable-tunnel spawn passage and clear of the escalator axis.
 * - Phase 5 opens the escalator: an incline from z = 0 down to the mezzanine
 *   (floor -1), joined with `floorTransitions` like the mansion stairs.
 * - Phase 6 is the central platform (floor -2) with tracks along Z further
 *   north; tunnels, service level and bunker follow beyond it.
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

const TICKET_OFFICE_FRONT_X = VESTIBULE.minX + TICKET_OFFICE.depth;
const TICKET_BAY = (TICKET_OFFICE.maxZ - TICKET_OFFICE.minZ) / TICKET_OFFICE.windows;

/**
 * The ticket office's glazed windows, south to north: each a pair of
 * casements hinged at its outer edges, `x` on the glass plane.
 */
export const TICKET_WINDOWS: ReadonlyArray<{ readonly x: number; readonly z: number; readonly width: number }> =
  Array.from({ length: TICKET_OFFICE.windows }, (_, index) => ({
    x: TICKET_OFFICE_FRONT_X - 0.12,
    z: TICKET_OFFICE.minZ + TICKET_BAY * (index + 0.5),
    width: TICKET_BAY - 0.16,
  }));

/** Glass centre height and height of the ticket windows. */
export const TICKET_WINDOW_GLASS = { centerY: 1.53, height: 0.94 } as const;

/**
 * Easter-egg jumpscare: walking up to the ticket office rarely bursts one
 * window open with a zombie of the round right behind the counter. Rolled
 * once per approach, at most once per run.
 */
export const TICKET_WINDOW_AMBUSH = {
  chance: 0.15,
  /** Approach distance from the facade in front of each window. */
  radius: 2.2,
  /** Where the zombie stands, out from the facade: clear of its collider by a body radius. */
  standOff: 0.55,
} as const;

/** Points on the facade in front of each window that the player approaches. */
export const TICKET_WINDOW_AMBUSH_SITES = TICKET_WINDOWS.map((window) => ({ x: TICKET_OFFICE_FRONT_X, z: window.z }));

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

export type Station33ZoneId = 'vestibule' | 'consigna' | 'cocheras' | 'subestacion' | 'milicia' | 'taller';

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

/**
 * Phase 3 train sheds, interior faces like VESTIBULE: one wide hall north
 * of the vestibule (its north wall is the sheds' south wall where they
 * meet), lined with cast-iron tunnel rings under a shallow vault. Its east
 * face lines up with the luggage office's, so one player rectangle keeps
 * the east entrances of both rooms shut.
 */
export const COCHERAS = {
  hall: { minX: 4.2, maxX: CONSIGNA.hall.maxX, minZ: -26.6, maxZ: VESTIBULE.minZ - STATION33_WALL_THICKNESS },
  wallHeight: 4.4,
  vaultApexY: 6.3,
} as const;

/**
 * The station militia post, interior faces like VESTIBULE: one room west
 * of the vestibule whose east wall is the vestibule's west wall, so its
 * door opens straight into it. It shares the vestibule's south line, and
 * its north wall stays clear of the passage behind the vestibule's west
 * service door. Flat office ceiling under concrete beams, high enough for
 * the post's red corner and the interrogation lamp.
 */
export const MILICIA = {
  hall: { minX: -18.2, maxX: VESTIBULE.minX - STATION33_WALL_THICKNESS, minZ: 5.8, maxZ: VESTIBULE.maxZ },
  ceilingHeight: 3.4,
} as const;

const WEST_WALL_X = VESTIBULE.minX - STATION33_WALL_THICKNESS / 2;
/** Evidence chest against the south wall, beside the holding cell, facing the room. */
export const STATION33_WEAPON_CHEST: CodeWeaponChestPlacement = {
  id: 'milicia-barrett-chest', weaponId: 'barrett', code: BARRETT_CHEST_CODE,
  x: -12.7, z: MILICIA.hall.maxZ - 0.6, yaw: Math.PI, requiredDoorId: 'to-milicia',
};
const EAST_WALL_X = VESTIBULE.maxX + STATION33_WALL_THICKNESS / 2;
const NORTH_WALL_Z = VESTIBULE.minZ - STATION33_WALL_THICKNESS / 2;
const SOUTH_WALL_Z = VESTIBULE.maxZ + STATION33_WALL_THICKNESS / 2;
const CONSIGNA_EAST_WALL_X = CONSIGNA.hall.maxX + STATION33_WALL_THICKNESS / 2;
const COCHERAS_NORTH_WALL_Z = COCHERAS.hall.minZ - STATION33_WALL_THICKNESS / 2;
const COCHERAS_EAST_WALL_X = COCHERAS.hall.maxX + STATION33_WALL_THICKNESS / 2;

/**
 * Phase 4 machine room, interior faces like VESTIBULE: a service gallery
 * running north from the sheds' north wall, between the west track's dead
 * tunnel and the blast-gate passage, then the traction substation hall
 * past both dead ends. Same width and east face as the sheds, so the one
 * player rectangle keeps working. Flat concrete ceilings: the gallery's
 * under the top of the sheds' north wall, the hall's high above its
 * machines, under steel beams.
 */
export const SUBESTACION = {
  gallery: { minX: 8.6, maxX: 13.4, minZ: -34.1, maxZ: COCHERAS.hall.minZ - STATION33_WALL_THICKNESS },
  hall: { minX: COCHERAS.hall.minX, maxX: COCHERAS.hall.maxX, minZ: -46.4, maxZ: -34.4 },
  galleryHeight: 3.6,
  hallHeight: 4.8,
} as const;

const SUBESTACION_NORTH_WALL_Z = SUBESTACION.hall.minZ - STATION33_WALL_THICKNESS / 2;
const SUBESTACION_EAST_WALL_X = SUBESTACION.hall.maxX + STATION33_WALL_THICKNESS / 2;

/**
 * Maintenance workshop beyond the substation's north-west door: the depot's
 * repair bay, high enough for an overhead crane. Its east wall stays west of
 * the substation's cable-tunnel passage.
 */
export const TALLER = {
  hall: {
    minX: SUBESTACION.hall.minX, maxX: 16.6,
    minZ: -59.0, maxZ: SUBESTACION.hall.minZ - STATION33_WALL_THICKNESS,
  },
  ceilingHeight: 4.2,
  color: 0xd7b842,
  lightColor: 0xffdf76,
} as const;

/**
 * Spare metro bogie on a short rail stub in the middle of the workshop,
 * its axles along X, leaving wide lanes on both sides for the horde.
 */
export const TALLER_BOGIE = { x: 11.4, z: -54.6, length: 2.8, width: 2.1, height: 1.15 } as const;

/**
 * Overhead travelling crane: runway beams along both side walls, the bridge
 * parked across the hall over the bogie, and its hook swinging on a chain
 * from the hoist (`hoistY`, under the bridge) down to `hookY`, above it.
 */
export const TALLER_CRANE = { runwayY: 3.7, bridgeZ: TALLER_BOGIE.z, hoistX: TALLER_BOGIE.x, hoistY: 3.3, hookY: 2.25 } as const;

/**
 * Two tracks along Z. The west one hugs the wall and runs on into a
 * buried tunnel through `portal`; the east one ends at the blast gate.
 * Both stop at buffer stops on the apron behind the vestibule.
 */
export const COCHERAS_TRACKS = {
  gauge: 1.52,
  railTop: 0.15,
  west: { x: 5.85, bufferZ: -7.7 },
  east: { x: 15.65, bufferZ: -3.4 },
  /** Opening of the west track's tunnel in the north wall, filled by its train. */
  portal: { width: 3.3, height: 4.0 },
} as const;

/** Body of a metro car above the rails: floor, roof, doors per side. */
export const TRAIN_CAR = {
  width: 2.7,
  floorY: 1.05,
  roofY: 3.45,
  doorsPerSide: 3,
  doorWidth: 1.3,
} as const;

/** A metro car left on a siding, as a solid block the horde walks around. */
export interface Station33TrainCar {
  readonly id: string;
  /** Track centre line. */
  readonly x: number;
  /** Ends of the body along the track (couplers stick out past them). */
  readonly minZ: number;
  readonly maxZ: number;
  /** End with the driver's cab, if any. */
  readonly cab: 'north' | 'south' | null;
  /** Side whose doors face the hall (+1 east, -1 west) and which of them hang open, south first. */
  readonly openSide: 1 | -1;
  readonly openDoors: ReadonlyArray<number>;
  /** Derailment: turn about Y and lean about the track axis, in radians. */
  readonly yaw: number;
  readonly roll: number;
}

/**
 * The evacuation trains. The west one waits at its buffer stop with a door
 * open and its trailer half inside the buried tunnel; the east car jumped
 * the rails and leans across its track, leaving a lane on either side.
 */
export const COCHERAS_TRAIN_CARS: ReadonlyArray<Station33TrainCar> = [
  { id: 'west-lead', x: COCHERAS_TRACKS.west.x, minZ: -20.0, maxZ: -8.8, cab: 'south', openSide: 1, openDoors: [1], yaw: 0, roll: 0 },
  { id: 'west-trailer', x: COCHERAS_TRACKS.west.x, minZ: -31.4, maxZ: -20.6, cab: null, openSide: 1, openDoors: [0], yaw: 0, roll: 0 },
  { id: 'east-derailed', x: COCHERAS_TRACKS.east.x, minZ: -22.4, maxZ: -11.6, cab: 'north', openSide: -1, openDoors: [], yaw: 0.045, roll: -0.06 },
];

/**
 * Zombie entrances: the vestibule's surface stairs, service door and two
 * vents, the luggage office's porters' stairs and grille, then the train
 * sheds' blast-gate wicket, grille and substation door, then the machine
 * room's grille and cable-tunnel door, and the militia post's back door.
 * Each zone's entrances only wake once its door is bought.
 */
export const STATION33_BARRIERS: ReadonlyArray<Station33Barrier> = [
  { id: 'surface-stairs', x: -3.6, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'vestibule' },
  { id: 'service-door-west', x: WEST_WALL_X, z: 4.0, outwardX: -1, outwardZ: 0, kind: 'gate', zone: 'vestibule' },
  // Spread apart in phase 2 so the luggage-office corridor fits between their passages.
  { id: 'vent-east-north', x: EAST_WALL_X, z: 4.6, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
  { id: 'vent-east-south', x: EAST_WALL_X, z: 15.4, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'vestibule' },
  { id: 'consigna-porters-stairs', x: 17.5, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'consigna' },
  { id: 'consigna-vent-east', x: CONSIGNA_EAST_WALL_X, z: 15.4, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'consigna' },
  { id: 'cocheras-blast-gate', x: COCHERAS_TRACKS.east.x, z: COCHERAS_NORTH_WALL_Z, outwardX: 0, outwardZ: -1, kind: 'gate', zone: 'cocheras' },
  { id: 'cocheras-vent-east', x: COCHERAS_EAST_WALL_X, z: -5.6, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'cocheras' },
  { id: 'cocheras-substation-door', x: COCHERAS_EAST_WALL_X, z: -17.5, outwardX: 1, outwardZ: 0, kind: 'gate', zone: 'cocheras' },
  { id: 'subestacion-vent-east', x: SUBESTACION_EAST_WALL_X, z: -38.0, outwardX: 1, outwardZ: 0, kind: 'vent', zone: 'subestacion' },
  { id: 'subestacion-cable-tunnel', x: 18.4, z: SUBESTACION_NORTH_WALL_Z, outwardX: 0, outwardZ: -1, kind: 'gate', zone: 'subestacion' },
  // The post's own way up to the street, east of its holding cell.
  { id: 'milicia-back-door', x: -10.2, z: SOUTH_WALL_Z, outwardX: 0, outwardZ: 1, kind: 'gate', zone: 'milicia' },
  { id: 'taller-service-door', x: 11.8, z: TALLER.hall.minZ - STATION33_WALL_THICKNESS / 2, outwardX: 0, outwardZ: -1, kind: 'gate', zone: 'taller' },
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
  /** Enamel plate over the door on the side it is bought from. */
  readonly plate: SignId;
}

/**
 * Paid doors, rising like the mansion's (750, 1250, then 1500). The first
 * sits beside the east bench, clear of both vent openings; the second is a
 * service door in the north wall east of the escalator, facing the cab of
 * the west train; the third opens the machine room's gallery between the
 * sheds' dead tunnel and blast gate. The militia post's door (3000), the
 * vestibule's third way out, sits in the west wall, in line with the turnstiles.
 */
export const STATION33_DOORS: ReadonlyArray<Station33Door> = [
  { id: 'to-consigna', x: EAST_WALL_X, z: 8.8, outwardX: 1, outwardZ: 0, cost: 750, zone: 'consigna', plate: 'luggage-office' },
  { id: 'to-cocheras', x: 5.6, z: NORTH_WALL_Z, outwardX: 0, outwardZ: -1, cost: 1250, zone: 'cocheras', plate: 'service-passage' },
  {
    id: 'to-subestacion', x: (SUBESTACION.gallery.minX + SUBESTACION.gallery.maxX) / 2, z: COCHERAS_NORTH_WALL_Z,
    outwardX: 0, outwardZ: -1, cost: 1500, zone: 'subestacion', plate: 'substation',
  },
  { id: 'to-milicia', x: WEST_WALL_X, z: 9.45, outwardX: -1, outwardZ: 0, cost: 3000, zone: 'milicia', plate: 'militia' },
  { id: 'to-taller', x: 5.8, z: SUBESTACION_NORTH_WALL_Z, outwardX: 0, outwardZ: -1, cost: 2000, zone: 'taller', plate: 'maintenance' },
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
  cocheras: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'cocheras').map(spawnBehind),
  subestacion: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'subestacion').map(spawnBehind),
  milicia: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'milicia').map(spawnBehind),
  taller: STATION33_BARRIERS.filter((barrier) => barrier.zone === 'taller').map(spawnBehind),
};

/** Weapon outlines 2 cm in front of the wall face, with map-specific prices. */
export const STATION33_WALL_BUYS: ReadonlyArray<WallBuyConfig> = [
  {
    // The cheap automatic waits down the luggage-office corridor, clear of its blood stain.
    id: 'consigna-mp5',
    weaponId: 'mp5',
    price: 1000,
    ammoPrice: 500,
    position: { x: 11.2, y: 1.45, z: CONSIGNA.corridor.minZ + 0.02 },
    yaw: 0,
    floor: 0,
  },
  {
    // Available from the start on the east wall, clear of the vent and posters.
    id: 'vestibule-ppsh41',
    weaponId: 'ppsh41',
    price: 1250,
    ammoPrice: 625,
    position: { x: EAST_WALL_X - 0.17, y: 1.45, z: 2.0 },
    yaw: -Math.PI / 2,
    floor: 0,
  },
  {
    // The civil-defence machine gun, on the sheds' apron wall between both buffer stops.
    id: 'cocheras-m60',
    weaponId: 'm60',
    price: 2500,
    ammoPrice: 1250,
    position: { x: 11.2, y: 1.45, z: COCHERAS.hall.maxZ - 0.02 },
    yaw: Math.PI,
    floor: 0,
  },
  {
    // The post's confiscated rifle on its north wall, above the wainscot.
    id: 'milicia-ak47',
    weaponId: 'ak47',
    price: 1750,
    ammoPrice: 900,
    position: { x: -11.0, y: 1.62, z: MILICIA.hall.minZ + 0.02 },
    yaw: 0,
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

/** Open locker holding a ring (the shared `RingLocker`), built into a bank of lockers of its room. */
export interface Station33RingLocker extends RingLockerPlacement {
  /** Room whose locker bank holds it. */
  readonly zone: Station33ZoneId;
}

/** Size of the lockers that line the walls (luggage office, train crew, evidence room). */
export const CONSIGNA_LOCKER = { depth: 0.5, height: 2.0, columnWidth: 0.42, rows: 3, ringLockerWidth: 0.62 } as const satisfies LockerSize;

/**
 * Staff lockers of the train crews on the sheds' apron wall, east of the
 * buffer stops, clear of the east grille and the walking lane behind them.
 */
export const COCHERAS_CREW_LOCKERS = { minX: 17.3, maxX: 20.6 } as const;

/** Evidence lockers on the militia post's west wall, facing its door. */
export const MILICIA_EVIDENCE_LOCKERS = { minZ: 7.4, maxZ: 11.6 } as const;

/** Centre of the interrogation table in the post's west half, under its hanging lamp. */
export const MILICIA_INTERROGATION = { x: -15.9, z: 12.2 } as const;

/**
 * Holding cell in the post's south-west corner: a barred front along
 * `frontZ` with its door opening between `doorMinX` and `sideX`, and a
 * barred side along `sideX`. The door hangs swung right open along the
 * side line.
 */
export const MILICIA_CELL = { frontZ: 14.4, doorMinX: -15.8, sideX: -14.6, barHeight: 2.4, barSpacing: 0.13 } as const;

/**
 * The Resurrection locker at the end of the luggage-office corridor's axis,
 * the Sleight of Hand locker in the middle of the train crews' bank, and
 * the Armour locker among the militia's evidence lockers on the axis of
 * its door; both of the last wait for the power.
 */
export const STATION33_RING_LOCKERS: ReadonlyArray<Station33RingLocker> = [
  {
    id: 'consigna-resurrection', ringId: 'resurrection', zone: 'consigna',
    x: CONSIGNA.hall.maxX - CONSIGNA_LOCKER.depth, z: 9.9, facingX: -1, facingZ: 0, requiresPower: false,
  },
  {
    id: 'cocheras-sleight-of-hand', ringId: 'sleightOfHand', zone: 'cocheras',
    x: (COCHERAS_CREW_LOCKERS.minX + COCHERAS_CREW_LOCKERS.maxX) / 2, z: COCHERAS.hall.maxZ - CONSIGNA_LOCKER.depth,
    facingX: 0, facingZ: -1, requiresPower: true,
  },
  {
    id: 'milicia-armor', ringId: 'armor', zone: 'milicia',
    x: MILICIA.hall.minX + CONSIGNA_LOCKER.depth, z: 9.45, facingX: 1, facingZ: 0, requiresPower: true,
  },
  {
    id: 'taller-double-tap', ringId: 'doubleTap', zone: 'taller',
    x: TALLER.hall.maxX - CONSIGNA_LOCKER.depth, z: -50.8, facingX: -1, facingZ: 0, requiresPower: true,
  },
];

/** The ring lockers of one room. */
export function station33RingLockersIn(zone: Station33ZoneId): ReadonlyArray<Station33RingLocker> {
  return STATION33_RING_LOCKERS.filter((locker) => locker.zone === zone);
}

/**
 * The ФАКЕЛ-33 decontamination cabinet on the machine room's south wall,
 * east of the gallery: the experimental flamethrower nobody signed out,
 * sold after power and startup-crystal recovery (3500), its spare core crystals
 * refilled there afterwards (1750).
 */
export const STATION33_WEAPON_STATIONS: ReadonlyArray<WeaponStationPlacement> = [
  {
    id: 'subestacion-fakel', weaponId: 'fakel', price: 3500, ammoPrice: 1750, ammoPromptKey: 'prompt.coreCrystals',
    x: 17.0, z: SUBESTACION.hall.maxZ, facingX: 0, facingZ: -1, requiresPower: true, requiresStartupCrystal: true,
  },
];

export const STATION33_PLAYER_SPAWN = { x: 0, y: 1.72, z: 15.2, floor: 0 } as const;

/**
 * Player movement over every room, inset by the body radius. One rectangle
 * covers them all: walls and the closed doors keep the player out of the
 * locked rooms (and out of the gaps between rooms) until they are bought,
 * and the arena stops the player at every walk-through gate (the sheds'
 * blast gate now lies inside the rectangle) so no spawn passage is ever
 * walkable.
 */
export const STATION33_PLAYER_BOUNDS: PlayerBounds = {
  minX: MILICIA.hall.minX + 0.4,
  maxX: CONSIGNA.hall.maxX - 0.4,
  minZ: TALLER.hall.minZ + 0.4,
  maxZ: VESTIBULE.maxZ - 0.4,
};

/**
 * Every room plus every entrance passage on the vestibule level. Walls
 * longer than the zombie obstacle limit (20 m) are built in pieces, so the
 * empty ground west of the train sheds stays walled off.
 */
export const STATION33_NAVIGATION_BOUNDS: ReadonlyArray<ZombieNavigationBounds> = [
  { floor: 0, minX: -19.1, maxX: 27.8, minZ: -66, maxZ: 24.7, baseY: 0 },
];

/** Cold, damp underground air: green-grey haze, nothing of the mansion's smoke. */
export const STATION33_AMBIENCE = {
  backgroundColor: 0x030504,
  fog: { color: 0x080c0a, density: 0.075 },
  hemisphereLight: { skyColor: 0x3c4c46, groundColor: 0x120e0a, intensity: 0.5, reducedIntensity: 0.7 },
  // Underground: almost no sky-like fill, the fluorescents and lamps do the lighting.
  environmentIntensity: { intensity: 0.1, reducedIntensity: 0.12 },
  musicTrack: 'station33_theme',
} as const satisfies ArenaAmbience;

/**
 * The horde: the garrison that held the station, from the war-time riflemen
 * to the officers of the evacuation, plus the civilians nobody got out.
 */
export const STATION33_ZOMBIE_SKINS: readonly ZombieSkinId[] = [
  'rifleman',
  'helmetTrooper',
  'fieldOfficer',
  'evacuee',
  'winterSentry',
  'winterVeteran',
  'paradeOfficer',
];

/** Red eyes for the whole horde, the same red as Brutus, cutting through the green haze. */
export const STATION33_ZOMBIE_EYES: ZombieEyeColors = { glow: 0xff2a14, core: 0xff9a7a };

/**
 * Flicker personality of a light circuit. Mains circuits die during a power
 * dip; the emergency circuit runs on batteries. The `mains` circuit is fed
 * by the substation alone: dark until the main switch is thrown, then a
 * steady hum.
 */
export type Station33LightCircuit = 'steady' | 'unstable' | 'failing' | 'amber' | 'emergency' | 'mains';

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
/** Ruby glass of the militia post's lit star. */
export const MILICIA_STAR_COLOR = 0xff3a26;

/**
 * The station's main switch: a knife-switch lever on the machine room's
 * north wall, at the end of the gallery's axis, between two switchboards.
 */
export const POWER_LEVER = { x: (SUBESTACION.gallery.minX + SUBESTACION.gallery.maxX) / 2, z: SUBESTACION.hall.minZ } as const;

/** The shared knife switch (`PowerLever`) on that wall, facing into the machine room. */
export const STATION33_POWER_SWITCH: PowerLeverPlacement = {
  id: 'station33-main-switch', x: POWER_LEVER.x, z: POWER_LEVER.z, facingX: 0, facingZ: 1,
};

/**
 * What throwing the main switch changes for the rest of the run, as
 * multipliers: real lights and lamps burn brighter and steadier, the fill
 * and environment light rise, the haze thins, and the machines (the ring
 * lockers, and the weapon upgrade machine to come) glow far brighter. The
 * `mains` fixtures come alive on their own circuit.
 */
export const STATION33_MAINS = {
  lightBoost: 1.8,
  hemisphereBoost: 2.4,
  environmentBoost: 2.4,
  fogDensityScale: 0.7,
  machineGlowBoost: 1.9,
} as const;

/**
 * Zone holding a floor point: the sheds' north wall separates the machine
 * room, the vestibule's north wall the train sheds, its east wall the
 * luggage office and its west wall the militia post.
 */
export function station33ZoneAt(x: number, z: number): Station33ZoneId {
  if (z < SUBESTACION_NORTH_WALL_Z && x < TALLER.hall.maxX + STATION33_WALL_THICKNESS / 2) return 'taller';
  if (z < COCHERAS_NORTH_WALL_Z) return 'subestacion';
  if (z < NORTH_WALL_Z) return 'cocheras';
  if (x > EAST_WALL_X) return 'consigna';
  return x < WEST_WALL_X ? 'milicia' : 'vestibule';
}

/** Battery emergency lamp beside the sealed escalator portal. */
export const EMERGENCY_LAMP = { x: -3.75, y: 2.6, z: VESTIBULE.minZ } as const;

/**
 * Dynamic lights in priority order within each room. A quality level keeps
 * the first POINT_LIGHT_BUDGET entries, taking the player's room first and
 * filling up with the other rooms'; everything else glows through emissive
 * meshes. The luggage-office lights are short so they never leak through
 * the wall it shares with the vestibule; the train-shed lights stay deep
 * enough in the hall for the same reason.
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
  { x: 11, y: 3.95, z: -6.5, color: FLUORESCENT_COLOR, intensity: 8, distance: 10, circuit: 'steady', zone: 'cocheras' },
  { x: 11, y: 3.95, z: -15.5, color: FLUORESCENT_COLOR, intensity: 7, distance: 11, circuit: 'unstable', zone: 'cocheras' },
  { x: 13.0, y: 3.4, z: -25.9, color: EMERGENCY_COLOR, intensity: 4.5, distance: 8, circuit: 'emergency', zone: 'cocheras' },
  { x: 20.3, y: 2.6, z: -11.0, color: AMBER_LAMP_COLOR, intensity: 3, distance: 6.5, circuit: 'amber', zone: 'cocheras' },
  { x: 11, y: 3.95, z: -23.5, color: FLUORESCENT_COLOR, intensity: 5, distance: 8, circuit: 'failing', zone: 'cocheras' },
  // The machine room waits in the red of its battery lamp until its own mains come on.
  { x: POWER_LEVER.x, y: 3.4, z: SUBESTACION.hall.minZ + 0.5, color: EMERGENCY_COLOR, intensity: 4.5, distance: 8, circuit: 'emergency', zone: 'subestacion' },
  { x: 12.6, y: 4.4, z: -39.6, color: FLUORESCENT_COLOR, intensity: 5, distance: 9, circuit: 'failing', zone: 'subestacion' },
  { x: 7.4, y: 4.4, z: -38.5, color: FLUORESCENT_COLOR, intensity: 8, distance: 11, circuit: 'mains', zone: 'subestacion' },
  { x: 17.6, y: 4.4, z: -42.5, color: FLUORESCENT_COLOR, intensity: 8, distance: 11, circuit: 'mains', zone: 'subestacion' },
  { x: SUBESTACION.gallery.maxX - 0.3, y: 2.6, z: -30.5, color: AMBER_LAMP_COLOR, intensity: 3, distance: 6, circuit: 'amber', zone: 'subestacion' },
  // Short enough to stop at the vestibule wall; the battery lamp keeps the cell red.
  { x: -11.2, y: 3.0, z: 9.6, color: FLUORESCENT_COLOR, intensity: 4.5, distance: 4.2, circuit: 'unstable', zone: 'milicia' },
  // The interrogation lamp over the table in the west half of the post.
  { x: MILICIA_INTERROGATION.x, y: 2.3, z: MILICIA_INTERROGATION.z, color: AMBER_LAMP_COLOR, intensity: 3.4, distance: 5, circuit: 'failing', zone: 'milicia' },
  { x: -16.4, y: 2.6, z: 16.4, color: EMERGENCY_COLOR, intensity: 2.6, distance: 4, circuit: 'emergency', zone: 'milicia' },
  // The ruby star over the Armour locker, fed by the substation like the locker itself.
  { x: MILICIA.hall.minX + 1.0, y: 2.9, z: 9.45, color: MILICIA_STAR_COLOR, intensity: 3, distance: 4.5, circuit: 'mains', zone: 'milicia' },
  { x: 9.4, y: 3.0, z: -50.6, color: TALLER.lightColor, intensity: 7, distance: 10, circuit: 'mains', zone: 'taller' },
  // The workbench's own lamp keeps a pool of warm light before the power comes back.
  { x: TALLER.hall.minX + 0.6, y: 1.75, z: -51.6, color: AMBER_LAMP_COLOR, intensity: 2.6, distance: 4, circuit: 'amber', zone: 'taller' },
  { x: 9.4, y: 3.6, z: -56.6, color: FLUORESCENT_COLOR, intensity: 5, distance: 9, circuit: 'failing', zone: 'taller' },
  { x: 13.6, y: TALLER.ceilingHeight - 0.8, z: TALLER.hall.minZ + 0.6, color: EMERGENCY_COLOR, intensity: 3, distance: 6, circuit: 'emergency', zone: 'taller' },
  { x: 13.8, y: 3.6, z: -56.6, color: TALLER.lightColor, intensity: 6, distance: 9, circuit: 'mains', zone: 'taller' },
  { x: 5.6, y: 2.5, z: -48.4, color: TALLER.lightColor, intensity: 2.5, distance: 5, circuit: 'amber', zone: 'taller' },
];

/**
 * Linear fluorescent fixtures along Z, hung under the vaults or the
 * luggage-office ceiling. The vestibule slot at (2, 6.75) is empty: that
 * fixture tore loose and dangles from one chain. The train sheds hang two
 * rows, over the floor between the tracks and over the east lane. `dead`
 * tubes are broken for good; `mains` ones wait for the main switch.
 */
export const FLUORESCENT_FIXTURES: ReadonlyArray<{ readonly x: number; readonly z: number; readonly circuit: Station33LightCircuit | 'dead' }> = [
  { x: -2, z: 2.5, circuit: 'failing' },
  { x: 2, z: 2.5, circuit: 'steady' },
  { x: -2, z: 6.75, circuit: 'steady' },
  { x: -2, z: 11.25, circuit: 'unstable' },
  { x: 2, z: 11.25, circuit: 'mains' },
  { x: -2, z: 15.5, circuit: 'steady' },
  { x: 2, z: 15.5, circuit: 'failing' },
  { x: 10.6, z: 9.9, circuit: 'unstable' },
  { x: 17.5, z: 9.2, circuit: 'steady' },
  { x: 19.4, z: 12, circuit: 'mains' },
  { x: 17.5, z: 14.8, circuit: 'failing' },
  { x: 11, z: -2.8, circuit: 'mains' },
  { x: 11, z: -6.5, circuit: 'steady' },
  { x: 11, z: -11, circuit: 'steady' },
  { x: 11, z: -15.5, circuit: 'unstable' },
  { x: 11, z: -19.5, circuit: 'mains' },
  { x: 11, z: -23.5, circuit: 'failing' },
  { x: 19.2, z: -4.5, circuit: 'unstable' },
  { x: 19.2, z: -13.5, circuit: 'dead' },
  { x: 19.2, z: -22, circuit: 'failing' },
  { x: 7.4, z: -38.5, circuit: 'mains' },
  { x: 7.4, z: -43.5, circuit: 'mains' },
  { x: 12.6, z: -37.2, circuit: 'mains' },
  { x: 12.6, z: -39.6, circuit: 'failing' },
  { x: 17.6, z: -37.2, circuit: 'dead' },
  { x: 17.6, z: -42.5, circuit: 'mains' },
  { x: -11.2, z: 9.6, circuit: 'unstable' },
  { x: -11.2, z: 14.4, circuit: 'mains' },
  { x: -14.4, z: 9.6, circuit: 'mains' },
  { x: -16.4, z: 16.2, circuit: 'dead' },
  { x: 9.4, z: -50.6, circuit: 'mains' },
  { x: 13.8, z: -50.6, circuit: 'dead' },
  { x: 9.4, z: -56.6, circuit: 'failing' },
  { x: 13.8, z: -56.6, circuit: 'mains' },
];

/** A fitting mounted on a wall face at (x, z), `facing` into its room. */
export interface Station33WallFitting {
  readonly x: number;
  readonly z: number;
  readonly facingX: number;
  readonly facingZ: number;
}

/**
 * Caged bulkhead lamps of the train sheds and the machine room. `dead`
 * globes are smashed; `mains` ones light only once the main switch is thrown.
 */
export const STATION33_WALL_LAMPS: ReadonlyArray<Station33WallFitting & { readonly circuit: Station33LightCircuit | 'dead' }> = [
  { x: COCHERAS.hall.maxX, z: -11.0, facingX: -1, facingZ: 0, circuit: 'amber' },
  { x: COCHERAS.hall.maxX, z: -23.4, facingX: -1, facingZ: 0, circuit: 'mains' },
  { x: 16.6, z: COCHERAS.hall.maxZ, facingX: 0, facingZ: -1, circuit: 'amber' },
  { x: 8.6, z: COCHERAS.hall.minZ, facingX: 0, facingZ: 1, circuit: 'dead' },
  { x: SUBESTACION.gallery.maxX, z: -30.5, facingX: -1, facingZ: 0, circuit: 'amber' },
  { x: SUBESTACION.hall.minX, z: -35.8, facingX: 1, facingZ: 0, circuit: 'mains' },
  { x: SUBESTACION.hall.maxX, z: -35.4, facingX: -1, facingZ: 0, circuit: 'mains' },
  { x: 6.2, z: SUBESTACION.hall.maxZ, facingX: 0, facingZ: -1, circuit: 'dead' },
  { x: TALLER.hall.minX, z: -57.0, facingX: 1, facingZ: 0, circuit: 'amber' },
  { x: TALLER.hall.maxX, z: -57.0, facingX: -1, facingZ: 0, circuit: 'dead' },
];

/**
 * Red battery beacons at 3.4 m: over the sheds' blast gate, beside the
 * wicket the horde breaks through, over the machine room's main switch and
 * beside the workshop's service door.
 */
export const STATION33_BEACONS: ReadonlyArray<Station33WallFitting> = [
  { x: 13.0, z: COCHERAS.hall.minZ, facingX: 0, facingZ: 1 },
  { x: POWER_LEVER.x, z: SUBESTACION.hall.minZ, facingX: 0, facingZ: 1 },
  { x: 13.6, z: TALLER.hall.minZ, facingX: 0, facingZ: 1 },
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
  mains: 3.6,
};

/** Ambient events the intro fires on its own clock, by `STATION33_AMBIENT_EVENTS` id. */
export const STATION33_INTRO_CUES: ReadonlyArray<{ readonly time: number; readonly eventId: string }> = [
  { time: 0.2, eventId: 'distant-train' },
  { time: 4.4, eventId: 'pa-announcement' },
];
