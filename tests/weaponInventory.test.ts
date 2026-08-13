import { describe, expect, it } from 'vitest';
import { WeaponInventory } from '../src/game/WeaponInventory';

describe('WeaponInventory (zombies two-weapon rule)', () => {
  it('starts with the M1911 alone and one empty slot', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    expect(inventory.weapons).toEqual(['m1911']);
    expect(inventory.currentWeapon).toBe('m1911');
    expect(inventory.currentIndex).toBe(0);
    expect(inventory.maxSlots).toBe(2);
  });

  it('puts the first Mystery Box reward into the empty slot and equips it', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    const result = inventory.grant('ak47');
    expect(result).toEqual({ equipped: 'ak47', dropped: null });
    expect(inventory.weapons).toEqual(['m1911', 'ak47']);
    expect(inventory.currentWeapon).toBe('ak47');
  });

  it('never exceeds two weapons: a third pickup replaces the selected one', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    inventory.grant('ak47'); // carrying m1911 + ak47, ak47 selected
    const result = inventory.grant('m60');
    expect(result).toEqual({ equipped: 'm60', dropped: 'ak47' });
    expect(inventory.weapons).toEqual(['m1911', 'm60']);
    expect(inventory.currentWeapon).toBe('m60');
    expect(inventory.weapons).toHaveLength(2);
  });

  it('replaces the M1911 when it is the currently selected weapon', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    inventory.grant('ak47');
    inventory.switchTo(0); // back to the M1911
    const result = inventory.grant('l96');
    expect(result).toEqual({ equipped: 'l96', dropped: 'm1911' });
    expect(inventory.weapons).toEqual(['l96', 'ak47']);
  });

  it('re-granting a carried weapon keeps the slot and re-equips it (ammo refill)', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    inventory.grant('ak47');
    inventory.switchTo(0);
    const result = inventory.grant('ak47'); // already carried in slot 1
    expect(result).toEqual({ equipped: 'ak47', dropped: null });
    expect(inventory.weapons).toEqual(['m1911', 'ak47']);
    expect(inventory.currentWeapon).toBe('ak47');
  });

  it('switches only to occupied, different slots', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    expect(inventory.switchTo(1)).toBeNull(); // empty slot
    expect(inventory.switchTo(0)).toBeNull(); // already selected
    expect(inventory.switchTo(5)).toBeNull(); // out of range
    inventory.grant('ak47');
    expect(inventory.switchTo(0)).toBe('m1911');
    expect(inventory.currentWeapon).toBe('m1911');
  });

  it('reset restores the starting inventory (zombies restart)', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    inventory.grant('ak47');
    inventory.grant('raygun');
    inventory.reset(['m1911']);
    expect(inventory.weapons).toEqual(['m1911']);
    expect(inventory.currentWeapon).toBe('m1911');
  });

  it('supports the Shooting Range shape: four fixed weapons', () => {
    const inventory = new WeaponInventory(['m4a1', 'ak47', 'm60', 'l96', 'm1911'], 5);
    expect(inventory.weapons).toHaveLength(5);
    expect(inventory.switchTo(4)).toBe('m1911');
    expect(inventory.switchTo(0)).toBe('m4a1');
  });
});
