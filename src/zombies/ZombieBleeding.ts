import type { ZombieKillSource } from './ZombieDeath';

export interface BloodBurstProfile {
  readonly drops: number;
  readonly radius: number;
  readonly force: number;
  readonly spread: number;
}

const KNIFE_BURST: BloodBurstProfile = { drops: 60, radius: 0.035, force: 5.5, spread: 4 };
const BULLET_BURSTS: readonly BloodBurstProfile[] = [
  { drops: 10, radius: 0.023, force: 8, spread: 2 },
  { drops: 16, radius: 0.026, force: 8.5, spread: 2.4 },
  { drops: 24, radius: 0.029, force: 9, spread: 2.8 },
  { drops: 32, radius: 0.032, force: 9.5, spread: 3.2 },
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
