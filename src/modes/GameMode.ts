import type * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import type { AudioSystem } from '../audio/AudioSystem';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { Stats } from '../game/Stats';
import type { Input } from '../player/Input';
import type { PlayerController } from '../player/PlayerController';
import type { Effects } from '../rendering/Effects';
import type { HitTarget } from '../shooting/HitTarget';
import type { HUD } from '../ui/HUD';
import type { Weapon } from '../weapons/Weapon';
import type { WeaponId } from '../weapons/WeaponTypes';

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
   * Mutable collider array shared with the BallisticsSystem and the aim
   * raycast. Modes may push/splice dynamic hitboxes (zombies) here.
   */
  readonly hitColliders: THREE.Object3D[];
  /** User-gesture-safe pointer lock + audio resume. */
  lockPointer(): void;
  unlockPointer(): void;
  /**
   * Adds a weapon to the player inventory, honouring the mode's slot cap.
   * Mystery Box and Wall Buy grants arrive with fresh ammo.
   */
  grantWeapon(id: WeaponId): boolean;
  canGrantWeapon(id: WeaponId): boolean;
  hasWeapon(id: WeaponId): boolean;
  /** Weapon selected when an interaction begins. */
  getEquippedWeaponId(): WeaponId;
  /** Read by networked modes to publish aim/reload state; do not mutate. */
  getEquippedWeapon(): Weapon;
  canRefillWeaponAmmo(id: WeaponId): boolean;
  refillWeaponAmmo(id: WeaponId): boolean;
  canRefillEquippedWeaponAmmo(): boolean;
  refillEquippedWeaponAmmo(): boolean;
  setWeaponInfiniteReserve(id: WeaponId): boolean;
  /** Restores the starting inventory with fresh ammo (zombies restart). */
  resetArsenal(): void;
  /** Leaves the current run through the shell's established main-menu route. */
  returnToMainMenu(): void;
}

/**
 * A game mode plugged into the shared shell (renderer, player, weapons,
 * ballistics, HUD). Implementations keep mode-specific systems isolated so
 * the shared shell never learns map-specific Zombies behavior.
 */
export interface GameMode {
  readonly id: 'zombies';
  /** Weapons instantiated and preloaded for this mode (no runtime loads). */
  readonly weaponIds: readonly WeaponId[];
  /**
   * Loadout the player starts with. Zombies starts with the M1911 alone.
   */
  readonly startingInventory?: readonly WeaponId[];
  /** Inventory slot cap; defaults to weaponIds.length (effectively uncapped). */
  readonly maxWeapons?: number;
  /**
   * Networked match: the world is shared, so the local pause menu only gates
   * this player's input and the Game loop keeps simulating behind it.
   */
  readonly sharedSimulation?: boolean;
  /** An authority-owned pause freezes the shared frame on every client. */
  isSimulationPaused?(): boolean;
  /** The local pause menu changed after gameplay began. */
  onLocalPauseChanged?(paused: boolean): void;
  onGameplayStarted?(): void;
  /**
   * Starting reserve ammunition per weapon, when the mode overrides the
   * definition's default. Return undefined to keep the definition value
   * (which itself may be undefined = bottomless). Zombies uses this to give
   * every weapon a finite pool without mutating the shared definition.
   */
  reserveAmmoFor?(id: WeaponId): number | undefined;
  init(ctx: ModeContext): void;
  update(dt: number): void;
  /** Routes ballistics hits on HitTargets (zombie hitboxes and map objects). */
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
  /** Local weapon accepted a reload request. */
  onWeaponReloaded?(weapon: Weapon): void;
  /** Mode-owned fallback (for example the Zombies knife) replaces fire/ADS input. */
  usesFallbackAttack?(): boolean;
  getFallbackWeaponName?(): string | null;
  /**
   * Called when the pointer lock is lost. Return true when the mode shows
   * its own UI (game over) and the default pause screen should be skipped.
   */
  onPointerUnlock?(): boolean;
  /** Shell-level gate for movement, weapons and interactions. */
  isGameplayInputEnabled?(): boolean;
  /** Movement may continue during a committed interaction while weapons are gated. */
  isCombatInputEnabled?(): boolean;
  /** Allow aiming the view while movement remains locked (for example DOWNED). */
  isDownedLookEnabled?(): boolean;
  /** Ordered desktop keyboard input for mode-owned developer commands. */
  onKeyInput?(key: string): void;
  /** Interact key (E) pressed while gameplay input is active. */
  onInteract?(): void;
  /** Dedicated quick-melee action; does not consume an inventory slot. */
  onMeleeAttack?(): void;
  /**
   * The pause menu's RESTART action. The mode resets its own run state
   * (health, rounds, kills, economy, arsenal) and resumes play. Optional:
   * a future mode without run state may omit it; Game then only re-locks.
   */
  onRestartRequested?(): void;
  onExit?(): void;
  /**
   * Center-screen interaction prompt ("MYSTERY BOX\nPress E"); polled every
   * frame by the shell. Return null to hide it.
   */
  getInteractPrompt?(): string | null;
}
