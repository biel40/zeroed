/**
 * CoD Zombies-style Points: a single wallet that every reward and purchase
 * routes through, so the balance is mutated in exactly one place. Pure
 * TypeScript, no Three.js — unit-tested directly. The mode awards points on
 * hits/kills and spends them at the Mystery Box; the HUD reads the balance.
 */

/** Non-lethal bullet/energy hit on a zombie. */
export const POINTS_HIT = 10;
/** A kill with a body shot (or any non-headshot finisher). */
export const POINTS_KILL = 50;
/** A lethal headshot. REPLACES the kill reward — never stacked with it. */
export const POINTS_HEADSHOT_KILL = 100;
/** Points granted for each rebuilt barrier board. */
export const POINTS_REPAIR = 10;

export class PlayerEconomy {
  private balance = 0;

  get points(): number {
    return this.balance;
  }

  /** Non-lethal hit reward. Call only when the zombie SURVIVED the hit. */
  awardHit(): void {
    this.balance += POINTS_HIT;
  }

  /**
   * Kill reward. `headshot` selects the higher payout; the two kill rewards
   * are mutually exclusive by construction (one branch, one addition).
   */
  awardKill(headshot: boolean): void {
    this.balance += headshot ? POINTS_HEADSHOT_KILL : POINTS_KILL;
  }

  /**
   * Repair reward. The caller decides whether this repair still pays for the
   * current round (barriers track their own per-round cap). This keeps the
   * single-source-of-truth rule: points are only ever added here.
   */
  awardRepair(): void {
    this.balance += POINTS_REPAIR;
  }

  canAfford(cost: number): boolean {
    return this.balance >= cost;
  }

  /**
   * Atomic purchase: deducts the full cost and returns true only when the
   * balance covers it. A failed spend leaves the balance untouched, so the
   * caller can safely show "not enough points" without a rollback path.
   */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.balance -= cost;
    return true;
  }

  /** Zombies restart: back to a fresh wallet. */
  reset(): void {
    this.balance = 0;
  }
}
