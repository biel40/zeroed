import * as THREE from 'three';
import { spatialMuffle, spatialPan } from '../audio/SpatialCue';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import type { PlayerHealth } from '../game/PlayerHealth';
import { PlayerRings } from '../game/rings/PlayerRings';
import { RING_DEFINITIONS, type RingEffect } from '../game/rings/RingCatalog';
import { t } from '../i18n/i18n';
import { getUpPose } from '../player/ReviveGetUp';
import { actionKey } from '../ui/InteractionPrompts';
import type { ArenaRingMachine, RingMachineDisplay } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/** How strongly the worn ring flares when put on or recharged, and when it fires. */
const WEAR_PULSE = 0.8;
const FIRE_PULSE = 1;
/** The machines' jingle plays at full volume up to here, then fades out by JINGLE_RANGE (metres). */
const JINGLE_FULL_VOLUME_DISTANCE = 2.5;
const JINGLE_RANGE = 10;

/**
 * Rings in a single-player Zombies run. Sells and recharges them at the
 * map's ring machines through the shared wallet, fires their effects (a
 * charged Resurrection ring takes the place of a death) and keeps the
 * glove, the machines and the HUD in step with the run's `PlayerRings`.
 * `ZombiesMode` delegates every ring concern here.
 */
export class ZombiesRings {
  private readonly rings = new PlayerRings();
  private readonly forward = new THREE.Vector3();
  private readonly listener = new THREE.Vector3();
  /** Seconds into getting back up after a resurrection, and how long it takes; null when standing. */
  private getUpElapsed: number | null = null;
  private getUpDuration = 0;

  constructor(
    private readonly ctx: ModeContext,
    private readonly machines: ReadonlyArray<ArenaRingMachine>,
    private readonly economy: PlayerEconomy,
  ) {
    this.present();
  }

  /** Prompt of the faced machine while it has something to sell, else null. */
  prompt(): string | null {
    const machine = this.facingMachine();
    if (!machine) return null;
    const ring = t(RING_DEFINITIONS[machine.ringId].nameKey);
    const key = actionKey(this.ctx.profile.useTouchControls);
    const cost = this.rings.priceOf(machine.ringId)!;
    return t(this.rings.has(machine.ringId) ? 'prompt.rechargeRing' : 'prompt.buyRing', { ring, key, cost });
  }

  /** USE pressed: buys or recharges at the faced machine. False when no machine has anything to sell. */
  interact(): boolean {
    const machine = this.facingMachine();
    if (!machine) return false;
    const cost = this.rings.priceOf(machine.ringId)!;
    if (this.rings.buy(machine.ringId, (price) => this.economy.spend(price)) === 'notEnoughPoints') {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost }));
      return true;
    }
    this.processEvents();
    return true;
  }

  /**
   * A lethal hit landed: a charged Resurrection ring is spent instead of the
   * run, bringing the player back with its health share and invulnerability,
   * and starting the get-up. Returns the effect that saved the player (the
   * mode reads how long the horde loses them), or null when no ring could.
   */
  tryResurrect(health: PlayerHealth): RingEffect | null {
    for (const { ringId } of this.rings.worn) {
      const { effect } = RING_DEFINITIONS[ringId];
      if (effect.kind !== 'resurrection' || !this.rings.consumeCharge(ringId)) continue;
      health.revive(effect.reviveFraction, effect.invulnerability);
      this.getUpElapsed = 0;
      this.getUpDuration = effect.getUp;
      this.processEvents();
      return effect;
    }
    return null;
  }

  /** True while the player is getting back up after a resurrection. */
  get isGettingUp(): boolean {
    return this.getUpElapsed !== null;
  }

  /**
   * Plays the get-up on the camera. Runs after the player controller wrote
   * its pose this frame: the drop replaces the eye height (which eases back
   * on its own once standing) and the slump adds to the recoil rotation.
   */
  update(dt: number): void {
    if (this.getUpElapsed === null) return;
    this.getUpElapsed += Math.max(0, dt);
    const pose = getUpPose(this.getUpElapsed, this.getUpDuration);
    const camera = this.ctx.player.camera;
    camera.position.y = -pose.drop;
    camera.rotation.x += pose.pitch;
    camera.rotation.z += pose.roll;
    if (this.getUpElapsed >= this.getUpDuration) this.getUpElapsed = null;
  }

  /**
   * The machines' jingle, like a perk machine's: it plays around the nearest
   * machine on the player's floor and fades out with distance. Silent while
   * `audible` is false (intro, pause, game over, ending) or no machine is in
   * range. Called every frame; allocation free.
   */
  updateJingle(audible: boolean): void {
    const player = this.ctx.player;
    const listener = player.camera.getWorldPosition(this.listener);
    let nearest: ArenaRingMachine | null = null;
    let nearestDistance = JINGLE_RANGE;
    for (const machine of audible ? this.machines : []) {
      if (machine.floor !== player.floor) continue;
      const distance = Math.hypot(machine.position.x - listener.x, machine.position.z - listener.z);
      if (distance < nearestDistance) {
        nearest = machine;
        nearestDistance = distance;
      }
    }
    if (!nearest) {
      this.ctx.audio.setRingJingle(0, 0, 0);
      return;
    }
    const forward = player.camera.getWorldDirection(this.forward);
    this.ctx.audio.setRingJingle(
      1 - THREE.MathUtils.smoothstep(nearestDistance, JINGLE_FULL_VOLUME_DISTANCE, JINGLE_RANGE),
      spatialPan(listener, forward, nearest.position),
      spatialMuffle(listener, forward, nearest.position),
    );
  }

  /** New run: every ring off the hand and back in its machine. */
  reset(): void {
    this.getUpElapsed = null;
    this.rings.reset();
    this.ctx.handRings.clear();
    this.present();
  }

  private facingMachine(): ArenaRingMachine | null {
    const player = this.ctx.player;
    const position = player.rig.position;
    const forward = player.camera.getWorldDirection(this.forward);
    let best: ArenaRingMachine | null = null;
    let bestDot = -1;
    for (const machine of this.machines) {
      if (machine.floor !== player.floor || this.rings.priceOf(machine.ringId) === null) continue;
      const dx = machine.position.x - position.x;
      const dz = machine.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > machine.useRange) continue;
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= machine.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = machine;
      }
    }
    return best;
  }

  /** Purchases, recharges and activations drive audio, banners and the ring's flare. */
  private processEvents(): void {
    const { audio, hud, handRings } = this.ctx;
    this.present();
    for (const event of this.rings.pendingEvents) {
      const ring = RING_DEFINITIONS[event.ringId];
      const name = t(ring.nameKey);
      switch (event.type) {
        case 'purchased':
          audio.playRingPurchase();
          hud.showRoundBanner(name, t('banner.ringWorn', { finger: t(`ring.finger.${ring.finger}`) }));
          break;
        case 'recharged':
          audio.playRingRecharge();
          hud.showRoundBanner(name, t('banner.ringRecharged'));
          break;
        case 'consumed':
          audio.playResurrection();
          hud.flashRing();
          hud.showRoundBanner(name, t('banner.ringActivated'));
          break;
      }
      handRings.pulse(ring.finger, event.type === 'consumed' ? FIRE_PULSE : WEAR_PULSE);
    }
    this.rings.clearEvents();
  }

  /** Glove, machines and HUD read the current rings. */
  private present(): void {
    const worn = this.rings.worn;
    for (const { ringId, finger, charges } of worn) {
      this.ctx.handRings.show(finger, charges > 0 ? 'charged' : 'spent', RING_DEFINITIONS[ringId].glowColor);
    }
    for (const machine of this.machines) machine.setDisplay(this.displayFor(machine));
    this.ctx.hud.updateRings(worn.map(({ ringId, finger, charges }) => ({
      finger,
      nameKey: RING_DEFINITIONS[ringId].nameKey,
      charged: charges > 0,
      glowColor: RING_DEFINITIONS[ringId].glowColor,
    })));
  }

  /** Stocked until bought, empty while charged or once every purchase is used, else calling for a recharge. */
  private displayFor(machine: ArenaRingMachine): RingMachineDisplay {
    if (!this.rings.has(machine.ringId)) return 'stocked';
    return this.rings.priceOf(machine.ringId) === null ? 'empty' : 'recharge';
  }
}
