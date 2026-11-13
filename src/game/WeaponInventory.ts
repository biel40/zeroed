import type { WeaponId } from '../weapons/WeaponTypes';

export interface GrantResult {
  /** Weapon the player ends up holding (always the granted one). */
  readonly equipped: WeaponId;
  /** Weapon removed from the inventory to make room, if any. */
  readonly dropped: WeaponId | null;
}

/**
 * Pure slot-based weapon inventory. Zombies caps it at two weapons; the
 * Supports configurable slot caps. Contains no Three.js code so the
 * pickup/replace rules are unit-testable on their own.
 *
 * Grant rules:
 * - Weapon already carried → re-equip it (the caller refills its ammo).
 * - A free slot exists → the weapon goes there.
 * - Full → the CURRENTLY SELECTED weapon is replaced.
 *
 * One carried weapon at a time may be stored away (left at an upgrade
 * machine): it leaves its slot but stays owned, its slot stays reserved
 * so a grant can never overfill the inventory, a second copy of it is
 * refused, and `restore` puts it back where it was.
 */
export class WeaponInventory {
  private slots: WeaponId[];
  private current = 0;
  private readonly pinned = new Set<WeaponId>();
  /** Weapon taken out of the inventory for a while, and the slot it returns to. */
  private stored: { readonly id: WeaponId; readonly slot: number } | null = null;

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

  /** Carried in a slot right now. */
  has(id: WeaponId): boolean {
    return this.slots.includes(id);
  }

  /** Carried, or stored away until it is restored. */
  owns(id: WeaponId): boolean {
    return this.slots.includes(id) || this.stored?.id === id;
  }

  /** The weapon stored away, or null. */
  get storedWeapon(): WeaponId | null {
    return this.stored?.id ?? null;
  }

  /** `id` is carried, nothing is stored yet and another weapon stays in hand. */
  canStore(id: WeaponId): boolean {
    return this.stored === null && this.slots.length > 1 && this.slots.includes(id);
  }

  /** Takes `id` out of its slot, selecting a weapon still carried; false unless `canStore`. */
  store(id: WeaponId): boolean {
    if (!this.canStore(id)) return false;
    const slot = this.slots.indexOf(id);
    this.slots.splice(slot, 1);
    if (this.current > slot) this.current--;
    this.current = Math.min(this.current, this.slots.length - 1);
    this.stored = { id, slot };
    return true;
  }

  /** Puts the stored weapon back into its slot and selects it; null when none is stored. */
  restore(): WeaponId | null {
    if (!this.stored) return null;
    const { id, slot } = this.stored;
    this.stored = null;
    this.current = Math.min(slot, this.slots.length);
    this.slots.splice(this.current, 0, id);
    return id;
  }

  pin(id: WeaponId): void {
    if (this.slots.includes(id)) this.pinned.add(id);
  }

  isPinned(id: WeaponId): boolean {
    return this.pinned.has(id);
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
  grant(id: WeaponId, replacePinned = false): GrantResult {
    const carried = this.slots.indexOf(id);
    if (carried !== -1) {
      this.current = carried;
      return { equipped: id, dropped: null };
    }
    // Owned already, only away: no second copy.
    if (this.stored?.id === id) return { equipped: this.slots[this.current], dropped: null };
    if (this.slots.length < this.maxSlots - (this.stored ? 1 : 0)) {
      this.slots.push(id);
      this.current = this.slots.length - 1;
      return { equipped: id, dropped: null };
    }
    let replaceIndex = this.current;
    if (!replacePinned && this.pinned.has(this.slots[replaceIndex])) {
      replaceIndex = this.slots.findIndex((slotId) => !this.pinned.has(slotId));
      if (replaceIndex === -1) {
        return { equipped: this.slots[this.current], dropped: null };
      }
    }
    const dropped = this.slots[replaceIndex];
    this.pinned.delete(dropped);
    this.slots[replaceIndex] = id;
    this.current = replaceIndex;
    return { equipped: id, dropped };
  }

  /** Back to the starting loadout (zombies restart). */
  reset(starting: readonly WeaponId[]): void {
    this.pinned.clear();
    this.stored = null;
    this.slots = [...starting];
    this.current = 0;
  }
}
