import type { RingJingleId } from '../../audio/RingJingleTunes';
import type { TranslationKey } from '../../i18n/i18n';

/** One hand, one ring per finger: the five slots a run can fill. */
export const RING_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type RingFinger = (typeof RING_FINGERS)[number];

export type RingId = 'resurrection' | 'sleightOfHand' | 'armor' | 'doubleTap';

/**
 * What a ring does, as data. Each kind has one hook in the mode that reads
 * its parameters; a new ring adds its kind here and its hook there.
 */
export type RingEffect =
  | {
    readonly kind: 'resurrection';
    /** Share of max HP restored instead of dying. */
    readonly reviveFraction: number;
    /** Seconds spent getting back up: the player can look around but not move or fight. */
    readonly getUp: number;
    /**
     * Seconds after standing back up during which zombies can neither hurt nor
     * see the player (they are protected while getting up too). The screen
     * stays tinted blue for the whole protected time.
     */
    readonly protection: number;
  }
  | {
    /** Passive while worn: every reload of every weapon takes a share of its time. */
    readonly kind: 'reloadSpeed';
    /** Multiplier on reload durations (0.5 = twice as fast). */
    readonly reloadTimeScale: number;
  }
  | {
    /** Passive while worn: the player's maximum health is multiplied. */
    readonly kind: 'maxHealth';
    /** Multiplier on max HP (2 = twice the health). */
    readonly maxHpScale: number;
  }
  | {
    /** Passive while worn: faster fire and stronger weapon damage. */
    readonly kind: 'firePower';
    readonly fireRateScale: number;
    readonly damageScale: number;
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
   * A passive ring never spends its charge, so only its first price applies.
   */
  readonly prices: readonly number[];
  readonly chargesPerPurchase: number;
  /** Enamel colour shared by the worn ring, its locker and the HUD. */
  readonly glowColor: number;
  /** Tune its machine plays around it, like a perk jingle. */
  readonly jingle: RingJingleId;
  readonly effect: RingEffect;
}

/**
 * Ring catalog. Rings are Zeroed's perks: wedding bands the evacuees left
 * in the station's lockers. Prices follow the mansion economy.
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
    jingle: 'musicBox',
    effect: { kind: 'resurrection', reviveFraction: 0.5, getUp: 1.2, protection: 2.5 },
  },
  sleightOfHand: {
    id: 'sleightOfHand',
    finger: 'pinky',
    nameKey: 'ring.sleightOfHand',
    descriptionKey: 'ring.sleightOfHand.description',
    // Passive and bought once a run, at the price of a fast-reload perk machine.
    prices: [3500],
    chargesPerPurchase: 1,
    glowColor: 0x4fe08a,
    jingle: 'conjurer',
    effect: { kind: 'reloadSpeed', reloadTimeScale: 0.5 },
  },
  armor: {
    id: 'armor',
    finger: 'middle',
    nameKey: 'ring.armor',
    descriptionKey: 'ring.armor.description',
    // Passive and bought once a run, at the price of a health perk machine.
    prices: [2500],
    chargesPerPurchase: 1,
    // Red by the user's choice.
    glowColor: 0xe0283a,
    jingle: 'march',
    effect: { kind: 'maxHealth', maxHpScale: 2 },
  },
  doubleTap: {
    id: 'doubleTap',
    finger: 'index',
    nameKey: 'ring.doubleTap',
    descriptionKey: 'ring.doubleTap.description',
    prices: [3000],
    chargesPerPurchase: 1,
    glowColor: 0xffd43b,
    jingle: 'doubleTime',
    effect: { kind: 'firePower', fireRateScale: 2, damageScale: 1.2 },
  },
};
