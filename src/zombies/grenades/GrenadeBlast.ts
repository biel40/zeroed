import type { GrenadeBlastConfig } from '../../config/grenades';

/** What the blast does to one zombie standing `distance` metres (horizontal) from the centre. */
export interface BlastOutcome {
  /** Health removed; 0 outside the radius. */
  readonly damage: number;
  /** A lethal blast blows the body apart. */
  readonly gib: boolean;
  /** A survivor loses its legs and crawls on. */
  readonly cripple: boolean;
}

const NO_EFFECT: BlastOutcome = { damage: 0, gib: false, cripple: false };

/** Linear falloff from the centre to `edgeDamageShare` at the radius; 0 outside it. */
export function blastDamageAt(blast: GrenadeBlastConfig, distance: number): number {
  if (distance >= blast.radius) return 0;
  const t = Math.max(0, distance) / blast.radius;
  return blast.damage * (1 - t * (1 - blast.edgeDamageShare));
}

/** Damage to a boss whose body edge is `distance` metres away: `guardianDamage` with the zombies' falloff. */
export function guardianBlastDamage(blast: GrenadeBlastConfig, distance: number): number {
  return blastDamageAt(blast, distance) / blast.damage * blast.guardianDamage;
}

/** Past any health the Armour ring can give, yet a finite number the co-op wire accepts. */
const FATAL_SELF_DAMAGE = 1_000_000;

/** The thrower's own damage: fatal point blank, then falling off to nothing at `selfRadius`. */
export function selfBlastDamage(blast: GrenadeBlastConfig, distance: number): number {
  if (distance <= blast.selfLethalRadius) return FATAL_SELF_DAMAGE;
  if (distance >= blast.selfRadius) return 0;
  return blast.selfDamage * (1 - Math.max(0, distance) / blast.selfRadius);
}

/** Camera trauma a blast at `distance` metres adds; quadratic so only close blasts really rattle. */
export function blastTrauma(blast: GrenadeBlastConfig, distance: number): number {
  if (distance >= blast.shakeRadius) return 0;
  const t = 1 - Math.max(0, distance) / blast.shakeRadius;
  return blast.shake * t * t;
}

/**
 * Resolves the blast on one zombie. `damageScale` carries perks and
 * developer tuning; `remainingHp` decides lethality;
 * `canCripple` is false for bodies that never crawl (brutes, crawlers
 * already). `rng` is only drawn for a survivor inside the cripple radius,
 * so the roll is deterministic under an injected source.
 */
export function resolveBlastOutcome(
  blast: GrenadeBlastConfig,
  distance: number,
  damageScale: number,
  remainingHp: number,
  canCripple: boolean,
  rng: () => number,
): BlastOutcome {
  const damage = blastDamageAt(blast, distance) * damageScale;
  if (damage <= 0) return NO_EFFECT;
  if (damage >= remainingHp) return { damage, gib: distance <= blast.gibRadius, cripple: false };
  const cripple = canCripple && distance <= blast.crippleRadius && rng() < blast.crippleChance;
  return { damage, gib: false, cripple };
}
