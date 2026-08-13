import type { WeaponId } from '../weapons/WeaponTypes';

export interface GrantResult {
  /** Weapon the player ends up holding (always the granted one). */
  readonly equipped: WeaponId;
  /** Weapon removed from the inventory to make room, if any. */
  readonly dropped: WeaponId | null;
}

/**
 * Pure slot-based weapon inventory. Zombies caps it at two weapons; the
 * Shooting Range runs one slot per weapon. Contains no Three.js code so the
 * pickup/replace rules are unit-testable on their own.
 *
 * Grant rules:
 * - Weapon already carried → re-equip it (the caller refills its ammo).
 * - A free slot exists → the weapon goes there.
 * - Full → the CURRENTLY SELECTED weapon is replaced.
 */
export class WeaponInventory {
  private slots: WeaponId[];
  private current = 0;

  constructor(starting: readonly WeaponId[], readonly maxSlots: number) {
    if (starting.length < 1 || starting.length > maxSlots) {
      throw new Error(`Invalid starting inventory: ${starting.length} weapons, max ${maxSlots}`);
    }
    this.slots = [...starting];
  }

  /** Carried weapons in slot order (slot 1 = index 0). */
  get weapons(): readonly WeaponId[] {
    return this.slots;
  }

  get currentWeapon(): WeaponId {
    return this.slots[this.current];
  }

  get currentIndex(): number {
    return this.current;
  }

  has(id: WeaponId): boolean {
    return this.slots.includes(id);
  }

  /**
   * Selects a slot. Returns the newly selected weapon, or null when the
   * slot is empty, out of range, or already selected.
   */
  switchTo(index: number): WeaponId | null {
    if (index === this.current || index < 0 || index >= this.slots.length) return null;
    this.current = index;
    return this.slots[this.current];
  }

  /** Adds or replaces a weapon following the rules in the class docstring. */
  grant(id: WeaponId): GrantResult {
    const carried = this.slots.indexOf(id);
    if (carried !== -1) {
      this.current = carried;
      return { equipped: id, dropped: null };
    }
    if (this.slots.length < this.maxSlots) {
      this.slots.push(id);
      this.current = this.slots.length - 1;
      return { equipped: id, dropped: null };
    }
    const dropped = this.slots[this.current];
    this.slots[this.current] = id;
    return { equipped: id, dropped };
  }

  /** Back to the starting loadout (zombies restart). */
  reset(starting: readonly WeaponId[]): void {
    this.slots = [...starting];
    this.current = 0;
  }
}
