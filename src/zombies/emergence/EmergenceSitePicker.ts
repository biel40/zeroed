import type { ZombieEmergenceSite, ZombieEmergenceTuning } from './ZombieEmergence';

/**
 * Decides which walker spawns rise out of a map's emergence sites instead:
 * only spawns on a site's floor, from its first round, by chance, from a
 * site that is resting no more, far enough from the player and whose exit
 * the caller finds clear. Rolls its random source only when some site could
 * take the spawn, so maps without sites draw exactly as before.
 */
export class EmergenceSitePicker {
  private sites: ReadonlyArray<ZombieEmergenceSite> = [];
  private tuning: ZombieEmergenceTuning | null = null;
  /** When each used site wakes again, on this picker's own clock. */
  private readonly restingUntil = new Map<string, number>();
  private clock = 0;

  public constructor(private readonly rng: () => number) {}

  public get active(): ZombieEmergenceTuning | null {
    return this.sites.length > 0 ? this.tuning : null;
  }

  /** The sites currently awake (a map unlocks them with its zones); resting ones keep resting. */
  public setSites(sites: ReadonlyArray<ZombieEmergenceSite>, tuning: ZombieEmergenceTuning | null): void {
    this.sites = tuning ? sites : [];
    this.tuning = tuning;
  }

  public update(dt: number): void {
    this.clock += dt;
  }

  /** Site a walker spawning on `floor` rises from instead, or null; the chosen site starts resting. */
  public pick(
    floor: number,
    round: number,
    playerX: number,
    playerZ: number,
    exitClear: (site: ZombieEmergenceSite) => boolean,
  ): ZombieEmergenceSite | null {
    const tuning = this.tuning;
    if (!tuning || round < tuning.minRound) return null;
    let candidates = 0;
    for (const site of this.sites) {
      if (this.available(site, floor, playerX, playerZ, tuning, exitClear)) candidates++;
    }
    if (candidates === 0 || this.rng() >= tuning.chance) return null;
    let remaining = Math.floor(this.rng() * candidates);
    for (const site of this.sites) {
      if (!this.available(site, floor, playerX, playerZ, tuning, exitClear)) continue;
      if (remaining-- > 0) continue;
      this.restingUntil.set(site.id, this.clock + tuning.cooldown);
      return site;
    }
    return null;
  }

  public reset(): void {
    this.restingUntil.clear();
  }

  private available(
    site: ZombieEmergenceSite,
    floor: number,
    playerX: number,
    playerZ: number,
    tuning: ZombieEmergenceTuning,
    exitClear: (site: ZombieEmergenceSite) => boolean,
  ): boolean {
    return site.floor === floor
      && (this.restingUntil.get(site.id) ?? -Infinity) <= this.clock
      && Math.hypot(site.rise.x - playerX, site.rise.z - playerZ) >= tuning.minPlayerDistance
      && exitClear(site);
  }
}
