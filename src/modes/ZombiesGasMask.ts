import * as THREE from 'three';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import type { MeleeArmDriver } from '../weapons/ViewArms';
import { GasMaskDonning } from '../zombies/gasMask/GasMaskDonning';
import type { ArenaGasMaskRack } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/**
 * The map's wearable gas mask in a single-player run, a cosmetic easter egg:
 * USE at its hook puts it on (the hand brings it to the face and the masked
 * view closes in) and USE again hangs it back. `ZombiesMode` delegates every
 * gas mask concern here.
 */
export class ZombiesGasMask {
  private readonly donning = new GasMaskDonning();
  private readonly forward = new THREE.Vector3();

  constructor(
    private readonly ctx: ModeContext,
    private readonly rack: ArenaGasMaskRack,
  ) {
    ctx.player.camera.add(this.donning.root);
  }

  /** True while the mask is going on or coming off: the right arm is busy. */
  get isAnimating(): boolean {
    return this.donning.isAnimating;
  }

  /** The donning borrows the right arm while it plays. */
  get armDriver(): MeleeArmDriver | null {
    return this.donning.isAnimating ? this.donning : null;
  }

  /** Prompt while facing the hook with the mask on it or on the face, else null. */
  prompt(): string | null {
    if (!this.facingRack()) return null;
    const key = actionKey(this.ctx.profile.useTouchControls);
    switch (this.donning.state) {
      case 'off': return t('prompt.wearGasMask', { key });
      case 'on': return t('prompt.removeGasMask', { key });
      default: return null;
    }
  }

  /** USE pressed: puts the mask on or hangs it back. False when the hook is not faced. */
  interact(): boolean {
    if (!this.facingRack()) return false;
    if (this.donning.putOn()) this.rack.setMaskOnHook(false);
    else this.donning.takeOff();
    return true;
  }

  update(dt: number): void {
    if (this.donning.update(dt) === 'off') this.rack.setMaskOnHook(true);
    this.ctx.hud.setGasMask(this.donning.viewLevel);
  }

  /** New run: bare face, mask back on its hook. */
  reset(): void {
    this.donning.reset();
    this.rack.setMaskOnHook(true);
    this.ctx.hud.setGasMask(0);
  }

  private facingRack(): boolean {
    const player = this.ctx.player;
    if (this.rack.floor !== player.floor) return false;
    const dx = this.rack.position.x - player.rig.position.x;
    const dz = this.rack.position.z - player.rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.rack.useRange) return false;
    const forward = player.camera.getWorldDirection(this.forward);
    return distance < 1e-3 || (forward.x * dx + forward.z * dz) / distance >= this.rack.lookDotMin;
  }
}
