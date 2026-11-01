import { HEADSHOT_POINTS } from '../game/CombatConfig';
import { POINTS_KILL } from '../game/PlayerEconomy';

/** How loud a points popup is: hits and repairs, kills, headshots and bigger rewards. */
export type PointsGainTier = 'minor' | 'kill' | 'major';

export function pointsGainTier(amount: number): PointsGainTier {
  if (amount >= HEADSHOT_POINTS) return 'major';
  return amount >= POINTS_KILL ? 'kill' : 'minor';
}

/**
 * Turns the HUD's balance readings into rewards: only a rise counts, so
 * spending and restarts never pop. Reading the balance instead of hooking
 * every award keeps solo, host and guest (snapshot points) on one path.
 */
export class PointsGainTracker {
  private baseline: number | null = null;

  /** Points gained since the previous reading (0 for the first one or a drop). */
  public observe(points: number): number {
    const gain = this.baseline === null ? 0 : Math.max(0, points - this.baseline);
    this.baseline = points;
    return gain;
  }

  public reset(): void {
    this.baseline = null;
  }
}
