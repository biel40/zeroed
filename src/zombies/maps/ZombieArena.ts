import type * as THREE from 'three';
import type { AmbientCuePlayback } from '../../audio/AudioSystem';
import type { EndingAudioId, MusicTrackName } from '../../audio/MusicManager';
import type { FloorTransitionZone } from '../../player/PlayerController';
import type { EndingPresentationId } from '../../ui/HUD';
import type { WindowBarrier } from '../barriers/WindowBarrier';
import type { PointDoor } from '../doors/PointDoor';
import type { SecretRoomSnapshot } from '../secret-room/SecretRoomSystem';
import type { WallBuy } from '../wallbuys/WallBuy';
import type { ZombieSpawnDefinition } from '../ZombieSpawner';
import type { WeaponId } from '../../weapons/WeaponTypes';

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

/** How a map closes its run: the HUD cinematic, its audio and how long it lasts. */
export interface ArenaEnding {
  readonly presentation: EndingPresentationId;
  readonly audio: EndingAudioId;
  /** Seconds from the purchase to the credits. */
  readonly duration: number;
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
  /** Paid interaction that ends the run with the map's own ending. */
  readonly completionInteraction?: ArenaCompletionInteraction;
  readonly mysteryBoxPlacement: MysteryBoxPlacement;
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
  /** Optional: ambient sounds the map schedules itself; the mode plays them. */
  onAmbientCue?: ((cue: ArenaAmbientCue) => void) | null;
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
