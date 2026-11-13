import { describe, expect, it } from 'vitest';
import { WeaponInventory } from '../src/game/WeaponInventory';

describe('WeaponInventory (zombies two-weapon rule)', () => {
  it('allows an explicit developer grant to replace the selected pinned weapon only', () => {
    const inventory = new WeaponInventory(['vortex9', 'tesla'], 2);
    inventory.pin('vortex9');
    inventory.pin('tesla');
    expect(inventory.grant('m1911').equipped).toBe('vortex9');
    expect(inventory.grant('m1911', true)).toEqual({ equipped: 'm1911', dropped: 'vortex9' });
    expect(inventory.weapons).toEqual(['m1911', 'tesla']);
    expect(inventory.isPinned('vortex9')).toBe(false);
    expect(inventory.isPinned('tesla')).toBe(true);
  });
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
    inventory.grant('vortex9');
    inventory.reset(['m1911']);
    expect(inventory.weapons).toEqual(['m1911']);
    expect(inventory.currentWeapon).toBe('m1911');
  });

  it('supports the classic map shape: five fixed weapons', () => {
    const inventory = new WeaponInventory(['m4a1', 'ak47', 'm60', 'l96', 'm1911'], 5);
    expect(inventory.weapons).toHaveLength(5);
    expect(inventory.switchTo(4)).toBe('m1911');
    expect(inventory.switchTo(0)).toBe('m4a1');
  });

  it('keeps pinned VORTEX-9 and Zeus in both slots and ignores replacements until reset', () => {
    const inventory = new WeaponInventory(['m1911'], 2);
    inventory.grant('vortex9');
    inventory.pin('vortex9');
    inventory.grant('tesla');
    inventory.pin('tesla');

    expect([...inventory.weapons].sort()).toEqual(['tesla', 'vortex9']);
    expect(inventory.grant('ak47')).toEqual({ equipped: 'tesla', dropped: null });
    expect([...inventory.weapons].sort()).toEqual(['tesla', 'vortex9']);

    inventory.reset(['m1911']);
    expect(inventory.isPinned('vortex9')).toBe(false);
    expect(inventory.isPinned('tesla')).toBe(false);
    expect(inventory.weapons).toEqual(['m1911']);
  });
});

describe('WeaponInventory (a weapon left at an upgrade machine)', () => {
  const carrying = (...weapons: Parameters<WeaponInventory['grant']>[0][]): WeaponInventory => {
    const inventory = new WeaponInventory([weapons[0]], 2);
    for (const id of weapons.slice(1)) inventory.grant(id);
    return inventory;
  };

  it('takes the weapon out of its slot, keeps it owned and hands over the other weapon', () => {
    const inventory = carrying('m1911', 'ak47');
    inventory.switchTo(0);
    expect(inventory.canStore('m1911')).toBe(true);
    expect(inventory.store('m1911')).toBe(true);
    expect(inventory.weapons).toEqual(['ak47']);
    expect(inventory.currentWeapon).toBe('ak47');
    expect(inventory.storedWeapon).toBe('m1911');
    expect(inventory.has('m1911')).toBe(false);
    expect(inventory.owns('m1911')).toBe(true);
    expect(inventory.owns('ak47')).toBe(true);
  });

  it('puts it back into its original slot and equips it, once', () => {
    const inventory = carrying('m1911', 'ak47');
    inventory.store('m1911');
    expect(inventory.restore()).toBe('m1911');
    expect(inventory.weapons).toEqual(['m1911', 'ak47']);
    expect(inventory.currentWeapon).toBe('m1911');
    expect(inventory.storedWeapon).toBeNull();
    expect(inventory.restore()).toBeNull();
    expect(inventory.weapons).toEqual(['m1911', 'ak47']);
  });

  it('never leaves the hands empty and holds a single weapon at a time', () => {
    const alone = new WeaponInventory(['m1911'], 2);
    expect(alone.canStore('m1911')).toBe(false);
    expect(alone.store('m1911')).toBe(false);
    expect(alone.weapons).toEqual(['m1911']);
    const inventory = carrying('m1911', 'ak47');
    expect(inventory.canStore('m60')).toBe(false);
    inventory.store('ak47');
    expect(inventory.canStore('m1911')).toBe(false);
    expect(inventory.store('m1911')).toBe(false);
  });

  it('keeps the empty slot reserved: a new weapon replaces the one in hand', () => {
    const inventory = carrying('m1911', 'ak47');
    inventory.store('ak47');
    expect(inventory.grant('m60')).toEqual({ equipped: 'm60', dropped: 'm1911' });
    expect(inventory.weapons).toEqual(['m60']);
    expect(inventory.restore()).toBe('ak47');
    expect(inventory.weapons).toEqual(['m60', 'ak47']);
    expect(inventory.weapons).toHaveLength(inventory.maxSlots);
  });

  it('refuses a second copy of the stored weapon', () => {
    const inventory = carrying('m1911', 'ak47');
    inventory.store('ak47');
    expect(inventory.grant('ak47')).toEqual({ equipped: 'm1911', dropped: null });
    expect(inventory.weapons).toEqual(['m1911']);
    expect(inventory.restore()).toBe('ak47');
    expect(inventory.weapons).toEqual(['m1911', 'ak47']);
  });

  it('keeps a pinned weapon pinned across the visit and forgets the stored weapon on reset', () => {
    const inventory = carrying('m1911', 'tesla');
    inventory.pin('tesla');
    inventory.store('tesla');
    inventory.restore();
    expect(inventory.isPinned('tesla')).toBe(true);
    inventory.store('tesla');
    inventory.reset(['m1911']);
    expect(inventory.storedWeapon).toBeNull();
    expect(inventory.owns('tesla')).toBe(false);
    expect(inventory.weapons).toEqual(['m1911']);
  });
});
