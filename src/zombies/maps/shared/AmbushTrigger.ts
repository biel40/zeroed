/** Tuning of a proximity jumpscare. */
export interface AmbushTriggerConfig {
  /** Chance, rolled on each approach, that this approach springs the ambush. */
  readonly chance: number;
  /** Horizontal distance from a site that counts as approaching it, metres. */
  readonly radius: number;
}

export interface AmbushSite {
  readonly x: number;
  readonly z: number;
}

/**
 * Pure logic of a rare, once-per-run jumpscare at fixed sites (windows,
 * lockers...). Each time the observer walks up to the sites it rolls
 * `chance` once; a successful roll stays primed while the observer remains near, so
 * the map can retry until the mode accepts the ambush. Walking away disarms
 * the roll. Once sprung it stays spent until `reset`.
 */
export class AmbushTrigger {
  private near = false;
  private primed = false;
  private sprung = false;

  constructor(
    private readonly sites: ReadonlyArray<AmbushSite>,
    private readonly config: AmbushTriggerConfig,
    private readonly rng: () => number = Math.random,
  ) {}

  get spent(): boolean {
    return this.sprung;
  }

  /** Site the ambush should spring at this frame, or null. */
  update(observerX: number, observerZ: number): number | null {
    if (this.sprung) return null;
    const site = this.closestSiteWithinRadius(observerX, observerZ);
    const near = site !== null;
    // One roll per approach to the group, however many sites it passes.
    if (near !== this.near) {
      this.near = near;
      this.primed = near && this.rng() < this.config.chance;
    }
    return this.primed ? site : null;
  }

  /** The ambush happened: no more until the run restarts. */
  spring(): void {
    this.sprung = true;
    this.primed = false;
  }

  reset(): void {
    this.near = false;
    this.primed = false;
    this.sprung = false;
  }

  private closestSiteWithinRadius(x: number, z: number): number | null {
    let closest: number | null = null;
    let closestDistance = this.config.radius;
    for (let index = 0; index < this.sites.length; index++) {
      const distance = Math.hypot(this.sites[index].x - x, this.sites[index].z - z);
      if (distance <= closestDistance) {
        closest = index;
        closestDistance = distance;
      }
    }
    return closest;
  }
}
