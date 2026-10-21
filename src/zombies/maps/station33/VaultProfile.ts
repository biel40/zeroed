import { VESTIBULE } from '../Station33Config';

/** Shallow segmental barrel vault spanning the hall across X, springing from the side walls. */
const HALF_SPAN = (VESTIBULE.maxX - VESTIBULE.minX) / 2;
const RISE = VESTIBULE.vaultApexY - VESTIBULE.wallHeight;

/** Radius of the circle through both spring points and the apex. */
export const VAULT_RADIUS = (HALF_SPAN * HALF_SPAN + RISE * RISE) / (2 * RISE);
/** Height of that circle's centre (far below the floor for a shallow vault). */
export const VAULT_CENTER_Y = VESTIBULE.vaultApexY - VAULT_RADIUS;
/** Half the angle the vault spans, measured from the vertical. */
export const VAULT_HALF_ANGLE = Math.asin(HALF_SPAN / VAULT_RADIUS);

/** Underside of the vault at a given x (spring line outside the span). */
export function vaultHeightAt(x: number): number {
  if (Math.abs(x) >= HALF_SPAN) return VESTIBULE.wallHeight;
  return VAULT_CENTER_Y + Math.sqrt(VAULT_RADIUS * VAULT_RADIUS - x * x);
}
