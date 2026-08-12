import type * as THREE from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import type { Stats } from '../game/Stats';
import type { Input } from '../player/Input';
import type { PlayerController } from '../player/PlayerController';
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
  /**
   * Mutable collider array shared with the BallisticsSystem and the aim
   * raycast. Modes may push/splice dynamic hitboxes (zombies) here.
   */
  readonly hitColliders: THREE.Object3D[];
  /** User-gesture-safe pointer lock + audio resume. */
  lockPointer(): void;
  unlockPointer(): void;
}

/**
 * A game mode plugged into the shared shell (renderer, player, weapons,
 * ballistics, HUD). Implementations keep mode-specific systems isolated so
 * the shooting range never learns what a zombie is, and vice versa.
 */
export interface GameMode {
  readonly id: GameModeId;
  /** Weapons available in this mode, in slot order (keys 1..n). */
  readonly weaponIds: readonly WeaponId[];
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
}
