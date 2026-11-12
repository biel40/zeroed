import type { MuzzleFlareConfig } from '../weapons/WeaponTypes';

/**
 * Gunpowder flames of the top quality tier, by cartridge rather than by
 * weapon: a weapon picks the one its round burns like. Sizes are view-model
 * metres ahead of the crown; brightness is linear HDR, with only the hot
 * core intended to cross the bloom threshold.
 */
export const MUZZLE_FLARES = {
  /** .45 ACP from a short slide: a compact puff. */
  pistol: { length: 0.085, width: 0.04, burst: 0.028, tongues: 3, duration: 0.032, brightness: 1.6, light: 3 },
  /** Pistol rounds from a carbine barrel (MP5, Vector, PPSh-41). */
  smg: { length: 0.11, width: 0.045, burst: 0.03, tongues: 3, duration: 0.035, brightness: 1.7, light: 3.6 },
  /** Intermediate rifle rounds (M4A1, AK-47): a sharp, directional flame. */
  carbine: { length: 0.16, width: 0.06, burst: 0.038, tongues: 4, duration: 0.04, brightness: 1.8, light: 5 },
  /** Full-power rifle rounds (M14, M60). */
  rifle: { length: 0.21, width: 0.075, burst: 0.045, tongues: 4, duration: 0.045, brightness: 1.9, light: 6.5 },
  /** Magnum bolt action (L96): a long, pronounced flame. */
  sniper: { length: 0.28, width: 0.09, burst: 0.052, tongues: 5, duration: 0.05, brightness: 2, light: 8 },
  /** .50 BMG through a muzzle brake (Barrett): the brake throws most of the flame sideways. */
  antiMateriel: {
    length: 0.34, width: 0.11, burst: 0.066, tongues: 5, duration: 0.06, brightness: 2.2, light: 12,
    vents: { offset: 0.03, length: 0.3, spread: 0.07, behind: 0.06 },
  },
} as const satisfies Readonly<Record<string, MuzzleFlareConfig>>;
