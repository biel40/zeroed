import * as THREE from 'three';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import type { PlayerHealth } from '../game/PlayerHealth';
import { PlayerRings } from '../game/rings/PlayerRings';
import { RING_DEFINITIONS } from '../game/rings/RingCatalog';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import type { ArenaRingMachine, RingMachineDisplay } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/** How strongly the worn ring flares when put on or recharged, and when it fires. */
const WEAR_PULSE = 0.8;
const FIRE_PULSE = 1;

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
   * run, bringing the player back with its health share and a moment of
   * invulnerability. True when a ring saved the player.
   */
  tryResurrect(health: PlayerHealth): boolean {
    for (const { ringId } of this.rings.worn) {
      const { effect } = RING_DEFINITIONS[ringId];
      if (effect.kind !== 'resurrection' || !this.rings.consumeCharge(ringId)) continue;
      health.revive(effect.reviveFraction, effect.invulnerability);
      this.processEvents();
      return true;
    }
    return false;
  }

  /** New run: every ring off the hand and back in its machine. */
  reset(): void {
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

  private displayFor(machine: ArenaRingMachine): RingMachineDisplay {
    if (!this.rings.has(machine.ringId)) return 'stocked';
    return this.rings.chargesOf(machine.ringId) > 0 ? 'empty' : 'recharge';
  }
}
