import * as THREE from 'three';
import { t, type TranslationKey } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import { StartupCrystalView } from '../zombies/StartupCrystalView';
import type { Zombie } from '../zombies/Zombie';
import type { ArenaWeaponStation } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';
import { bearingArrow } from './ObjectiveBearing';

type RecoveryStage = 'inactive' | 'hunting' | 'dropped' | 'carrying' | 'installed' | 'complete';
type Position = Readonly<{ x: number; y: number; z: number }>;
const PICKUP_RANGE = 2;

/** Run-local unlock for any station requesting a startup crystal; the normal horde supplies its carrier. */
export class ZombiesCrystalRecovery {
  private stage: RecoveryStage = 'inactive';
  private carrier: Zombie | null = null;
  private dropPosition: Position | null = null;
  private dropFloor = 0;
  private readonly view: StartupCrystalView;
  private readonly forward = new THREE.Vector3();

  constructor(private readonly ctx: ModeContext, readonly station: ArenaWeaponStation) {
    this.view = new StartupCrystalView(ctx.scene);
    this.reset();
  }

  get locked(): boolean { return this.stage !== 'installed' && this.stage !== 'complete'; }

  update(dt: number, zombies: ReadonlySet<Zombie>): void {
    if (this.stage === 'installed' && this.ctx.hasWeapon(this.station.weaponId)) this.stage = 'complete';
    if (this.stage === 'inactive' && this.station.powered) {
      this.stage = 'hunting';
    }
    if (this.stage === 'hunting' && !this.carrier) {
      // Existing walkers keep round accounting and the population cap intact.
      let nearest = Infinity;
      for (const zombie of zombies) {
        if (!zombie.isAlive || zombie.typeId !== 'normal') continue;
        const distance = zombie.position.distanceToSquared(this.ctx.player.rig.position);
        if (distance < nearest) {
          nearest = distance;
          this.carrier = zombie;
        }
      }
    }
    const target = this.targetPosition();
    if (target) this.view.update(dt, target, this.carrier, this.stage === 'carrying');
    else this.view.hide();
  }

  onKilled(zombie: Zombie, dropPosition: Position): void {
    if (this.stage !== 'hunting' || zombie !== this.carrier) return;
    this.carrier = null;
    this.dropPosition = { ...dropPosition };
    this.dropFloor = zombie.floor;
    this.stage = 'dropped';
    this.ctx.audio.playMysteryBoxPickup();
    this.view.update(0, this.dropPosition, null, false);
  }

  /** Crystal pickup shares USE and facing rules with other interactions, on desktop and touch. */
  pickupPrompt(): string | null {
    if (this.stage !== 'dropped' || !this.dropPosition || !this.facingDrop()) return null;
    return t('crystal.pickupPrompt', { key: actionKey(this.ctx.profile.useTouchControls) });
  }

  pickUp(): boolean {
    if (!this.pickupPrompt()) return false;
    this.stage = 'carrying';
    this.view.hide();
    this.ctx.audio.playMysteryBoxPickup();
    return true;
  }

  /** Called only after the mode's station-facing check. Installing is a free, separate interaction. */
  interactAtStation(): boolean {
    if (!this.locked) return false;
    if (this.stage === 'carrying' && this.station.powered) {
      this.stage = 'installed';
      this.station.setLocked?.(false);
      this.station.activate();
      this.view.hide();
      this.ctx.audio.playMysteryBoxPickup();
    }
    return true;
  }

  stationPrompt(): string {
    if (!this.station.powered) return t('crystal.needsPower');
    if (this.stage === 'carrying') {
      return t('crystal.installPrompt', { key: actionKey(this.ctx.profile.useTouchControls) });
    }
    return t('crystal.locked');
  }

  objective(): string | null {
    if (this.stage === 'inactive' || this.stage === 'complete') return null;
    if (this.stage === 'installed') {
      return `ФАКЕЛ-33 · ${t('crystal.buy', { cost: this.station.price })}`;
    }
    const key: TranslationKey = this.stage === 'hunting' ? (this.carrier ? 'crystal.hunt' : 'crystal.wait')
      : this.stage === 'dropped' ? 'crystal.collect' : 'crystal.return';
    const target = this.targetPosition();
    if (!target) return `ФАКЕЛ-33 · ${t(key)}`;
    const player = this.ctx.player;
    const dx = target.x - player.rig.position.x;
    const dz = target.z - player.rig.position.z;
    player.camera.getWorldDirection(this.forward);
    const arrow = bearingArrow(this.forward.x, this.forward.z, dx, dz);
    return `ФАКЕЛ-33 · ${t(key)}\n${arrow} ${Math.ceil(Math.hypot(dx, dz))} m`;
  }

  reset(): void {
    this.stage = 'inactive';
    this.carrier = null;
    this.dropPosition = null;
    this.dropFloor = 0;
    this.station.setLocked?.(true);
    this.view.hide();
  }

  private targetPosition(): Position | null {
    if (this.stage === 'hunting') return this.carrier?.position ?? null;
    if (this.stage === 'dropped') return this.dropPosition;
    if (this.stage === 'carrying') return this.station.position;
    return null;
  }

  private facingDrop(): boolean {
    const position = this.dropPosition!;
    const player = this.ctx.player;
    if (player.floor !== this.dropFloor) return false;
    const dx = position.x - player.rig.position.x;
    const dz = position.z - player.rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > PICKUP_RANGE) return false;
    player.camera.getWorldDirection(this.forward);
    return distance < 0.1 || (dx * this.forward.x + dz * this.forward.z) / distance >= 0.4;
  }
}
