/**
 * How hard a hit rocks a zombie, as a pure state machine so its feel is
 * testable. A hit gives the body a shove that peaks after a beat and
 * settles on its own (critically damped: no wobble, no snap), plus a short
 * loss of pace that eases back. Repeated hits build resistance, so
 * sustained fire keeps the body reeling without ever pinning it in place.
 */

/** Spring frequency (1/s) of the body's reel: peak after 1/ω ≈ 125 ms, settled in ~0.7 s. */
const OMEGA = 8;
/** Largest reel (0..1 of the full pose) any number of hits can reach. */
const MAX_REEL = 1;
/**
 * Lowest share of walking pace a fresh, full-force hit leaves. The loss
 * grows with the square of the hit, so light rounds barely touch the pace
 * and only heavy ones make the body falter.
 */
export const STAGGER_MIN_PACE = 0.45;
/** Seconds the lost pace holds before it starts to come back. */
const PACE_HOLD = 0.12;
/** Rate (1/s) at which lost pace returns after the hold. */
const PACE_RECOVERY = 4.5;
/** Resistance a full-force hit adds, and its cap: a reeling body shrugs off the next ones. */
const RESISTANCE_PER_HIT = 0.45;
const MAX_RESISTANCE = 0.75;
/** Rate (1/s) at which resistance wears off once the hits stop. */
const RESISTANCE_DECAY = 1.2;
const REST_EPSILON = 1e-4;

export class ZombieStagger {
  private reel = 0;
  private reelVelocity = 0;
  private lostPace = 0;
  private sinceHit = Number.POSITIVE_INFINITY;
  private resistance = 0;
  /** Body-local direction (x: its left, z: forward) the latest hits pushed it. */
  private pushX = 0;
  private pushZ = -1;

  /** 0..1 displacement of the reeling pose. */
  public get amount(): number {
    return this.reel;
  }

  public get directionX(): number {
    return this.pushX;
  }

  public get directionZ(): number {
    return this.pushZ;
  }

  /** Multiplier on walking pace: 1 untouched, down to STAGGER_MIN_PACE right after a heavy hit. */
  public get paceScale(): number {
    return 1 - (1 - STAGGER_MIN_PACE) * this.lostPace;
  }

  public get active(): boolean {
    return this.reel !== 0 || this.reelVelocity !== 0 || this.lostPace !== 0 || this.resistance !== 0;
  }

  /**
   * A hit of `force` (0..1: a light round on a healthy body .. a blow that
   * nearly kills it) travelling along body-local (directionX, directionZ).
   */
  public hit(force: number, directionX: number, directionZ: number): void {
    const effective = Math.min(1, Math.max(0, force)) * (1 - this.resistance);
    if (effective <= 0) return;
    const length = Math.hypot(directionX, directionZ);
    if (length > 1e-6) {
      // A new shove bends the reel towards its direction in proportion to its strength.
      const blend = effective / (effective + this.reel + 1e-6);
      this.pushX += (directionX / length - this.pushX) * blend;
      this.pushZ += (directionZ / length - this.pushZ) * blend;
      const pushLength = Math.hypot(this.pushX, this.pushZ) || 1;
      this.pushX /= pushLength;
      this.pushZ /= pushLength;
    }
    // Velocity that makes a body at rest peak at `effective` (critically damped: peak = v0 / (ω·e)).
    const limit = MAX_REEL * OMEGA * Math.E;
    this.reelVelocity = Math.min(limit, this.reelVelocity + effective * OMEGA * Math.E);
    this.lostPace = Math.max(this.lostPace, effective * effective);
    this.sinceHit = 0;
    this.resistance = Math.min(MAX_RESISTANCE, this.resistance + effective * RESISTANCE_PER_HIT);
  }

  public update(dt: number): void {
    if (dt <= 0 || !this.active) return;
    const decay = Math.exp(-OMEGA * dt);
    const slope = this.reelVelocity + OMEGA * this.reel;
    const reel = (this.reel + slope * dt) * decay;
    this.reelVelocity = (this.reelVelocity - OMEGA * slope * dt) * decay;
    this.reel = Math.min(MAX_REEL, Math.max(0, reel));
    if (this.reel < REST_EPSILON && Math.abs(this.reelVelocity) < REST_EPSILON * OMEGA) this.reel = this.reelVelocity = 0;

    this.sinceHit += dt;
    if (this.sinceHit > PACE_HOLD) {
      this.lostPace *= Math.exp(-PACE_RECOVERY * dt);
      if (this.lostPace < 1e-3) this.lostPace = 0;
    }
    this.resistance = Math.max(0, this.resistance - RESISTANCE_DECAY * dt * (this.sinceHit > PACE_HOLD ? 1 : 0));
  }

  public reset(): void {
    this.reel = this.reelVelocity = this.lostPace = this.resistance = 0;
    this.sinceHit = Number.POSITIVE_INFINITY;
    this.pushX = 0;
    this.pushZ = -1;
  }
}
