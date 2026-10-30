import type { ZombieKillSource } from './ZombieDeath';

export interface BloodBurstProfile {
  readonly drops: number;
  readonly radius: number;
  readonly force: number;
  readonly spread: number;
}

const KNIFE_BURST: BloodBurstProfile = { drops: 30, radius: 0.017, force: 3.8, spread: 1.6 };
const BULLET_BURSTS: readonly BloodBurstProfile[] = [
  { drops: 9, radius: 0.012, force: 5.5, spread: 0.8 },
  { drops: 12, radius: 0.013, force: 5.8, spread: 1 },
  { drops: 16, radius: 0.014, force: 6.2, spread: 1.2 },
  { drops: 20, radius: 0.015, force: 6.5, spread: 1.4 },
];
const RAPID_HIT_WINDOW = 0.45;

/** Only confirmed wounds drive this cosmetic cadence; health and rewards stay elsewhere. */
export class ZombieBleeding {
  private quietTime = Infinity;
  private consecutiveHits = 0;

  public hit(source: ZombieKillSource | 'normal' | undefined, lethal: boolean): BloodBurstProfile | null {
    if (source === 'fakel' || source === 'raygun' || source === 'tesla' || (source === 'barrett' && lethal)) return null;
    if (source === 'knife') return KNIFE_BURST;
    if (this.quietTime >= RAPID_HIT_WINDOW) this.consecutiveHits = 0;
    const burst = BULLET_BURSTS[Math.min(this.consecutiveHits, BULLET_BURSTS.length - 1)];
    this.consecutiveHits++;
    this.quietTime = 0;
    return burst;
  }

  public update(dt: number): void { this.quietTime += Math.max(0, dt); }

  public reset(): void { this.quietTime = Infinity; this.consecutiveHits = 0; }
}
