/** Confirmation strength of one hitmarker: a plain hit, a headshot, a kill, or a lethal headshot. */
export interface HitmarkerHit {
  readonly headshot: boolean;
  readonly lethal: boolean;
}

/**
 * Hits closer together than this (seconds) merge into one marker: a
 * 1200 rpm burst, a piercing round or a grenade chain shows a steady pop
 * instead of restarting the animation (and forcing a layout) on every hit.
 */
export const HITMARKER_MERGE_WINDOW = 0.05;

/**
 * Decides when the hitmarker animation restarts. Inside the merge window
 * only a stronger confirmation (headshot over hit, kill over headshot)
 * replaces the one on screen, so a kill is never hidden by the hit that
 * came a frame before it.
 */
export class HitmarkerThrottle {
  private lastShownAt = Number.NEGATIVE_INFINITY;
  private lastPriority = -1;

  /** True when the marker must (re)start for `hit` at `now` seconds. */
  public accept(hit: HitmarkerHit, now: number): boolean {
    const priority = HitmarkerThrottle.priority(hit);
    if (now - this.lastShownAt < HITMARKER_MERGE_WINDOW && priority <= this.lastPriority) return false;
    this.lastShownAt = now;
    this.lastPriority = priority;
    return true;
  }

  private static priority(hit: HitmarkerHit): number {
    return (hit.lethal ? 2 : 0) + (hit.headshot ? 1 : 0);
  }
}
