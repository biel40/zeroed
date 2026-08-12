import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponEventType, WeaponId } from '../src/weapons/WeaponTypes';

const DT = 1 / 240;
const IDLE = { trigger: false, ads: false };

function makeWeapon(id: WeaponId): Weapon {
  // Fixed rng makes recoil/bloom assertions deterministic.
  return new Weapon(WEAPON_DEFINITIONS[id], () => 0.5);
}

interface StepResult {
  events: WeaponEventType[];
}

function step(weapon: Weapon, seconds: number, input = IDLE): StepResult {
  const events: WeaponEventType[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    weapon.update(DT, input);
    for (const event of weapon.pendingEvents) events.push(event.type);
    weapon.clearEvents();
  }
  return { events };
}

function count(events: WeaponEventType[], type: WeaponEventType): number {
  return events.filter((e) => e === type).length;
}

describe('Weapon fire cadence', () => {
  it('fires the first shot immediately and then respects the rpm', () => {
    const m4 = makeWeapon('m4a1');
    const { events } = step(m4, 0.5, { trigger: true, ads: false });
    const shots = count(events, 'shot');
    // 800 rpm = one shot every 75 ms → 6-7 shots in 0.5 s depending on rounding.
    expect(m4.definition.rpm).toBe(800);
    expect(shots).toBeGreaterThanOrEqual(6);
    expect(shots).toBeLessThanOrEqual(7);
  });

  it('semi-auto fires exactly once per trigger press', () => {
    const m4 = makeWeapon('m4a1');
    m4.cycleFireMode(); // → semi
    const held = step(m4, 0.5, { trigger: true, ads: false });
    expect(count(held.events, 'shot')).toBe(1);
  });

  it('respects the slower cadence of the AK-47', () => {
    const ak = makeWeapon('ak47');
    const { events } = step(ak, 0.5, { trigger: true, ads: false });
    const shots = count(events, 'shot');
    // 600 rpm = one shot every 100 ms → 5-6 shots in 0.5 s.
    expect(shots).toBeGreaterThanOrEqual(5);
    expect(shots).toBeLessThanOrEqual(6);
  });
});

describe('Weapon ammo and reload', () => {
  it('empties the magazine, dry fires, then reloads to full', () => {
    const m4 = makeWeapon('m4a1');
    m4.cycleFireMode(); // semi for precise counting
    let shots = 0;
    let dryFires = 0;

    for (let i = 0; i < 32; i++) {
      shots += count(step(m4, DT, { trigger: true, ads: false }).events, 'shot');
      dryFires += count(step(m4, DT, IDLE).events, 'dryFire');
      step(m4, 0.09); // let the cooldown expire between presses
    }

    expect(shots).toBe(30);
    expect(m4.ammoInMagazine).toBe(0);

    const dry = step(m4, DT, { trigger: true, ads: false });
    expect(count(dry.events, 'dryFire')).toBe(1);
    expect(count(dry.events, 'shot')).toBe(0);

    expect(m4.reload()).toBe(true);
    expect(m4.state).toBe('reloading');
    const reload = step(m4, m4.definition.reloadTime + 0.05);
    expect(count(reload.events, 'reloadStart')).toBe(1);
    expect(count(reload.events, 'reloadEnd')).toBe(1);
    expect(m4.ammoInMagazine).toBe(m4.definition.magazineSize);
    expect(m4.state).toBe('ready');
  });

  it('refuses to reload a full magazine', () => {
    const m4 = makeWeapon('m4a1');
    expect(m4.reload()).toBe(false);
  });

  it('cannot fire while reloading', () => {
    const m4 = makeWeapon('m4a1');
    step(m4, 0.2, { trigger: true, ads: false });
    expect(m4.reload()).toBe(true);
    const during = step(m4, 0.5, { trigger: true, ads: false });
    expect(count(during.events, 'shot')).toBe(0);
  });
});

describe('Fire modes', () => {
  it('toggles between auto and semi on the M4A1', () => {
    const m4 = makeWeapon('m4a1');
    expect(m4.fireMode).toBe('auto');
    expect(m4.cycleFireMode()).toBe('semi');
    expect(m4.cycleFireMode()).toBe('auto');
  });

  it('returns null for single-mode weapons', () => {
    const m60 = makeWeapon('m60');
    const l96 = makeWeapon('l96');
    expect(m60.cycleFireMode()).toBeNull();
    expect(l96.cycleFireMode()).toBeNull();
    expect(m60.fireMode).toBe('auto');
  });
});

describe('Bolt action', () => {
  it('cycles the bolt after each shot and blocks firing meanwhile', () => {
    const l96 = makeWeapon('l96');

    const first = step(l96, DT, { trigger: true, ads: false });
    expect(count(first.events, 'shot')).toBe(1);
    expect(count(first.events, 'boltStart')).toBe(1);
    expect(l96.state).toBe('cycling');

    step(l96, DT, IDLE);
    const during = step(l96, 0.5, { trigger: true, ads: false });
    expect(count(during.events, 'shot')).toBe(0);

    const cycle = step(l96, l96.definition.boltCycleTime);
    expect(count(cycle.events, 'boltEnd')).toBe(1);
    expect(l96.state).toBe('ready');

    step(l96, DT, IDLE);
    const second = step(l96, DT, { trigger: true, ads: false });
    expect(count(second.events, 'shot')).toBe(1);
    expect(l96.ammoInMagazine).toBe(3);
  });
});

describe('ADS and spread', () => {
  it('blends adsAlpha at the configured speed and drops it while reloading', () => {
    const m4 = makeWeapon('m4a1');
    step(m4, 1 / m4.definition.ads.speed, { trigger: false, ads: true });
    expect(m4.adsAlpha).toBeCloseTo(1, 1);

    step(m4, 0.2, { trigger: true, ads: true });
    m4.reload();
    step(m4, 0.3, { trigger: false, ads: true });
    expect(m4.adsAlpha).toBeLessThan(1);
  });

  it('aiming reduces spread', () => {
    const m4 = makeWeapon('m4a1');
    const hipSpread = m4.currentSpread();
    step(m4, 0.5, { trigger: false, ads: true });
    expect(m4.currentSpread()).toBeLessThan(hipSpread);
  });

  it('sustained fire grows bloom up to the cap and it recovers afterwards', () => {
    const m60 = makeWeapon('m60');
    // Bloom oscillates at the cap: each shot re-caps it, then recovery
    // bleeds a little before the next one.
    step(m60, 4, { trigger: true, ads: false });
    expect(m60.currentBloom).toBeGreaterThan(m60.definition.spread.maxBloom * 0.9);

    step(m60, 4);
    expect(m60.currentBloom).toBe(0);
  });
});

describe('Equip', () => {
  it('blocks firing during the equip animation', () => {
    const m4 = makeWeapon('m4a1');
    m4.equip();
    expect(m4.state).toBe('equipping');
    const during = step(m4, 0.1, { trigger: true, ads: false });
    expect(count(during.events, 'shot')).toBe(0);
    step(m4, m4.definition.equipTime);
    expect(m4.state).toBe('ready');
  });
});
