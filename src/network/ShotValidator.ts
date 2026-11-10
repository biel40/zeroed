/** Seconds a hit claim may trail its shot (projectile flight plus latency). */
const CREDIT_LIFETIME = 2;
/** Outstanding shots kept for hit claims; older ones are dropped first. */
const MAX_PENDING_SHOTS = 32;

/** Hit claims an accepted shot of this weapon may make: one per zombie its bullet pierces. */
export function shotHitsPerShot(weapon: { readonly projectile: { readonly maxTargets?: number } }): number {
  return Math.max(1, weapon.projectile.maxTargets ?? 1);
}

/** An accepted shot still waiting for its hit claims. */
interface PendingShot {
  expiresAt: number;
  hitsLeft: number;
  readonly targets: number[];
}

/**
 * Host-side guard for a remote shooter. A token bucket bounds the sustained
 * fire rate while tolerating packets that arrive bunched together, and every
 * accepted shot grants `hitsPerShot` damage claims, each on a different
 * target (a penetrating round). Damage is therefore applied once per zombie
 * and shot, by the host, and never more often than the weapon can really fire.
 */
export class ShotValidator {
  private tokens: number;
  private lastTime: number | null = null;
  private readonly pending: PendingShot[] = [];
  private readonly pool: PendingShot[] = [];

  public constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly hitsPerShot: number = 1,
  ) {
    this.tokens = capacity;
  }

  public tryShoot(now: number): boolean {
    if (this.lastTime !== null) {
      this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.lastTime) * this.refillPerSecond);
    }
    this.lastTime = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    if (this.pending.length >= MAX_PENDING_SHOTS) this.release(0);
    const shot = this.pool.pop() ?? { expiresAt: 0, hitsLeft: 0, targets: [] };
    shot.expiresAt = now + CREDIT_LIFETIME;
    shot.hitsLeft = this.hitsPerShot;
    this.pending.push(shot);
    return true;
  }

  /** Charges a hit on `targetId` to the oldest live shot that has not hit it yet. */
  public tryConsumeHit(now: number, targetId: number): boolean {
    while (this.pending.length > 0 && this.pending[0].expiresAt < now) this.release(0);
    for (let index = 0; index < this.pending.length; index++) {
      const shot = this.pending[index];
      if (shot.targets.includes(targetId)) continue;
      shot.hitsLeft -= 1;
      if (shot.hitsLeft === 0) this.release(index);
      else shot.targets.push(targetId);
      return true;
    }
    return false;
  }

  public reset(): void {
    this.tokens = this.capacity;
    this.lastTime = null;
    while (this.pending.length > 0) this.release(0);
  }

  private release(index: number): void {
    const [shot] = this.pending.splice(index, 1);
    shot.targets.length = 0;
    this.pool.push(shot);
  }
}
