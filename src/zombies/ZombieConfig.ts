/**
 * Central tuning for the Zombies mode. All functions here are pure so the
 * round scaling, damage and splash math can be unit tested without Three.js.
 *
 * Scaling philosophy (arcade progression):
 *  1. zombie COUNT grows exponentially — this is the main difficulty driver,
 *  2. spawn interval shrinks towards a floor,
 *  3. movement speed grows slightly, hard-capped,
 *  4. health follows a saturating curve (asymptote at ×4) so high rounds
 *     never become absurd bullet-sponge fests.
 */

/** Hard cap of simultaneously alive zombies. The pool is sized to this. */
export const MAX_ALIVE = 24;

export const ZOMBIE_BASE_HP = 100;
/** Walk speed in m/s at round 1. */
export const ZOMBIE_BASE_SPEED = 1.9;
export const ZOMBIE_ATTACK_DAMAGE = 12;
/** Distance at which a zombie starts its attack lunge, meters. */
export const ZOMBIE_ATTACK_RANGE = 1.9;
export const ZOMBIE_ATTACK_COOLDOWN = 1.1;
/** Zombies closer than this push each other apart (soft separation). */
export const ZOMBIE_SEPARATION_RADIUS = 1.15;

export const ROUND_BREAK_SECONDS = 4;
export const ROUND_START_DELAY = 2.5;

export const PLAYER_MAX_HP = 100;
/** Brief invulnerability window after taking a hit, seconds. */
export const PLAYER_HIT_INVULN = 0.9;

export interface RoundConfig {
  /** Total zombies spawned during the round (not simultaneously). */
  readonly zombieCount: number;
  /** Simultaneous alive cap — always MAX_ALIVE, kept here for clarity. */
  readonly maxAlive: number;
  /** Seconds between spawn ticks while the round still has pending spawns. */
  readonly spawnInterval: number;
  readonly healthMultiplier: number;
  readonly speedMultiplier: number;
}

/** Deterministic round scaling; round is 1-based and clamped to >= 1. */
export function roundConfig(round: number): RoundConfig {
  const r = Math.max(1, Math.floor(round));
  return {
    // ~6 → 9 → 12 → 19 at round 5 → ~45 at round 10, keeps growing.
    zombieCount: Math.round(6 * Math.pow(1.22, r - 1) + (r - 1) * 1.6),
    maxAlive: MAX_ALIVE,
    // 2.1 s at round 1, shrinking ~10 %/round, floored so late rounds stay fair.
    spawnInterval: Math.max(0.35, 2.1 * Math.pow(0.9, r - 1)),
    // Saturating curve: 1 → ~1.85 (R5) → ~2.6 (R10) → ~3.4 (R20) → asymptote 4.
    healthMultiplier: 1 + 3 * (1 - Math.exp(-(r - 1) / 12)),
    speedMultiplier: Math.min(1.6, 1 + 0.035 * (r - 1)),
  };
}

export type ZombieHitPart = 'head' | 'torso';

/** Damage dealt by a bullet hitting the given part. */
export function computeDamage(
  baseDamage: number,
  part: ZombieHitPart,
  headshotMultiplier: number,
): number {
  return part === 'head' ? baseDamage * headshotMultiplier : baseDamage;
}

/**
 * Ray Gun splash: full damage at the epicenter, linear falloff to zero at
 * the radius edge. Returns 0 outside the radius.
 */
export function splashDamageAt(
  splashDamage: number,
  distance: number,
  radius: number,
): number {
  if (distance >= radius) return 0;
  if (distance <= 0) return splashDamage;
  return splashDamage * (1 - distance / radius);
}
