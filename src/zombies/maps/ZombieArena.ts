import type * as THREE from 'three';
import type { FloorTransitionZone } from '../../player/PlayerController';
import type { WindowBarrier } from '../barriers/WindowBarrier';
import type { PointDoor } from '../doors/PointDoor';
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
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly requiredDoorId?: string;
  readonly available: boolean;
  claim(): boolean;
  reset(): void;
}

export interface ArenaCompletionInteraction {
  readonly id: string;
  readonly cost: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
  readonly requiredDoorId?: string;
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
  readonly completionInteraction?: ArenaCompletionInteraction;
  readonly mysteryBoxPlacement: MysteryBoxPlacement;
  /** Safe initial position owned by the map rather than the game mode. */
  readonly playerSpawn?: ArenaPlayerSpawn;
  /** True when the arena wants swept wall collision for the player. */
  readonly useWallCollision: boolean;
  /** Optional movement bounds; classic arena leaves this undefined. */
  readonly playerBounds?: PlayerBounds;
  /** Per-floor envelope containing valid zombie spawns and pursuit routes. */
  readonly navigationBounds: ReadonlyArray<ZombieNavigationBounds>;
  /** Stair/zone transitions that swap player floor/bounds. */
  readonly floorTransitions?: ReadonlyArray<FloorTransitionZone>;
  /** Called once after the arena is added to the scene. */
  init(): void;
  /** Per-frame update for ambience and animations. */
  update(dt: number): void;
  /** Called when the run restarts. */
  reset(): void;
}
