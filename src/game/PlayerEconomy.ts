import { HEADSHOT_POINTS } from './CombatConfig';

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
/** A knife kill: the short-range commitment pays more than a headshot. */
export const POINTS_KNIFE_KILL = 200;
/** Points granted for each rebuilt barrier board. */
export const POINTS_REPAIR = 10;

export class PlayerEconomy {
  private balance = 0;
  private unlimitedSpending = false;

  get points(): number {
    return this.balance;
  }

  /** Non-lethal direct-hit reward. Call only when the zombie survived. */
  awardHit(headshot = false): void {
    this.balance += headshot ? HEADSHOT_POINTS : POINTS_HIT;
  }

  /**
   * Kill reward. A headshot pays the same 150 points whether or not it was
   * lethal; the two branches remain mutually exclusive.
   */
  awardKill(headshot: boolean): void {
    this.balance += headshot ? HEADSHOT_POINTS : POINTS_KILL;
  }

  /** Dedicated lethal melee reward; never stacked with the normal kill. */
  public awardKnifeKill(): void {
    this.balance += POINTS_KNIFE_KILL;
  }

  /**
   * Repair reward. The caller decides whether this repair still pays for the
   * current round (barriers track their own per-round cap). This keeps the
   * single-source-of-truth rule: points are only ever added here.
   */
  awardRepair(): void {
    this.balance += POINTS_REPAIR;
  }

  public setUnlimitedSpending(enabled: boolean): void {
    this.unlimitedSpending = enabled;
  }

  canAfford(cost: number): boolean {
    return this.unlimitedSpending || this.balance >= cost;
  }

  /**
   * Atomic purchase: deducts the full cost and returns true only when the
   * balance covers it. A failed spend leaves the balance untouched, so the
   * caller can safely show "not enough points" without a rollback path.
   */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    if (!this.unlimitedSpending) this.balance -= cost;
    return true;
  }

  /** Zombies restart: back to a fresh wallet. */
  reset(): void {
    this.balance = 0;
    this.unlimitedSpending = false;
  }
}
