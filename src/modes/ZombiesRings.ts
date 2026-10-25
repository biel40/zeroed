import * as THREE from 'three';
import { spatialMuffle, spatialPan } from '../audio/SpatialCue';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import type { PlayerHealth } from '../game/PlayerHealth';
import { PlayerRings } from '../game/rings/PlayerRings';
import { RING_DEFINITIONS } from '../game/rings/RingCatalog';
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
/** The blue protection vignette fades in this fast and flickers through its last PROTECTION_WARNING seconds. */
const PROTECTION_FADE_IN = 0.3;
const PROTECTION_WARNING = 1;
const PROTECTION_FLICKER_HZ = 4;

/**
 * Strength 0..1 of the blue protection vignette `elapsed` seconds into a
 * protection with `remaining` seconds left: it fades in, holds while the
 * player is safe, then flickers so the end never comes as a surprise.
 */
export function protectionVignette(elapsed: number, remaining: number): number {
  if (remaining <= 0) return 0;
  const fadeIn = Math.min(1, elapsed / PROTECTION_FADE_IN);
  if (remaining > PROTECTION_WARNING) return fadeIn;
  const warned = PROTECTION_WARNING - remaining;
  const flicker = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(warned * Math.PI * 2 * PROTECTION_FLICKER_HZ));
  return fadeIn * flicker;
}

/**
 * Rings in a single-player Zombies run. Sells and recharges them at the
 * map's powered ring machines through the shared wallet, fires their
 * effects (a charged Resurrection ring takes the place of a death, a
 * Sleight of Hand ring speeds every reload) and keeps the first-person
 * hand, the machines, the weapons and the HUD in step with the run's `PlayerRings`.
 * `ZombiesMode` delegates every ring concern here.
 */
export class ZombiesRings {
  private readonly rings = new PlayerRings();
  private readonly forward = new THREE.Vector3();
  private readonly listener = new THREE.Vector3();
  /** Seconds into getting back up after a resurrection, and how long it takes; null when standing. */
  private getUpElapsed: number | null = null;
  private getUpDuration = 0;
  /** Seconds into the current protection and seconds left of it (0 when unprotected). */
  private protectionElapsed = 0;
  private protectionRemaining = 0;

  constructor(
    private readonly ctx: ModeContext,
    private readonly machines: ReadonlyArray<ArenaRingMachine>,
    private readonly economy: PlayerEconomy,
  ) {
    this.present();
  }

  /** Prompt of the faced machine while it has something to sell (or waits for power), else null. */
  prompt(): string | null {
    const machine = this.facingMachine();
    if (!machine) return null;
    const ring = t(RING_DEFINITIONS[machine.ringId].nameKey);
    if (!machine.powered) return t('prompt.ringNeedsPower', { ring });
    const key = actionKey(this.ctx.profile.useTouchControls);
    const cost = this.rings.priceOf(machine.ringId)!;
    return t(this.rings.has(machine.ringId) ? 'prompt.rechargeRing' : 'prompt.buyRing', { ring, key, cost });
  }

  /**
   * USE pressed: buys or recharges at the faced machine. A machine waiting
   * for power takes the press and sells nothing. False when no machine has
   * anything to sell.
   */
  interact(): boolean {
    const machine = this.facingMachine();
    if (!machine) return false;
    if (!machine.powered) return true;
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
   * run. The player comes back with its health share, gets up, and stays
   * protected (invulnerable here; the mode makes the horde ignore them) for
   * the get-up plus the ring's protection, under the blue vignette. Returns
   * those protected seconds, or null when no ring could save the player.
   */
  tryResurrect(health: PlayerHealth): number | null {
    for (const { ringId } of this.rings.worn) {
      const { effect } = RING_DEFINITIONS[ringId];
      if (effect.kind !== 'resurrection' || !this.rings.consumeCharge(ringId)) continue;
      const protectedFor = effect.getUp + effect.protection;
      health.revive(effect.reviveFraction, protectedFor);
      this.getUpElapsed = 0;
      this.getUpDuration = effect.getUp;
      this.protectionElapsed = 0;
      this.protectionRemaining = protectedFor;
      this.processEvents();
      this.ctx.hud.setProtection(protectionVignette(0, protectedFor));
      return protectedFor;
    }
    return null;
  }

  /**
   * A ZEUS-77 bolt grounded at `point`: the nearest machine on the player's
   * floor within `reach` that waits for power takes `seconds` of it (sells
   * and plays meanwhile). Returns that machine, or null when none took it.
   */
  energizeMachineAt(point: THREE.Vector3Like, seconds: number, reach: number): ArenaRingMachine | null {
    let nearest: ArenaRingMachine | null = null;
    let nearestDistance = reach;
    for (const machine of this.machines) {
      if (machine.floor !== this.ctx.player.floor || !machine.energize) continue;
      const { x, y, z } = machine.position;
      const distance = Math.hypot(point.x - x, point.y - y, point.z - z);
      if (distance <= nearestDistance) {
        nearest = machine;
        nearestDistance = distance;
      }
    }
    if (!nearest?.energize?.(seconds)) return null;
    this.ctx.hud.showRoundBanner(t(RING_DEFINITIONS[nearest.ringId].nameKey), t('banner.machineCharged', { seconds }));
    return nearest;
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
    this.updateProtection(dt);
    if (this.getUpElapsed === null) return;
    this.getUpElapsed += Math.max(0, dt);
    const pose = getUpPose(this.getUpElapsed, this.getUpDuration);
    const camera = this.ctx.player.camera;
    camera.position.y = -pose.drop;
    camera.rotation.x += pose.pitch;
    camera.rotation.z += pose.roll;
    if (this.getUpElapsed >= this.getUpDuration) this.getUpElapsed = null;
  }

  /** Counts the protection down and keeps the blue vignette in step with it. */
  private updateProtection(dt: number): void {
    if (this.protectionRemaining <= 0) return;
    const step = Math.max(0, dt);
    this.protectionElapsed += step;
    this.protectionRemaining = Math.max(0, this.protectionRemaining - step);
    this.ctx.hud.setProtection(protectionVignette(this.protectionElapsed, this.protectionRemaining));
  }

  /**
   * The machines' jingle, like a perk machine's: the nearest powered
   * machine on the player's floor plays its ring's tune, fading out with
   * distance. Silent while `audible` is false (intro, pause, game over,
   * ending) or no powered machine is in range. Called every frame;
   * allocation free.
   */
  updateJingle(audible: boolean): void {
    const player = this.ctx.player;
    const listener = player.camera.getWorldPosition(this.listener);
    let nearest: ArenaRingMachine | null = null;
    let nearestDistance = JINGLE_RANGE;
    for (const machine of audible ? this.machines : []) {
      if (machine.floor !== player.floor || !machine.powered) continue;
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
      RING_DEFINITIONS[nearest.ringId].jingle,
    );
  }

  /** New run: every ring off the hand and back in its machine. */
  reset(): void {
    this.getUpElapsed = null;
    this.protectionElapsed = 0;
    this.protectionRemaining = 0;
    this.ctx.hud.setProtection(0);
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

  /**
   * Reload-duration multiplier of the worn rings: the strongest charged
   * reload ring, or 1 without one. Passive rings keep their charge, so
   * wearing one is enough.
   */
  private reloadTimeScale(): number {
    let scale = 1;
    for (const { ringId, charges } of this.rings.worn) {
      const { effect } = RING_DEFINITIONS[ringId];
      if (effect.kind === 'reloadSpeed' && charges > 0) scale = Math.min(scale, effect.reloadTimeScale);
    }
    return scale;
  }

  /** Hand, machines, HUD and the weapons' reload speed read the current rings. */
  private present(): void {
    this.ctx.setReloadTimeScale(this.reloadTimeScale());
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
