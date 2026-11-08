import type { LethalGrenadeLoadout } from '../config/grenades';

/**
 * Grenades the player carries in a run. Pure counting: the throw, the
 * purchase and the round refill decide when to call it.
 */
export class LethalGrenadeStock {
  private carried: number;

  public constructor(private readonly loadout: LethalGrenadeLoadout) {
    this.carried = loadout.starting;
  }

  public get count(): number {
    return this.carried;
  }

  public get max(): number {
    return this.loadout.max;
  }

  public get isFull(): boolean {
    return this.carried >= this.loadout.max;
  }

  /** Takes one grenade for a throw; false when none is left. */
  public consume(): boolean {
    if (this.carried <= 0) return false;
    this.carried--;
    return true;
  }

  /** A new round hands out its grenades, never past the cap. */
  public grantRound(): void {
    this.carried = Math.min(this.loadout.max, this.carried + this.loadout.perRound);
  }

  /** A purchase fills the pouch; false when it already was full. */
  public refill(): boolean {
    if (this.isFull) return false;
    this.carried = this.loadout.max;
    return true;
  }

  /** New run: the starting grenades again. */
  public reset(): void {
    this.carried = this.loadout.starting;
  }
}
