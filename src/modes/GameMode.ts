import type * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import type { AudioSystem } from '../audio/AudioSystem';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { Stats } from '../game/Stats';
import type { Input } from '../player/Input';
import type { PlayerController } from '../player/PlayerController';
import type { ShootingRange } from '../range/ShootingRange';
import type { Effects } from '../rendering/Effects';
import type { HitTarget } from '../shooting/HitTarget';
import type { HUD } from '../ui/HUD';
import type { Weapon } from '../weapons/Weapon';
import type { WeaponId } from '../weapons/WeaponTypes';

export type GameModeId = 'range' | 'zombies';

/** Everything a mode needs from the shared Game shell. */
export interface ModeContext {
  readonly scene: THREE.Scene;
  readonly player: PlayerController;
  readonly input: Input;
  readonly hud: HUD;
  readonly audio: AudioSystem;
  readonly effects: Effects;
  readonly stats: Stats;
  /** Loaded external assets (weapon/zombie GLBs, PBR textures). */
  readonly assets: AssetManager;
  /** Hardware quality tiers for mode-level effect scaling. */
  readonly profile: DeviceProfile;
  /**
   * The physical range: modes may restyle its lights (night mode) without
   * touching geometry. One mode runs per session, so changes never need
   * to be reverted.
   */
  readonly range: ShootingRange;
  /**
   * Mutable collider array shared with the BallisticsSystem and the aim
   * raycast. Modes may push/splice dynamic hitboxes (zombies) here.
   */
  readonly hitColliders: THREE.Object3D[];
  /** Adjusts the renderer tone-mapping exposure (atmosphere control). */
  setExposure(exposure: number): void;
  /** User-gesture-safe pointer lock + audio resume. */
  lockPointer(): void;
  unlockPointer(): void;
  /**
   * Adds a weapon to the player inventory, honouring the mode's slot cap
   * (Mystery Box pickups). The granted weapon arrives with fresh ammo.
   */
  grantWeapon(id: WeaponId): void;
  /** Restores the starting inventory with fresh ammo (zombies restart). */
  resetArsenal(): void;
}

/**
 * A game mode plugged into the shared shell (renderer, player, weapons,
 * ballistics, HUD). Implementations keep mode-specific systems isolated so
 * the shooting range never learns what a zombie is, and vice versa.
 */
export interface GameMode {
  readonly id: GameModeId;
  /** Weapons instantiated and preloaded for this mode (no runtime loads). */
  readonly weaponIds: readonly WeaponId[];
  /**
   * Loadout the player starts with. Defaults to weaponIds (the Shooting
   * Range keeps one slot per weapon; Zombies starts with the M1911 alone).
   */
  readonly startingInventory?: readonly WeaponId[];
  /** Inventory slot cap; defaults to weaponIds.length (effectively uncapped). */
  readonly maxWeapons?: number;
  init(ctx: ModeContext): void;
  update(dt: number): void;
  /** Routes ballistics hits on HitTargets (range plates, zombie hitboxes…). */
  onTargetHit(
    target: HitTarget,
    distance: number,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    object: THREE.Object3D,
    weapon: Weapon,
  ): void;
  /**
   * Intercepts a shot before it enters the ballistic simulation. Return
   * true when the mode handles it itself (Ray Gun energy bolts).
   */
  onWeaponFired?(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean;
  /**
   * Called when the pointer lock is lost. Return true when the mode shows
   * its own UI (game over) and the default pause screen should be skipped.
   */
  onPointerUnlock?(): boolean;
  /** Interact key (E) pressed while gameplay input is active. */
  onInteract?(): void;
  /**
   * Center-screen interaction prompt ("MYSTERY BOX\nPress E"); polled every
   * frame by the shell. Return null to hide it.
   */
  getInteractPrompt?(): string | null;
}
