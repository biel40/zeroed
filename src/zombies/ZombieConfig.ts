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
/**
 * Damage per landed attack. 25 HP means four clean hits kill a full-health
 * player: reaching the player must be genuinely dangerous.
 */
export const ZOMBIE_ATTACK_DAMAGE = 25;
/** Distance at which a zombie starts its attack lunge, meters. */
export const ZOMBIE_ATTACK_RANGE = 1.9;
/** Seconds between the end of one attack and the next wind-up. */
export const ZOMBIE_ATTACK_RECOVERY = 0.7;
/** Zombies closer than this push each other apart (soft separation). */
export const ZOMBIE_SEPARATION_RADIUS = 1.15;

// --- Zombie state timings (seconds) ---
/** Rise-from-the-ground spawn sequence. */
export const ZOMBIE_SPAWN_DURATION = 1.1;
/** Full attack lunge; the damage lands at the hit moment below. */
export const ZOMBIE_ATTACK_DURATION = 0.9;
/** Wind-up before the blow connects — the player's dodge window. */
export const ZOMBIE_ATTACK_HIT_MOMENT = 0.45;
/** Brief stagger on non-lethal hits; movement resumes right after. */
export const ZOMBIE_HIT_DURATION = 0.28;
/** Headshot stagger lasts longer: precision should feel impactful. */
export const ZOMBIE_HIT_HEADSHOT_FACTOR = 1.6;
/** Death fall, corpse linger and fade-out before the body is recycled. */
export const ZOMBIE_DEATH_FALL = 1.0;
export const ZOMBIE_CORPSE_LINGER = 1.6;
export const ZOMBIE_DEATH_FADE = 0.8;

// --- Per-zombie visual/behavior variation (fractions, applied at spawn) ---
export const ZOMBIE_SPEED_JITTER = 0.08;
export const ZOMBIE_SCALE_JITTER = 0.05;
export const ZOMBIE_WALK_JITTER = 0.07;

export const ROUND_BREAK_SECONDS = 4;
export const ROUND_START_DELAY = 2.5;

/**
 * Kills that auto-unlock the Ray Gun. 115 — the Element 115 nod — is high
 * enough to be an earned mid-run milestone, reachable around rounds 8-10.
 */
export const RAYGUN_UNLOCK_KILLS = 115;

export const PLAYER_MAX_HP = 100;
/**
 * Brief invulnerability window after taking a hit, seconds. Long enough to
 * prevent a surrounding horde from deleting the player in a single frame,
 * short enough that being surrounded is still deadly.
 */
export const PLAYER_HIT_INVULN = 0.45;
/**
 * Seconds without taking damage before regeneration kicks in. Longer than
 * the full zombie attack cycle (~1.6 s), so regen never starts mid-brawl.
 */
export const PLAYER_REGEN_DELAY = 4;
/** HP regenerated per second once the delay elapses: 0 → 100 in 5 s. */
export const PLAYER_REGEN_RATE = 20;

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
