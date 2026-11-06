import type { TranslationKey } from '../../i18n/i18n';
import type { RingFinger } from './RingCatalog';

/**
 * A little of everything, all of it light: the reward for wearing every
 * catalog ring charged at once.
 */
export interface RadiantRingEffect {
  /** Multiplier on walking speed. */
  readonly moveSpeedScale: number;
  /** Multiplier on the wait before health starts regenerating. */
  readonly regenDelayScale: number;
  /** Multiplier on every kill reward. */
  readonly killPointsScale: number;
  /** Every this many kills, the equipped weapon recovers some reserve ammo... */
  readonly scavengeEveryKills: number;
  /** ...this share of its starting reserve (at least one round). */
  readonly scavengeReserveShare: number;
  /** Every this many kills, the next bullet that hits a zombie releases an echo... */
  readonly echoEveryKills: number;
  /** ...a wave this wide (metres, linear falloff)... */
  readonly echoRadius: number;
  /** ...dealing this share of the hit's damage at its centre. */
  readonly echoDamageShare: number;
}

export interface RadiantRingDefinition {
  readonly finger: RingFinger;
  readonly nameKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly glowColor: number;
  readonly effect: RadiantRingEffect;
}

/**
 * The white ring. No machine sells it: it lights up on the thumb, free,
 * while every catalog ring is worn and charged, and goes dark as soon as
 * one is spent (a Resurrection) until it is recharged.
 */
export const RADIANT_RING: RadiantRingDefinition = {
  finger: 'thumb',
  nameKey: 'ring.radiant',
  descriptionKey: 'ring.radiant.description',
  glowColor: 0xf4f8ff,
  effect: {
    moveSpeedScale: 1.08,
    regenDelayScale: 0.75,
    killPointsScale: 1.1,
    scavengeEveryKills: 8,
    scavengeReserveShare: 0.1,
    echoEveryKills: 12,
    echoRadius: 2.5,
    echoDamageShare: 0.5,
  },
};

/**
 * Kill counts behind the white ring's scavenge and echo while it shines.
 * Pure logic: the owner counts only kills made while the ring is lit and
 * resets the tally whenever it goes dark.
 */
export class RadiantRingTally {
  private killsSinceScavenge = 0;
  private killsSinceEcho = 0;
  private echoPrimed = false;

  public constructor(private readonly effect: RadiantRingEffect) {}

  /** True while the next bullet hit releases an echo. */
  public get isEchoPrimed(): boolean {
    return this.echoPrimed;
  }

  /** Counts a kill; true when it earns a scavenge. A primed echo waits to be released before counting again. */
  public registerKill(): boolean {
    if (!this.echoPrimed && ++this.killsSinceEcho >= this.effect.echoEveryKills) {
      this.killsSinceEcho = 0;
      this.echoPrimed = true;
    }
    if (++this.killsSinceScavenge < this.effect.scavengeEveryKills) return false;
    this.killsSinceScavenge = 0;
    return true;
  }

  /** Spends the primed echo; false when none is primed. */
  public releaseEcho(): boolean {
    if (!this.echoPrimed) return false;
    this.echoPrimed = false;
    return true;
  }

  public reset(): void {
    this.killsSinceScavenge = 0;
    this.killsSinceEcho = 0;
    this.echoPrimed = false;
  }
}
