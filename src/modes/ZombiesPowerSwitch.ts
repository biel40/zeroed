import * as THREE from 'three';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import type { ArenaPowerSwitch } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/**
 * The map's main switch in a single-player run: USE at it, once and for
 * free, throws it. The map plays the lever and powers itself up; this
 * only offers it, plays the switch's sound and announces the power.
 * `ZombiesMode` delegates every power-switch concern here.
 */
export class ZombiesPowerSwitch {
  private readonly forward = new THREE.Vector3();

  constructor(
    private readonly ctx: ModeContext,
    private readonly powerSwitch: ArenaPowerSwitch,
  ) {}

  /** Prompt while facing the switch before it is thrown, else null. */
  prompt(): string | null {
    if (!this.facingSwitch()) return null;
    return t('prompt.powerSwitch', { key: actionKey(this.ctx.profile.useTouchControls) });
  }

  /** USE pressed: throws the faced switch. False when it is not faced or already thrown. */
  interact(): boolean {
    if (!this.facingSwitch() || !this.powerSwitch.activate()) return false;
    this.ctx.audio.playPowerSwitch();
    this.ctx.hud.showRoundBanner(t('banner.powerOn'));
    return true;
  }

  private facingSwitch(): boolean {
    const player = this.ctx.player;
    const { position, floor, useRange, lookDotMin, isOn } = this.powerSwitch;
    if (isOn || floor !== player.floor) return false;
    const dx = position.x - player.rig.position.x;
    const dz = position.z - player.rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > useRange) return false;
    const forward = player.camera.getWorldDirection(this.forward);
    return distance < 1e-3 || (forward.x * dx + forward.z * dz) / distance >= lookDotMin;
  }
}
