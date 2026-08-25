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

import { HEADSHOT_DAMAGE_MULTIPLIER } from '../game/CombatConfig';

/** Hard cap of simultaneously alive zombies. The pool is sized to this. */
export const MAX_ALIVE = 24;

export const ZOMBIE_BASE_HP = 100;
/** Walk speed in m/s at round 1. */
export const ZOMBIE_BASE_SPEED = 1.9;
/** Damage per landed attack. Three clean hits kill a full-health player. */
export const ZOMBIE_ATTACK_DAMAGE = 25;
/** Normal-zombie recovery; 0.75 s attack + 0.3375 s recovery is 25% below 1.45 s. */
export const ZOMBIE_ATTACK_RECOVERY = 0.3375;
/** Preserve the established attack cadence of special zombies. */
export const ZOMBIE_SPECIAL_ATTACK_RECOVERY = 0.7;
export const SHINY_ZOMBIE_CHANCE = 0.005;
export const MAX_ACTIVE_BRUTES = 2;

export type ZombieTypeId = 'normal' | 'shiny' | 'brute';
export type ZombieModelId = 'walker' | 'brute';
export type ZombieMaterialTreatment = 'base' | 'shiny';

export interface ZombieTypeConfig {
  readonly modelId: ZombieModelId;
  readonly materialTreatment: ZombieMaterialTreatment;
  readonly healthMultiplier: number;
  readonly speedMultiplier: number;
  readonly damageMultiplier: number;
  readonly attackRecovery: number;
  readonly bodyScale: readonly [number, number, number];
  readonly hitboxScale: readonly [number, number, number];
  readonly bodyRadius: number;
  readonly walkAnimationMultiplier: number;
  readonly spawnChance?: (round: number) => number;
  readonly maxActive?: number;
}

/** Physical visual reserves per asset; the population still has one global cap. */
export const ZOMBIE_MODEL_POOL_CAPACITIES: Readonly<Record<ZombieModelId, number>> = {
  walker: MAX_ALIVE,
  brute: MAX_ACTIVE_BRUTES,
};

/** Add a type here, then place non-default selection order in ZOMBIE_SPAWN_ORDER. */
export const ZOMBIE_TYPE_CONFIGS: Readonly<Record<ZombieTypeId, ZombieTypeConfig>> = {
  normal: {
    modelId: 'walker',
    materialTreatment: 'base',
    healthMultiplier: 1,
    speedMultiplier: 1,
    damageMultiplier: 1,
    attackRecovery: ZOMBIE_ATTACK_RECOVERY,
    bodyScale: [1, 1, 1],
    hitboxScale: [1, 1, 1],
    bodyRadius: 0.42,
    walkAnimationMultiplier: 1,
  },
  shiny: {
    modelId: 'walker',
    materialTreatment: 'shiny',
    healthMultiplier: 1,
    speedMultiplier: 1,
    damageMultiplier: 1,
    attackRecovery: ZOMBIE_SPECIAL_ATTACK_RECOVERY,
    bodyScale: [1, 1, 1],
    hitboxScale: [1, 1, 1],
    bodyRadius: 0.42,
    walkAnimationMultiplier: 1,
    spawnChance: () => SHINY_ZOMBIE_CHANCE,
  },
  brute: {
    modelId: 'brute',
    materialTreatment: 'base',
    healthMultiplier: 3,
    speedMultiplier: 0.72,
    damageMultiplier: 1.15,
    attackRecovery: ZOMBIE_SPECIAL_ATTACK_RECOVERY,
    bodyScale: [1, 1, 1],
    hitboxScale: [1.35, 1.15, 1.18],
    // Kept conservative so mansion doors and stairs remain navigable.
    bodyRadius: 0.46,
    walkAnimationMultiplier: 1,
    spawnChance: getBruteSpawnChance,
    maxActive: MAX_ACTIVE_BRUTES,
  },
};

/** Earlier entries roll first; normal is the fallback and never appears here. */
export const ZOMBIE_SPAWN_ORDER: readonly ZombieTypeId[] = ['brute', 'shiny'];

/** Chance that an eligible spawn is replaced by a Brute, by round band. */
export function getBruteSpawnChance(round: number): number {
  const r = Math.max(1, Math.floor(round));
  if (r < 5) return 0;
  if (r < 10) return 0.08;
  if (r < 15) return 0.15;
  if (r < 20) return 0.22;
  return 0.3;
}

/** Rolls registered special types in priority order, then falls back to normal. */
export function selectZombieType(
  round: number,
  activeCounts: Readonly<Partial<Record<ZombieTypeId, number>>>,
  rng: () => number = Math.random,
): ZombieTypeId {
  for (const typeId of ZOMBIE_SPAWN_ORDER) {
    const config = ZOMBIE_TYPE_CONFIGS[typeId];
    if (config.maxActive !== undefined && (activeCounts[typeId] ?? 0) >= config.maxActive) continue;
    const chance = config.spawnChance?.(round) ?? 0;
    if (chance > 0 && rng() < chance) return typeId;
  }
  return 'normal';
}
/** Distance at which a zombie starts its attack lunge, meters. */
export const ZOMBIE_ATTACK_RANGE = 1.9;
/** Damage per attack against a window board. */
export const ZOMBIE_BARRIER_ATTACK_DAMAGE = 50;
/** Distance at which a zombie starts attacking a barrier board. */
export const ZOMBIE_BARRIER_ATTACK_RANGE = 1.2;
/** Slightly longer recovery between board hits: ~2 s per five-board window. */
export const ZOMBIE_BARRIER_ATTACK_RECOVERY = 0.92;
/** Zombies closer than this push each other apart (soft separation). */
export const ZOMBIE_SEPARATION_RADIUS = 1.15;

// --- Zombie state timings (seconds) ---
/** Rise-from-the-ground spawn sequence. */
export const ZOMBIE_SPAWN_DURATION = 1.1;
/** Full attack lunge; the damage lands at the hit moment below. */
export const ZOMBIE_ATTACK_DURATION = 0.75;
/**
 * Wind-up before the blow connects — the player's dodge window. 0.475 s is
 * still ~63 % of the attack: the ZombieBite clip (played from 30 % at 3.0×,
 * up from 2.5×, over the 5.04 s take) now reaches the same head-extension
 * peak sooner in real time, so the hit still fires exactly when the bite
 * visually reaches the player — just quicker, giving the player less time
 * to back out of range.
 */
export const ZOMBIE_ATTACK_HIT_MOMENT = 0.475;
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

export const ROUND_BREAK_SECONDS = 6;
export const ROUND_START_DELAY = 2.5;

/**
 * Finite reserve ammunition per weapon in Zombies mode (generous tier).
 * The mode table wins over the WeaponDefinition (see reserveAmmoFor), so
 * the M1911 starts a run with 72 rounds total: 8 in the mag + 64 here.
 * The Tesla (5/25) is not listed and keeps its definition value. These
 * overrides keep every Zombies weapon on a finite reserve.
 */
export const ZOMBIES_RESERVE_AMMO: Readonly<Record<string, number>> = {
  m1911: 64,
  m4a1: 300,
  ak47: 300,
  m60: 500,
  l96: 60,
  raygun: 160,
};

/**
 * Kills that auto-unlock the Ray Gun. Element 115 is the sole weapon milestone;
 * ZEUS-77 is instead a legendary Mystery Box pull.
 */
export const RAYGUN_UNLOCK_KILLS = 115;

/**
 * Maximum zombies one Tesla shot can electrocute, impact included. 20 out of
 * MAX_ALIVE (24) means a bullseye on a packed horde deletes most of it: the
 * ZEUS-77 is the capstone Wonder Weapon and must feel clearly above the
 * Ray Gun. The visual arc pool in ChainLightning derives from this value.
 */
export const CHAIN_MAX_TARGETS = 20;
/**
 * Maximum hop distance between two zombies in the same chain, meters. 9 m
 * lets the arc walk through a whole horde without cutting early, while the
 * per-hop radius still stops it from crossing the map to a far straggler.
 */
export const CHAIN_RADIUS = 9;
/**
 * Damage per electrocuted zombie. Far above a walker's saturated HP (~4x
 * base): the Tesla is a horde DELETE button with scarce ammunition, not a
 * DPS tool.
 */
export const CHAIN_ZAP_DAMAGE = 750;

/** Minimal zombie snapshot the chain selection needs (keeps it Three-free). */
export interface ChainCandidate {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly alive: boolean;
}

/**
 * Picks the zombies electrocuted by one Tesla shot, in arc order. The
 * directly-hit zombie is always first; each hop jumps to the NEAREST living
 * candidate within CHAIN_RADIUS of the current tip that has not been struck
 * yet — so a zombie can never be hit twice in the same chain, and the arc
 * stops instead of wasting a hop on a far straggler. Returns at most
 * CHAIN_MAX_TARGETS ids. O(targets x candidates) squared-distance checks on
 * plain data: with MAX_ALIVE candidates this stays trivial even on mobile.
 * Pure: unit-tested without a scene.
 */
export function selectChainTargets(
  impact: ChainCandidate,
  candidates: readonly ChainCandidate[],
): number[] {
  const chain: number[] = [impact.id];
  const visited = new Set<number>([impact.id]);
  let tip = impact;

  while (chain.length < CHAIN_MAX_TARGETS) {
    let nearest: ChainCandidate | null = null;
    let nearestDistSq = CHAIN_RADIUS * CHAIN_RADIUS;
    for (const c of candidates) {
      if (!c.alive || visited.has(c.id)) continue;
      const dx = c.x - tip.x;
      const dz = c.z - tip.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = c;
      }
    }
    if (!nearest) break;
    visited.add(nearest.id);
    chain.push(nearest.id);
    tip = nearest;
  }
  return chain;
}

export const PLAYER_MAX_HP = ZOMBIE_ATTACK_DAMAGE * 3;
/**
 * Brief invulnerability window after taking a hit, seconds. Long enough to
 * prevent a surrounding horde from deleting the player in a single frame,
 * short enough that being surrounded is still deadly.
 */
export const PLAYER_HIT_INVULN = 0.45;
/**
 * Seconds without taking damage before regeneration kicks in. Longer than
 * the full normal-zombie attack cycle (~1.09 s), so regen never starts mid-brawl.
 */
export const PLAYER_REGEN_DELAY = 2.8;
/** HP regenerated per second once the delay elapses: 0 -> max HP in 3.75 s. */
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
    speedMultiplier: Math.min(1.8, 1 + 0.05 * (r - 1)),
  };
}

export type ZombieHitPart = 'head' | 'torso';

/** Damage dealt by a bullet hitting the given part. */
export function computeDamage(
  baseDamage: number,
  part: ZombieHitPart,
): number {
  return part === 'head' ? baseDamage * HEADSHOT_DAMAGE_MULTIPLIER : baseDamage;
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
