import type { MuzzleFlareConfig } from '../weapons/WeaponTypes';

/**
 * Gunpowder flames of the top quality tier, by cartridge rather than by
 * weapon: a weapon picks the one its round burns like. Sizes are view-model
 * metres ahead of the crown; brightness is linear HDR, where the bloom
 * starts at 0.8, so only the very core glows.
 */
export const MUZZLE_FLARES = {
  /** .45 ACP from a short slide: a compact puff. */
  pistol: { length: 0.09, width: 0.05, burst: 0.045, tongues: 3, duration: 0.045, brightness: 1.5, light: 4 },
  /** Pistol rounds from a carbine barrel (MP5, Vector, PPSh-41). */
  smg: { length: 0.12, width: 0.055, burst: 0.05, tongues: 3, duration: 0.045, brightness: 1.6, light: 4.5 },
  /** Intermediate rifle rounds (M4A1, AK-47): a sharp, directional flame. */
  carbine: { length: 0.17, width: 0.07, burst: 0.06, tongues: 4, duration: 0.05, brightness: 1.8, light: 6 },
  /** Full-power rifle rounds (M14, M60). */
  rifle: { length: 0.23, width: 0.085, burst: 0.075, tongues: 4, duration: 0.06, brightness: 1.9, light: 8 },
  /** Magnum bolt action (L96): a long, pronounced flame. */
  sniper: { length: 0.3, width: 0.1, burst: 0.085, tongues: 5, duration: 0.07, brightness: 2, light: 10 },
  /** .50 BMG through a muzzle brake (Barrett): the brake throws most of the flame sideways. */
  antiMateriel: {
    length: 0.36, width: 0.12, burst: 0.11, tongues: 5, duration: 0.08, brightness: 2.2, light: 16,
    vents: { offset: 0.03, length: 0.3, spread: 0.07, behind: 0.06 },
  },
} as const satisfies Readonly<Record<string, MuzzleFlareConfig>>;
