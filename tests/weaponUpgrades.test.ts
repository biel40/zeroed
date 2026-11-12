import { describe, expect, it } from 'vitest';
import { WeaponUpgrades } from '../src/game/WeaponUpgrades';

describe('Weapon upgrades', () => {
  it('upgrades each weapon once, doubles only its damage and forgets everything on reset', () => {
    const upgrades = new WeaponUpgrades(2);
    expect(upgrades.has('m14')).toBe(false);
    expect(upgrades.damageScale('m14')).toBe(1);
    expect(upgrades.upgrade('m14')).toBe(true);
    expect(upgrades.upgrade('m14')).toBe(false);
    expect(upgrades.damageScale('m14')).toBe(2);
    expect(upgrades.damageScale('ak47')).toBe(1);
    upgrades.reset();
    expect(upgrades.has('m14')).toBe(false);
    expect(upgrades.damageScale('m14')).toBe(1);
  });
});
