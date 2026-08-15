import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { InputState } from '../src/player/InputState';
import { applyMobileAction } from '../src/player/MobileInput';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponId } from '../src/weapons/WeaponTypes';

const DT = 1 / 60;

function updateWeapon(weapon: Weapon, state: InputState, seconds: number): number {
  let shots = 0;
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    weapon.update(DT, {
      trigger: state.leftButtonDown,
      ads: state.rightButtonDown,
    });
    shots += weapon.pendingEvents.filter((event) => event.type === 'shot').length;
    weapon.clearEvents();
  }
  return shots;
}

describe('mobile 1-Tap ADS Fire', () => {
  it('presses and releases ADS and trigger as one shared input action', () => {
    const state = new InputState();
    applyMobileAction(state, 'fire', true);
    expect(state.leftButtonDown).toBe(true);
    expect(state.rightButtonDown).toBe(true);
    applyMobileAction(state, 'fire', false);
    expect(state.leftButtonDown).toBe(false);
    expect(state.rightButtonDown).toBe(false);
  });

  it.each<WeaponId>(['m1911', 'raygun', 'tesla'])(
    '%s fires once per touch even when held',
    (weaponId) => {
      const state = new InputState();
      const weapon = new Weapon(WEAPON_DEFINITIONS[weaponId]);
      applyMobileAction(state, 'fire', true);
      expect(updateWeapon(weapon, state, 3)).toBe(1);
      expect(weapon.adsAlpha).toBe(1);

      applyMobileAction(state, 'fire', false);
      updateWeapon(weapon, state, 0.5);
      expect(weapon.adsAlpha).toBe(0);

      applyMobileAction(state, 'fire', true);
      expect(updateWeapon(weapon, state, DT)).toBe(1);
    },
  );

  it.each<WeaponId>(['m4a1', 'ak47', 'm60'])(
    '%s keeps firing at its existing automatic cadence while held',
    (weaponId) => {
      const state = new InputState();
      const weapon = new Weapon(WEAPON_DEFINITIONS[weaponId]);
      applyMobileAction(state, 'fire', true);
      const shots = updateWeapon(weapon, state, 1);
      expect(shots).toBeGreaterThan(1);
      expect(shots).toBeLessThanOrEqual(weapon.definition.rpm / 60 + 1);
      applyMobileAction(state, 'fire', false);
      expect(updateWeapon(weapon, state, 0.5)).toBe(0);
      expect(weapon.adsAlpha).toBe(0);
    },
  );
});
