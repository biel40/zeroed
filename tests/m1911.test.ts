import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponEventType } from '../src/weapons/WeaponTypes';

const DT = 1 / 240;
const IDLE = { trigger: false, ads: false };

function makeM1911(): Weapon {
  // Fixed rng keeps recoil/bloom deterministic; it does not affect ammo.
  return new Weapon(WEAPON_DEFINITIONS.m1911, () => 0.5);
}

function step(weapon: Weapon, seconds: number, input = IDLE): WeaponEventType[] {
  const events: WeaponEventType[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    weapon.update(DT, input);
    for (const event of weapon.pendingEvents) events.push(event.type);
    weapon.clearEvents();
  }
  return events;
}

/** Single semi-auto press, then enough idle time for the cooldown to expire. */
function fireOnce(weapon: Weapon): WeaponEventType[] {
  const events = step(weapon, DT, { trigger: true, ads: false });
  step(weapon, 0.2); // 360 rpm → 0.167 s cooldown
  return events;
}

function finishReload(weapon: Weapon): void {
  if (weapon.state === 'ready') {
    expect(weapon.reload()).toBe(true);
  } else {
    expect(weapon.state).toBe('reloading');
  }
  step(weapon, weapon.definition.reloadTime + 0.1);
  expect(weapon.state).toBe('ready');
}

describe('M1911 definition', () => {
  it('is a semi-automatic pistol with an 8-round magazine and 32 in reserve', () => {
    const def = WEAPON_DEFINITIONS.m1911;
    expect(def.fireModes).toEqual(['semi']);
    expect(def.defaultFireMode).toBe('semi');
    expect(def.magazineSize).toBe(8);
    expect(def.reserveAmmo).toBe(32);
    expect(def.boltAction).toBe(false);
    expect(def.scoped).toBe(false);
  });

  it('is tuned as a precision starter: low damage but a strong headshot multiplier', () => {
    const def = WEAPON_DEFINITIONS.m1911;
    expect(def.damage).toBeLessThanOrEqual(WEAPON_DEFINITIONS.m4a1.damage);
    expect(def.headshotMultiplier).toBeGreaterThan(WEAPON_DEFINITIONS.m4a1.headshotMultiplier);
  });
});

describe('M1911 firing', () => {
  it('starts every life at 8 / 32', () => {
    const m1911 = makeM1911();
    expect(m1911.ammoInMagazine).toBe(8);
    expect(m1911.reserveAmmo).toBe(32);
  });

  it('fires exactly once per trigger press (semi)', () => {
    const m1911 = makeM1911();
    const events = step(m1911, 0.5, { trigger: true, ads: false });
    expect(events.filter((e) => e === 'shot')).toHaveLength(1);
  });

  it('subtracts one round per shot', () => {
    const m1911 = makeM1911();
    fireOnce(m1911);
    expect(m1911.ammoInMagazine).toBe(7);
    fireOnce(m1911);
    expect(m1911.ammoInMagazine).toBe(6);
    expect(m1911.reserveAmmo).toBe(32);
  });
});

describe('M1911 reserve ammo', () => {
  it('reloads 3 / 32 into 8 / 27', () => {
    const m1911 = makeM1911();
    for (let i = 0; i < 5; i++) fireOnce(m1911);
    expect(m1911.ammoInMagazine).toBe(3);

    finishReload(m1911);
    expect(m1911.ammoInMagazine).toBe(8);
    expect(m1911.reserveAmmo).toBe(27);
  });

  it('never tops the magazine past 8 and only draws what it needs', () => {
    const m1911 = makeM1911();
    fireOnce(m1911); // 7 / 32
    finishReload(m1911);
    expect(m1911.ammoInMagazine).toBe(8);
    expect(m1911.reserveAmmo).toBe(31);
  });

  it('never drives the reserve negative and refuses to reload at 0 / 0', () => {
    const m1911 = makeM1911();
    // Burn the full 40-round supply (8 in the mag + 32 reserve), completing
    // each automatic reload when the magazine runs dry.
    let shots = 0;
    while (m1911.ammoInMagazine > 0 || (m1911.reserveAmmo ?? 0) > 0) {
      if (m1911.ammoInMagazine === 0) finishReload(m1911);
      shots += fireOnce(m1911).filter((e) => e === 'shot').length;
    }
    expect(shots).toBe(40);
    expect(m1911.ammoInMagazine).toBe(0);
    expect(m1911.reserveAmmo).toBe(0);

    expect(m1911.reload()).toBe(false);
    const dry = step(m1911, DT, { trigger: true, ads: false });
    expect(dry).toContain('dryFire');
    expect(dry).not.toContain('shot');
    expect(m1911.reserveAmmo).toBe(0);
  });

  it('does not spend reserve when a reload is interrupted by a weapon switch', () => {
    const m1911 = makeM1911();
    for (let i = 0; i < 5; i++) fireOnce(m1911);
    expect(m1911.reload()).toBe(true);
    step(m1911, 0.3); // mid-reload…
    m1911.equip(); // …cancelled by an equip, like switching weapons
    expect(m1911.ammoInMagazine).toBe(3);
    expect(m1911.reserveAmmo).toBe(32);
  });
});

describe('M1911 reset (zombies restart / fresh pickup)', () => {
  it('restores 8 / 32 from any state', () => {
    const m1911 = makeM1911();
    for (let i = 0; i < 12; i++) fireOnce(m1911);
    finishReload(m1911);
    expect(m1911.reserveAmmo).toBeLessThan(32);

    m1911.resetAmmo();
    expect(m1911.ammoInMagazine).toBe(8);
    expect(m1911.reserveAmmo).toBe(32);
    expect(m1911.state).toBe('ready');
    // And it still fires afterwards.
    expect(fireOnce(m1911)).toContain('shot');
    expect(m1911.ammoInMagazine).toBe(7);
  });
});

describe('Reserve-less weapons keep infinite ammo (Shooting Range untouched)', () => {
  it('reloads to full without any reserve bookkeeping', () => {
    const m4 = new Weapon(WEAPON_DEFINITIONS.m4a1, () => 0.5);
    expect(m4.reserveAmmo).toBeNull();
    step(m4, 0.5, { trigger: true, ads: false });
    expect(m4.reload()).toBe(true);
    step(m4, m4.definition.reloadTime + 0.1);
    expect(m4.ammoInMagazine).toBe(30);
    expect(m4.reserveAmmo).toBeNull();
  });
});
