import type { DieKathedraleLightSite, DieKathedraleZoneId } from '../DieKathedraleConfig';

/** Deterministic candle discovery and ignition; rendering and the real-light pool stay separate. */
export class CandleIgnition {
  private readonly levels: Float32Array;
  private readonly burning: Uint8Array;

  public constructor(private readonly sites: ReadonlyArray<DieKathedraleLightSite>) {
    this.levels = new Float32Array(sites.length);
    this.burning = new Uint8Array(sites.length);
    this.reset();
  }

  public reset(): void {
    for (let site = 0; site < this.sites.length; site++) {
      const ignition = this.sites[site].ignition;
      const lit = !ignition || ignition.initiallyLit;
      this.levels[site] = lit ? 1 : 0;
      this.burning[site] = lit ? 1 : 0;
    }
  }

  public getLevel(site: number): number {
    return this.levels[site];
  }

  public update(
    dt: number,
    observer: { readonly x: number; readonly z: number },
    activeZones: ReadonlySet<DieKathedraleZoneId>,
  ): void {
    if (dt <= 0) return;
    for (let index = 0; index < this.sites.length; index++) {
      const site = this.sites[index];
      const ignition = site.ignition;
      if (!ignition || this.levels[index] >= 1) continue;
      if (!this.burning[index]) {
        const dx = site.x - observer.x;
        const dz = site.z - observer.z;
        if (dx * dx + dz * dz > ignition.radius * ignition.radius) continue;
        let accessible = false;
        for (let zone = 0; zone < ignition.zones.length; zone++) {
          if (activeZones.has(ignition.zones[zone])) {
            accessible = true;
            break;
          }
        }
        if (!accessible) continue;
        this.burning[index] = 1;
      }
      this.levels[index] = Math.min(1, this.levels[index] + dt / ignition.seconds);
    }
  }
}
