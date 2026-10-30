import type * as THREE from 'three';
import type { AmbientBedId } from '../../audio/AmbientBed';
import type { AmbientCuePlayback } from '../../audio/AudioSystem';
import type { EndingAudioId, MusicTrackName } from '../../audio/MusicManager';
import type { RingId } from '../../game/rings/RingCatalog';
import type { FloorTransitionZone } from '../../player/PlayerController';
import type { EndingPresentationId, IntroPresentationId } from '../../ui/HUD';
import type { WindowBarrier } from '../barriers/WindowBarrier';
import type { PointDoor } from '../doors/PointDoor';
import type { SecretRoomSnapshot } from '../secret-room/SecretRoomSystem';
import type { ZombieSkinId } from '../skins/ZombieSkinCatalog';
import type { ZombieEyeColors } from '../ZombieVisual';
import type { WallBuy } from '../wallbuys/WallBuy';
import type { ZombieSpawnDefinition } from '../ZombieSpawner';
import type { WeaponId } from '../../weapons/WeaponTypes';
import type { TranslationKey } from '../../i18n/i18n';

export interface MysteryBoxPlacement {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly floor?: number;
}

export interface ArenaPlayerSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly floor: number;
}

export interface ArenaWeaponPickup {
  /** Optional combination lock; an unlocked pickup follows the normal grant path. */
  readonly codeLock?: {
    readonly locked: boolean;
    acceptsCode(code: string): boolean;
    unlock(code: string): boolean;
    applyUnlocked(): void;
  };
  readonly id: string;
  readonly weaponId: WeaponId;
  readonly cost: number;
  readonly requiredKills?: number;
  readonly interactionLabel: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly requiredDoorId?: string;
  readonly available: boolean;
  claim(): boolean;
  /** Local player's progress drives the display; the mode validates purchases. */
  setKillProgress?(kills: number): void;
  update?(dt: number): void;
  reset(): void;
}

export interface ArenaAmmoRefill {
  readonly id: string;
  readonly cost: number;
  readonly interactionLabel: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  activate(): void;
  update?(dt: number): void;
  reset(): void;
}

/**
 * A map's special-weapon station (an equipment cabinet rather than a chalk
 * outline): like a wall buy it sells its weapon once and then refills that
 * weapon's ammunition for its owner, but it may wait for the map's power.
 * The mode charges and grants; the map only presents it.
 */
export interface ArenaWeaponStation {
  readonly id: string;
  readonly weaponId: WeaponId;
  readonly price: number;
  readonly ammoPrice: number;
  /** Prompt of the refill; absent keeps the wall buys' ammunition prompt. */
  readonly ammoPromptKey?: TranslationKey;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  /** False while the station waits for the map's power: it sells nothing and shows itself dark. */
  readonly powered: boolean;
  /** Optional run challenge: recover a carrier's crystal before this station can sell. */
  readonly requiresStartupCrystal?: boolean;
  /** Presentation of the challenge lock; purchasing remains the mode's responsibility. */
  setLocked?(locked: boolean): void;
  /** Whether the player carries the weapon: its rack shows it hanging or empty. */
  setOwned(owned: boolean): void;
  /** A purchase or refill just went through. */
  activate(): void;
}

/**
 * What a ring machine shows: its ring for sale, nothing while the player
 * wears the charged ring, or a call to recharge once that ring is spent.
 */
export type RingMachineDisplay = 'stocked' | 'empty' | 'recharge';

/** A map's ring machine. The mode sells and recharges; the map only presents it. */
export interface ArenaRingMachine {
  readonly id: string;
  readonly ringId: RingId;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  /**
   * False while the machine waits for the map's power: it neither sells nor
   * plays its jingle, and shows itself dark. Machines without that need are
   * always powered.
   */
  readonly powered: boolean;
  /**
   * Temporary power for `seconds` (a ZEUS-77 bolt), counted down by the map.
   * A new charge restarts the count instead of adding to it. Returns false,
   * changing nothing, when the machine needs no power or the map's power is
   * already on. Omitted by machines that never wait for power.
   */
  energize?(seconds: number): boolean;
  setDisplay(display: RingMachineDisplay): void;
}

/**
 * A map's main switch: thrown once (free), it brings the map's power on for
 * the rest of the run. The mode only offers and throws it; the map plays
 * the lever and lights itself up.
 */
export interface ArenaPowerSwitch {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  /** True once thrown this run. */
  readonly isOn: boolean;
  /** Throws the switch; false when it already is. */
  activate(): boolean;
}

/** How a map closes its run: the HUD cinematic, its audio and how long it lasts. */
export interface ArenaEnding {
  readonly presentation: EndingPresentationId;
  readonly audio: EndingAudioId;
  /** Seconds from the purchase to the credits. */
  readonly duration: number;
}

/** A camera keyframe of a map intro, in world space. */
export interface ArenaIntroShot {
  /** Seconds on the intro's eased timeline (see `IntroCinematic`). */
  readonly time: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
}

/** Opening cinematic a map plays once, when its run first starts. */
export interface ArenaIntro {
  readonly presentation: IntroPresentationId;
  /** Seconds until the player takes control; the camera lands in their eyes. */
  readonly duration: number;
  /** Camera path ordered by time, every shot before `duration`. */
  readonly shots: ReadonlyArray<ArenaIntroShot>;
}

export interface ArenaCompletionInteraction {
  readonly id: string;
  readonly cost: number;
  readonly ending: ArenaEnding;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly requiredDoorId?: string;
}

export interface ArenaSoulLampInteraction {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly activated: boolean;
  /** Filled with souls; only completed lamps count towards the ritual. */
  readonly completed: boolean;
  activate(): boolean;
}

export interface ArenaRitualInteraction {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly available: boolean;
  activate(): boolean;
}

/**
 * A gas mask hanging on a hook that the player can put on (and hang back).
 * The mode plays the donning and the masked view; the map only shows or
 * hides the mask on its hook.
 */
export interface ArenaGasMaskRack {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  setMaskOnHook(onHook: boolean): void;
}

export interface PlayerBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY?: number;
  readonly maxY?: number;
}

export interface ZombieNavigationBounds extends PlayerBounds {
  readonly floor: number;
  /** Feet height of this floor's walking surface (default 0). */
  readonly baseY?: number;
}

/** A positioned ambient sound the map emits (PA horn, distant train...). */
export interface ArenaAmbientCue extends AmbientCuePlayback {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/** A zombie a map stages outside its spawn points (a jumpscare): where it bursts out. */
export interface ArenaAmbush {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
}

/** Scene mood owned by the map and applied when the arena initializes. */
export interface ArenaAmbience {
  readonly backgroundColor: number;
  readonly fog: { readonly color: number; readonly density: number };
  readonly hemisphereLight: {
    readonly skyColor: number;
    readonly groundColor: number;
    readonly intensity: number;
    /** Intensity on reduced-effects profiles. */
    readonly reducedIntensity: number;
  };
  /**
   * Share of the shell's image-based light (scene.environmentIntensity) the
   * map lets through; omitted keeps the shell default. Dark interiors lower
   * it so practical lights, not the sky-like environment, shape the room.
   */
  readonly environmentIntensity?: { readonly intensity: number; readonly reducedIntensity: number };
  /** Looping bed while the match is running. */
  readonly musicTrack: MusicTrackName;
  /** Optional: procedural sound bed under the music (wind, machinery hum); omitted plays none. */
  readonly ambientBed?: AmbientBedId;
}

/**
 * Contract for a Zombies map. The arena owns the physical environment,
 * spawn points, interactive objects and ambience. `ZombiesMode` owns the
 * run state (rounds, economy, health, weapons).
 */
export interface ZombieArena {
  readonly id: string;
  readonly group: THREE.Group;
  /** Static colliders used for ballistics and zombie collision. */
  readonly colliders: ReadonlyArray<THREE.Object3D>;
  /** Axis-aligned wall boxes for optional player wall collision. */
  readonly wallColliders?: ReadonlyArray<THREE.Box3>;
  /** Spawn points active at the start of the run. */
  readonly spawnPoints: ReadonlyArray<ZombieSpawnDefinition>;
  readonly barriers: ReadonlyArray<WindowBarrier>;
  readonly doors: ReadonlyArray<PointDoor>;
  readonly wallBuys: ReadonlyArray<WallBuy>;
  readonly weaponPickups?: ReadonlyArray<ArenaWeaponPickup>;
  readonly ammoRefills?: ReadonlyArray<ArenaAmmoRefill>;
  readonly soulLampInteractions?: ReadonlyArray<ArenaSoulLampInteraction>;
  readonly ritualInteraction?: ArenaRitualInteraction;
  /** Optional: machines selling the rings (perks); maps without them omit it. */
  readonly ringMachines?: ReadonlyArray<ArenaRingMachine>;
  /** Optional easter egg: a gas mask the player can wear. */
  readonly gasMaskRack?: ArenaGasMaskRack;
  /** Optional: special-weapon stations (the ФАКЕЛ-33 cabinet); maps without them omit it. */
  readonly weaponStations?: ReadonlyArray<ArenaWeaponStation>;
  /** Optional: the switch that powers the map's machines; maps without power omit it. */
  readonly powerSwitch?: ArenaPowerSwitch;
  /** Paid interaction that ends the run with the map's own ending. */
  readonly completionInteraction?: ArenaCompletionInteraction;
  /** Opening cinematic; omitted when the map starts straight into play. */
  readonly intro?: ArenaIntro;
  /** Omitted when the currently playable map has no Mystery Box. */
  readonly mysteryBoxPlacement?: MysteryBoxPlacement;
  /** Safe initial position owned by the map rather than the game mode. */
  readonly playerSpawn: ArenaPlayerSpawn;
  /** True when the arena wants swept wall collision for the player. */
  readonly useWallCollision: boolean;
  /** Movement bounds of the floor holding `playerSpawn`. */
  readonly playerBounds: PlayerBounds;
  /** Per-floor envelope containing valid zombie spawns and pursuit routes. */
  readonly navigationBounds: ReadonlyArray<ZombieNavigationBounds>;
  /** Stair/zone transitions that swap player floor/bounds. */
  readonly floorTransitions?: ReadonlyArray<FloorTransitionZone>;
  readonly ambience: ArenaAmbience;
  /** Optional: walker looks the horde wears, dealt in turn; omitted keeps the plain walker. */
  readonly zombieSkins?: readonly ZombieSkinId[];
  /** Optional: eye colors of every zombie on the map; omitted keeps each model's own. */
  readonly zombieEyes?: ZombieEyeColors;
  /** Optional: ambient sounds the map schedules itself; the mode plays them. */
  onAmbientCue?: ((cue: ArenaAmbientCue) => void) | null;
  /**
   * Optional: a map scare asks the mode for one zombie of the round at its
   * spot. The mode returns true when it spawned one; only then does the map
   * play its reveal, otherwise it may ask again later.
   */
  onAmbush?: ((ambush: ArenaAmbush) => boolean) | null;
  /** Optional visual event fired when a rebuilt board finishes seating. */
  onBarrierBoardRebuilt?: (() => void) | null;
  /**
   * Fired when doors or walls changed the layout. Modes then re-read
   * `colliders`, `wallColliders`, `spawnPoints` and `barriers`.
   */
  onTopologyChanged: (() => void) | null;
  /** Called once after the arena is added to the scene. */
  init(): void;
  /** Per-frame update for ambience and animations. */
  update(dt: number, observerPosition?: THREE.Vector3): void;
  /** Stages the map side of `intro` (lights, sounds) as its camera starts. */
  startIntro?(): void;
  /** Settles whatever `startIntro` staged once the intro ends or is skipped. */
  finishIntro?(): void;
  /** Called when the run restarts. */
  reset(): void;
  /**
   * Opens the layout behind a door whose `PointDoor` just unlocked. Returns
   * false for unknown or already open doors. `onTopologyChanged` fires once
   * the new layout is in place: at once, or after an opening animation.
   */
  activateDoor(doorId: string): boolean;
  refreshSpawnPoints(): void;
  refreshColliders(): void;
}

/**
 * Optional capability: kills feed souls into lamps that unlock a secret room
 * with a ritual. Modes reach it only through `hasSoulRitual`.
 */
export interface SoulRitualArena {
  captureSoul(position: { readonly x: number; readonly y: number; readonly z: number }, floor: number): boolean;
  /** Developer access to the secret room without filling the lamps. */
  unlockSecretRoom(): boolean;
  /** Secret-room progress replicated to the co-op guest. */
  readonly secretSnapshot: SecretRoomSnapshot;
  applySecretSnapshot(snapshot: SecretRoomSnapshot): void;
  onSoulAbsorbed: ((position: THREE.Vector3) => void) | null;
  onSoulLampCompleted: ((position: THREE.Vector3) => void) | null;
  onSecretRoomUnlocked: ((position: THREE.Vector3) => void) | null;
  onRitualScare: ((position: THREE.Vector3) => void) | null;
  onRitualImpact: (() => void) | null;
}

export function hasSoulRitual(arena: ZombieArena): arena is ZombieArena & SoulRitualArena {
  return typeof (arena as Partial<SoulRitualArena>).captureSoul === 'function';
}
