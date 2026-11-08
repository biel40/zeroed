import type { TranslationKey } from '../i18n/i18n';

/** Lethal grenades the player can carry. */
export type LethalGrenadeId = 'f1';

/** How the grenade leaves the hand and moves until it rests. */
export interface GrenadeFlightConfig {
  /** Launch speed along the aim, m/s. */
  readonly throwSpeed: number;
  /** Radians the throw is lifted above the aim, so a level throw arcs. */
  readonly throwLift: number;
  readonly gravity: number;
  /** Collision radius of the body, metres. */
  readonly radius: number;
  /** Share of the normal speed kept by a bounce (floor, wall or furniture). */
  readonly bounce: number;
  /** Share of the tangential speed kept by a bounce. */
  readonly friction: number;
  /** Exponential slowdown per second while it rolls on a surface. */
  readonly rollDrag: number;
}

/**
 * The explosion. Damage falls off linearly from `damage` at the centre to
 * `damage * edgeDamageShare` at `radius`; nothing past it is touched.
 * Distances are horizontal, like every splash of the mode.
 */
export interface GrenadeBlastConfig {
  readonly radius: number;
  readonly damage: number;
  readonly edgeDamageShare: number;
  /** A lethal blast this close blows the body apart instead of throwing it down. */
  readonly gibRadius: number;
  /** A survivor this close may lose its legs and crawl (`crippleChance` per body). */
  readonly crippleRadius: number;
  readonly crippleChance: number;
  /** Damage to the thrower at the centre, falling to zero at `selfRadius`. */
  readonly selfDamage: number;
  readonly selfRadius: number;
  /** A blast this close to its thrower kills outright: cooked in the hand or a direct hit. */
  readonly selfLethalRadius: number;
  /**
   * Damage to a boss (the guardian) at the centre, with the same falloff;
   * the blast wraps around its shield, so it is never blocked.
   */
  readonly guardianDamage: number;
  /** Camera trauma (0..1) at the centre, fading to zero at `shakeRadius`. */
  readonly shake: number;
  readonly shakeRadius: number;
  /** Zombies further above or below the centre than this are on another floor. */
  readonly verticalReach: number;
}

/** Sounds of the grenade; every sample is optional and falls back to the procedural sound. */
export interface GrenadeAudioConfig {
  /**
   * MP3 in `public/assets/audio/` that replaces the procedural explosion.
   * Drop a file with this name there to use a custom blast.
   */
  readonly explosionSampleFile?: string;
  /** Gain of the explosion, 0..1, before distance attenuation. */
  readonly explosionVolume: number;
}

export interface GrenadeDefinition {
  readonly id: LethalGrenadeId;
  readonly nameKey: TranslationKey;
  /** Seconds from pulling the pin to the blast; holding the grenade cooks part of it away. */
  readonly fuseSeconds: number;
  readonly flight: GrenadeFlightConfig;
  readonly blast: GrenadeBlastConfig;
  readonly audio: GrenadeAudioConfig;
}

/** How many grenades a run hands out: the start, the refill each new round and the carry cap. */
export interface LethalGrenadeLoadout {
  readonly starting: number;
  readonly perRound: number;
  readonly max: number;
}

export const GRENADE_DEFINITIONS: Readonly<Record<LethalGrenadeId, GrenadeDefinition>> = {
  // Soviet F-1 "limonka": a segmented cast-iron body under the UZRGM fuse.
  f1: {
    id: 'f1',
    nameKey: 'grenade.f1',
    fuseSeconds: 3.6,
    flight: {
      throwSpeed: 15,
      throwLift: 0.16,
      gravity: 9.81,
      radius: 0.03,
      bounce: 0.34,
      friction: 0.72,
      rollDrag: 2.4,
    },
    blast: {
      radius: 5.5,
      damage: 320,
      edgeDamageShare: 0.35,
      gibRadius: 1.6,
      crippleRadius: 4.5,
      crippleChance: 0.4,
      selfDamage: 60,
      selfRadius: 4,
      selfLethalRadius: 0.9,
      guardianDamage: 1500,
      shake: 0.9,
      shakeRadius: 14,
      verticalReach: 2.2,
    },
    audio: {
      explosionSampleFile: 'f1_explosion.mp3',
      explosionVolume: 1,
    },
  },
};

/** The lethal every Zombies run starts with. */
export const STARTING_LETHAL_GRENADE: LethalGrenadeId = 'f1';

/** As in the classic rounds: two to start, two more every new round, four at most. */
export const LETHAL_GRENADE_LOADOUT: LethalGrenadeLoadout = { starting: 2, perRound: 2, max: 4 };
