import type * as THREE from 'three';
import type { PlayerHealth } from '../game/PlayerHealth';
import { RADIANT_RING, RadiantRingTally, type RadiantRingEffect } from '../game/rings/RadiantRing';
import { t } from '../i18n/i18n';
import type { RingHudEntry } from '../ui/SurvivalPresentation';
import type { RingDonning } from '../weapons/RingDonning';
import type { ModeContext } from './GameMode';

/** Seconds for the white halo to come in or go away. */
const HALO_FADE = 0.8;
/** Flares of the thumb ring: lighting up again, scavenging ammo, releasing an echo. */
const REKINDLE_PULSE = 0.8;
const SCAVENGE_PULSE = 0.35;
const ECHO_PULSE = 0.6;
const ECHO_TINT = 0xf4f8ff;
const ECHO_PUFF_SIZE = 0.7;

/**
 * Presentation and light bonuses of the white ring in a Zombies run. Lit
 * while `PlayerRings` reports every catalog ring charged: it is put on the
 * thumb the first time (after the hands finish any ring going on), then
 * only lights up or goes dark. While lit it speeds walking a little, starts
 * regeneration sooner, pays a bit more per kill, scavenges reserve ammo and
 * primes echoes, and keeps a faint white halo on the HUD. `ZombiesRings`
 * owns it and forwards its events.
 */
export class ZombiesRadiantRing {
  private readonly tally = new RadiantRingTally(RADIANT_RING.effect);
  private lit = false;
  /** Put on the thumb this run: from then on it stays there, lit or dark. */
  private worn = false;
  /** Putting it on waits for the hands ('queued'), then plays ('playing'). */
  private donningState: 'queued' | 'playing' | null = null;
  private halo = 0;

  public constructor(
    private readonly ctx: ModeContext,
    private readonly donning: RingDonning,
    private readonly health: PlayerHealth,
  ) {}

  /** Every catalog ring is charged: light the ring, putting it on the first time. */
  public awaken(): void {
    this.lit = true;
    if (!this.worn) {
      this.donningState = 'queued';
      return;
    }
    this.ctx.audio.playRingRecharge();
    this.ctx.hud.showRoundBanner(t(RADIANT_RING.nameKey), t('banner.radiantRekindled'));
    this.ctx.handRings.pulse(RADIANT_RING.finger, REKINDLE_PULSE);
  }

  /** A ring was spent: dark until it is recharged, and the kill tally starts over. */
  public fade(): void {
    this.lit = false;
    this.tally.reset();
    if (this.donningState === 'queued') this.donningState = null;
  }

  /** Multiplier on kill rewards. */
  public get killPointsScale(): number {
    return this.lit ? RADIANT_RING.effect.killPointsScale : 1;
  }

  /** A zombie died: while lit, counts toward the next scavenge and echo. */
  public registerKill(): void {
    if (!this.lit || !this.tally.registerKill()) return;
    if (this.ctx.getEquippedWeapon().restoreReserveShare(RADIANT_RING.effect.scavengeReserveShare)) {
      this.ctx.handRings.pulse(RADIANT_RING.finger, SCAVENGE_PULSE);
    }
  }

  /**
   * A bullet hit a zombie at `point`: spends a primed echo, flashing it
   * there. Returns the echo's parameters for the mode to apply, or null.
   */
  public releaseEcho(point: THREE.Vector3): RadiantRingEffect | null {
    if (!this.lit || !this.tally.releaseEcho()) return null;
    this.ctx.effects.puff(point, ECHO_TINT, ECHO_PUFF_SIZE);
    this.ctx.handRings.pulse(RADIANT_RING.finger, ECHO_PULSE);
    return RADIANT_RING.effect;
  }

  /**
   * Plays the putting on once the hands are free and fades the halo.
   * Runs after the ring donning updated. True when the worn rings changed
   * and the owner should present them again.
   */
  public update(dt: number): boolean {
    const changed = this.updateDonning();
    const target = this.lit && this.worn && this.donningState === null ? 1 : 0;
    const step = Math.max(0, dt) / HALO_FADE;
    this.halo = target > this.halo ? Math.min(target, this.halo + step) : Math.max(target, this.halo - step);
    this.ctx.hud.setRadiance(this.halo);
    return changed;
  }

  /** Walking, regeneration and the thumb ring follow whether it is lit. */
  public present(): void {
    const { effect } = RADIANT_RING;
    this.ctx.player.setMoveSpeedScale(this.lit ? effect.moveSpeedScale : 1);
    this.health.setRegenDelayScale(this.lit ? effect.regenDelayScale : 1);
    if (this.worn) this.ctx.handRings.show(RADIANT_RING.finger, this.lit ? 'charged' : 'spent', RADIANT_RING.glowColor);
  }

  /** Its icon on the HUD once worn. */
  public hudEntry(): RingHudEntry | null {
    if (!this.worn) return null;
    return { finger: RADIANT_RING.finger, nameKey: RADIANT_RING.nameKey, charged: this.lit, glowColor: RADIANT_RING.glowColor };
  }

  /** New run: off the hand, no bonuses, no halo. The owner clears the hand and presents. */
  public reset(): void {
    this.lit = false;
    this.worn = false;
    this.donningState = null;
    this.halo = 0;
    this.tally.reset();
    this.ctx.hud.setRadiance(0);
  }

  private updateDonning(): boolean {
    if (this.donning.isAnimating) return false;
    if (this.donningState === 'queued') {
      this.donning.start(RADIANT_RING.finger);
      this.worn = true;
      this.donningState = 'playing';
      this.ctx.audio.playRingPurchase();
      this.ctx.hud.showRoundBanner(t(RADIANT_RING.nameKey), t('banner.radiantAwakened'));
      return true;
    }
    if (this.donningState === 'playing') {
      this.donningState = null;
      this.ctx.hud.flashRing('radiant');
      this.ctx.handRings.pulse(RADIANT_RING.finger, 1);
    }
    return false;
  }
}
