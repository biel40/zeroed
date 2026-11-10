/**
 * Cosmetic scale of bullet impacts on zombies. Everything here derives from
 * the weapon's base damage so new weapons need no extra data; none of it
 * feeds back into damage, hitboxes or projectile counts.
 */

/** Visible entry wounds per zombie; the oldest is reused past this. */
export const ZOMBIE_WOUND_LIMIT = 4;

/** Damage of the lightest (0) and heaviest (1) cosmetic impact. */
const LIGHT_IMPACT_DAMAGE = 15;
const HEAVY_IMPACT_DAMAGE = 1000;
/**
 * Half-size (m) of the wound decal for the lightest and heaviest impact. The
 * decal holds the hole, its torn rim and the blood running below it; the
 * hole itself is about a third of it. Sized to read from mid range (a few
 * pixels at 8 m would be invisible on a dark body).
 */
const MIN_WOUND_RADIUS = 0.035;
const MAX_WOUND_RADIUS = 0.06;

/** 0 for a light SMG round, 1 for a sniper or anti-materiel round, logarithmic in between. */
export function bulletImpactWeight(damage: number): number {
  if (!(damage > LIGHT_IMPACT_DAMAGE)) return 0;
  return Math.min(1, Math.log(damage / LIGHT_IMPACT_DAMAGE) / Math.log(HEAVY_IMPACT_DAMAGE / LIGHT_IMPACT_DAMAGE));
}

/** Radius (m) of the entry wound a round of `damage` leaves. */
export function bulletWoundRadius(damage: number): number {
  return MIN_WOUND_RADIUS + (MAX_WOUND_RADIUS - MIN_WOUND_RADIUS) * bulletImpactWeight(damage);
}
