import type * as THREE from 'three';
import { WEAPON_ORDER } from '../config/weapons';
import type { HitTarget } from '../shooting/HitTarget';
import type { WeaponId } from '../weapons/WeaponTypes';
import type { GameMode, ModeContext } from './GameMode';
import { standardTargetHitEffects } from './hitEffects';

/**
 * The classic shooting range, exactly as it has always behaved: static
 * target rows, accuracy stats and target feedback. Zombies and the Ray Gun
 * simply do not exist here — this mode never references them.
 */
export class ShootingRangeMode implements GameMode {
  readonly id = 'range' as const;
  readonly weaponIds: readonly WeaponId[] = WEAPON_ORDER;
  readonly showsAimDistance = true;

  private ctx!: ModeContext;

  init(ctx: ModeContext): void {
    this.ctx = ctx;
    ctx.hud.setZombiesPanelVisible(false);
    ctx.hud.setRangeStatsVisible(true);
  }

  /** The range has no per-frame logic of its own (targets update in Game). */
  update(): void {}

  onTargetHit(
    target: HitTarget,
    distance: number,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    object: THREE.Object3D,
  ): void {
    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker();
    standardTargetHitEffects(this.ctx.audio, this.ctx.effects, target, point, normal, object);
  }
}
