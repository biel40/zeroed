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
  /** Seconds of invulnerability after coming back. */
  readonly invulnerability: number;
};

export interface RingDefinition {
  readonly id: RingId;
  /** Fixed finger: the same ring always sits in the same place on the hand. */
  readonly finger: RingFinger;
  readonly nameKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly price: number;
  /** Price to restore the charges of a spent ring at its machine. */
  readonly rechargePrice: number;
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
    price: 2500,
    rechargePrice: 1500,
    chargesPerPurchase: 1,
    glowColor: 0x3fd8c8,
    effect: { kind: 'resurrection', reviveFraction: 0.5, invulnerability: 2 },
  },
};
