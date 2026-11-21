import type { WindConeGustConfig, WindWeaponConfig } from '../weapons/WeaponTypes';

/**
 * One wind shot as loosed: its config's values scaled by the charge it was
 * drawn to. Pooled by the caller and rewritten per shot.
 */
export interface WindShotStats {
  /** 0 for a quick shot .. 1 for a full draw. */
  charge: number;
  /** Multiplier on the weapon's direct damage. */
  damageScale: number;
  projectileSpeed: number;
  burstRadius: number;
  burstDamage: number;
  maxTargets: number;
  pushDistance: number;
  edgePush: number;
  pushSeconds: number;
  /** Strength of every effect of the shot (the config look's, scaled). */
  intensity: number;
  /** The full-draw gust behind a body struck; null below a full draw. */
  gust: WindConeGustConfig | null;
}

export function createWindShotStats(): WindShotStats {
  return {
    charge: 0, damageScale: 1, projectileSpeed: 0, burstRadius: 0, burstDamage: 0, maxTargets: 0,
    pushDistance: 0, edgePush: 0, pushSeconds: 0, intensity: 1, gust: null,
  };
}

/**
 * Writes into `out` (and returns it) the shot `config` looses at `charge`,
 * clamped to 0..1: every value goes linearly from the config's own at 0 to
 * the config's times its `charged` multiplier at 1; the gust needs a full draw.
 */
export function resolveWindShot(config: WindWeaponConfig, charge: number, out: WindShotStats): WindShotStats {
  const c = Math.min(1, Math.max(0, charge));
  const full = config.charged;
  out.charge = c;
  out.damageScale = scaled(1, full.damage, c);
  out.projectileSpeed = scaled(config.projectileSpeed, full.projectileSpeed, c);
  out.burstRadius = scaled(config.burstRadius, full.burstRadius, c);
  out.burstDamage = scaled(config.burstDamage, full.burstDamage, c);
  out.maxTargets = Math.round(scaled(config.maxTargets, full.maxTargets, c));
  out.pushDistance = scaled(config.pushDistance, full.pushDistance, c);
  out.edgePush = config.edgePush;
  out.pushSeconds = scaled(config.pushSeconds, full.pushSeconds, c);
  out.intensity = scaled(config.look.intensity, full.intensity, c);
  out.gust = c >= 1 ? full.gust : null;
  return out;
}

/** `base` times `multiplier` at a full charge, linearly from `base` at none. */
function scaled(base: number, multiplier: number, charge: number): number {
  return base * (1 + (multiplier - 1) * charge);
}
