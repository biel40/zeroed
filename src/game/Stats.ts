export class Stats {
  shots = 0;
  hits = 0;
  lastHitDistance = 0;

  registerShot(): void {
    this.shots++;
  }

  registerHit(distance: number): void {
    this.hits++;
    this.lastHitDistance = distance;
  }

  get accuracy(): number {
    return this.shots === 0 ? 0 : this.hits / this.shots;
  }
}
