import type { WeaponId } from '../weapons/WeaponTypes';

/**
 * Which weapons of the arsenal an upgrade machine has forged this run.
 * Each weapon is forged once; a forged weapon deals `damageMultiplier`
 * times its damage. Pure run state: the mode resets it on restart.
 */
export class WeaponUpgrades {
  private readonly forged = new Set<WeaponId>();

  public constructor(private readonly damageMultiplier: number) {}

  public has(id: WeaponId): boolean {
    return this.forged.has(id);
  }

  /** Forges `id`; false when it already was. */
  public upgrade(id: WeaponId): boolean {
    if (this.forged.has(id)) return false;
    this.forged.add(id);
    return true;
  }

  /** Damage multiplier of `id`: the machine's for a forged weapon, else 1. */
  public damageScale(id: WeaponId): number {
    return this.forged.has(id) ? this.damageMultiplier : 1;
  }

  public reset(): void {
    this.forged.clear();
  }
}
