/** Seconds a hit claim may trail its shot (projectile flight plus latency). */
const CREDIT_LIFETIME = 2;
const MAX_CREDITS = 32;

/**
 * Host-side guard for a remote shooter. A token bucket bounds the sustained
 * fire rate while tolerating packets that arrive bunched together, and every
 * accepted shot grants exactly one damage claim. Damage is therefore applied
 * once, by the host, and never more often than the weapon can really fire.
 */
export class ShotValidator {
  private tokens: number;
  private lastTime: number | null = null;
  private readonly credits: number[] = [];

  public constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
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
    if (this.credits.length >= MAX_CREDITS) this.credits.shift();
    this.credits.push(now + CREDIT_LIFETIME);
    return true;
  }

  public tryConsumeHit(now: number): boolean {
    while (this.credits.length > 0 && this.credits[0] < now) this.credits.shift();
    if (this.credits.length === 0) return false;
    this.credits.shift();
    return true;
  }

  public reset(): void {
    this.tokens = this.capacity;
    this.lastTime = null;
    this.credits.length = 0;
  }
}
