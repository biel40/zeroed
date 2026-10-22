import type { TranslationKey } from '../../i18n/i18n';

/** One hand, one ring per finger: the five slots a run can fill. */
export const RING_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type RingFinger = (typeof RING_FINGERS)[number];

export type RingId = 'resurrection';

/**
 * What a ring does, as data. Each kind has one hook in the mode that reads
 * its parameters; a new ring adds its kind here and its hook there.
 */
export type RingEffect = {
  readonly kind: 'resurrection';
  /** Share of max HP restored instead of dying. */
  readonly reviveFraction: number;
  /** Seconds of invulnerability from the moment the ring fires. */
  readonly invulnerability: number;
  /** Seconds spent getting back up: the player can look around but not move or fight. */
  readonly getUp: number;
  /** Seconds after standing up during which zombies lose track of the player. */
  readonly untargetable: number;
};

export interface RingDefinition {
  readonly id: RingId;
  /** Fixed finger: the same ring always sits in the same place on the hand. */
  readonly finger: RingFinger;
  readonly nameKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  /**
   * Price of each purchase in a run, the first one and every recharge after
   * it. Once all are used the machine has nothing left to sell that run.
   */
  readonly prices: readonly number[];
  readonly chargesPerPurchase: number;
  /** Enamel glow of the ring, a cold accent of the palette (gold stays premium). */
  readonly glowColor: number;
  readonly effect: RingEffect;
}

/**
 * Ring catalog. Rings are Zeroed's perks: wedding bands the evacuees left
 * in the station's luggage lockers. Prices follow the mansion economy.
 */
export const RING_DEFINITIONS: Readonly<Record<RingId, RingDefinition>> = {
  resurrection: {
    id: 'resurrection',
    finger: 'ring',
    nameKey: 'ring.resurrection',
    descriptionKey: 'ring.resurrection.description',
    // Doubles each time, three times a run (like a solo revive machine).
    prices: [500, 1000, 2000],
    chargesPerPurchase: 1,
    glowColor: 0x3fd8c8,
    effect: { kind: 'resurrection', reviveFraction: 0.5, invulnerability: 2.5, getUp: 1.2, untargetable: 2 },
  },
};
