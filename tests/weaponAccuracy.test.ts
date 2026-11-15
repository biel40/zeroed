import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponDefinition, WeaponFrameInput, WeaponId } from '../src/weapons/WeaponTypes';

const IDLE: WeaponFrameInput = { trigger: false, ads: false };
const FIRE: WeaponFrameInput = { trigger: true, ads: false };
const DEFINITIONS = Object.values(WEAPON_DEFINITIONS);
const AUTOMATICS = DEFINITIONS.filter((definition) => definition.fireModes.includes('auto') && !definition.flame);
const FIREARMS = DEFINITIONS.filter((definition) => !definition.energy && !definition.flame);

/** Heat has its own tests; remove it when measuring bloom alone. */
function makeWeapon(id: WeaponId = 'm4a1', heat = false): Weapon {
  const definition = WEAPON_DEFINITIONS[id];
  return new Weapon(heat ? definition : { ...definition, heat: undefined }, () => 0.5);
}

/** Advance exact simulation time and retain the accuracy of each accepted shot. */
function advance(
  weapon: Weapon,
  seconds: number,
  input: WeaponFrameInput = IDLE,
  fps = 120,
  refill = false,
): number[] {
  const spreads: number[] = [];
  const frames = Math.ceil(seconds * fps - 1e-9);
  for (let frame = 0; frame < frames; frame++) {
    if (refill) weapon.ammoInMagazine = weapon.magazineCapacity;
    weapon.update(Math.min(1 / fps, seconds - frame / fps), input);
    for (const event of weapon.pendingEvents) {
      if (event.type === 'shot') spreads.push(event.spread);
    }
    weapon.clearEvents();
  }
  return spreads;
}

function last(values: readonly number[]): number {
  expect(values.length).toBeGreaterThan(0);
  return values[values.length - 1];
}

describe('Weapon accuracy balance', () => {
  it.each(DEFINITIONS)('$id makes ADS substantially more accurate than fresh hip fire', (definition) => {
    const weapon = makeWeapon(definition.id);
    const hip = weapon.currentSpread();
    advance(weapon, 1 / definition.ads.speed, { trigger: false, ads: true });
    expect(weapon.currentSpread()).toBeCloseTo(definition.spread.adsBase, 8);
    expect(hip).toBeGreaterThanOrEqual(weapon.currentSpread() * 2.5);
  });

  it.each(FIREARMS)('$id keeps hip fire useful nearby but unreliable at distance', (definition) => {
    // Half-width of the dispersion footprint: a close torso remains reachable,
    // while a target at 30 m occupies only a small share of the hip-fire cone.
    expect(Math.tan(definition.spread.hipBase) * 5).toBeLessThan(0.45);
    expect(Math.tan(definition.spread.hipBase) * 30).toBeGreaterThan(0.7);
  });

  it('preserves compact-weapon handling and precision-rifle ADS accuracy', () => {
    expect(WEAPON_DEFINITIONS.m1911.spread.hipBase).toBeLessThan(WEAPON_DEFINITIONS.m4a1.spread.hipBase);
    expect(WEAPON_DEFINITIONS.mp5.spread.hipBase).toBeLessThan(WEAPON_DEFINITIONS.ak47.spread.hipBase);
    expect(WEAPON_DEFINITIONS.l96.spread.adsBase).toBeLessThan(WEAPON_DEFINITIONS.m4a1.spread.adsBase);
    expect(WEAPON_DEFINITIONS.m14.spread.adsBase).toBeLessThan(WEAPON_DEFINITIONS.ak47.spread.adsBase);
  });

  it.each(AUTOMATICS)('$id retains an ADS advantage even with maximum bloom and heat', (definition) => {
    const weapon = makeWeapon(definition.id, true);
    advance(weapon, 8, FIRE, 120, true);
    const hip = weapon.currentSpread();
    weapon.adsAlpha = 1;
    expect(hip).toBeGreaterThan(weapon.currentSpread() * 1.8);
  });
});

describe('Progressive automatic dispersion', () => {
  it.each(AUTOMATICS)('$id builds progressively from a controlled burst to capped sustained fire', (definition) => {
    const weapon = makeWeapon(definition.id);
    const burst = advance(weapon, weapon.shotInterval * 2.5, FIRE, 120, true);
    const earlyBloom = weapon.currentBloom;
    expect(earlyBloom).toBeGreaterThan(0);
    expect(earlyBloom).toBeLessThan(definition.spread.maxBloom);
    const sustained = advance(weapon, 6, FIRE, 120, true);
    expect(weapon.currentBloom).toBeGreaterThan(definition.spread.maxBloom * 0.9);
    expect(weapon.currentBloom).toBeLessThanOrEqual(definition.spread.maxBloom);
    expect(last(sustained)).toBeGreaterThan(last(burst));
  });

  it('never exceeds the configured bloom maximum over a long upgraded magazine', () => {
    const weapon = makeWeapon('m60');
    weapon.setCapacityScale(2);
    const shots = advance(weapon, 8, FIRE);
    expect(shots.length).toBeGreaterThan(50);
    expect(Math.max(...shots)).toBeLessThanOrEqual(weapon.definition.spread.hipBase + weapon.definition.spread.maxBloom + 1e-8);
    expect(weapon.currentBloom).toBeCloseTo(weapon.definition.spread.maxBloom, 7);
  });

  it('recovers progressively after its configured pause, rather than resetting on release', () => {
    const weapon = makeWeapon();
    advance(weapon, 0.8, FIRE);
    const before = weapon.currentBloom;
    const delay = weapon.definition.spread.bloomRecoveryDelay ?? 0;
    expect(delay).toBeGreaterThan(weapon.shotInterval);
    advance(weapon, delay * 0.25);
    expect(weapon.currentBloom).toBeCloseTo(before, 8);
    advance(weapon, delay + before / weapon.definition.spread.bloomRecovery * 0.5);
    expect(weapon.currentBloom).toBeGreaterThan(0);
    expect(weapon.currentBloom).toBeLessThan(before);
    advance(weapon, before / weapon.definition.spread.bloomRecovery + delay);
    expect(weapon.currentBloom).toBe(0);
    expect(weapon.currentSpread()).toBeCloseTo(weapon.definition.spread.hipBase, 8);
  });

  it('keeps residual bloom when the trigger is rapidly released and pressed again', () => {
    const weapon = makeWeapon();
    advance(weapon, 0.5, FIRE);
    const before = weapon.currentBloom;
    advance(weapon, 1 / 120);
    const resumed = advance(weapon, weapon.shotInterval, FIRE);
    expect(resumed[0]).toBeGreaterThanOrEqual(weapon.definition.spread.hipBase + before - 1e-8);
    expect(weapon.currentBloom).toBeGreaterThanOrEqual(before);
  });

  it('rewards separated three-round bursts over an uninterrupted stream', () => {
    const burstWeapon = makeWeapon();
    const continuousWeapon = makeWeapon();
    const burstDuration = burstWeapon.shotInterval * 2.5;
    const restDuration = 0.45;
    let finalBurst: number[] = [];
    for (let burst = 0; burst < 4; burst++) {
      finalBurst = advance(burstWeapon, burstDuration, FIRE, 120, true);
      if (burst < 3) advance(burstWeapon, restDuration);
    }
    const continuous = advance(continuousWeapon, burstDuration * 4 + restDuration * 3, FIRE, 120, true);
    expect(last(finalBurst)).toBeLessThan(last(continuous) * 0.85);
  });

  it('does not delay recovery merely because a semi-automatic trigger remains held', () => {
    const weapon = makeWeapon();
    advance(weapon, 0.8, FIRE);
    weapon.cycleFireMode();
    advance(weapon, 1, FIRE);
    expect(weapon.currentBloom).toBe(0);
  });

  it('uses the same semi-automatic accuracy for mobile hold and desktop tapping', () => {
    const mobile = makeWeapon('m14');
    const desktop = makeWeapon('m14');
    const mobileShots: number[] = [];
    const desktopShots: number[] = [];
    const tapEveryFrames = Math.round(desktop.shotInterval * 120);
    for (let frame = 0; frame < 120; frame++) {
      mobileShots.push(...advance(mobile, 1 / 120, { ...FIRE, repeatSemiAuto: true }));
      desktopShots.push(...advance(desktop, 1 / 120, { trigger: frame % tapEveryFrames === 0, ads: false }));
    }
    expect(mobileShots.length).toBeGreaterThan(1);
    expect(mobileShots).toEqual(desktopShots);
    advance(mobile, 0.5);
    advance(desktop, 0.5);
    expect(mobile.currentBloom).toBe(0);
    expect(desktop.currentBloom).toBe(0);
  });

  it.each(['dry', 'equipping', 'reloading'] as const)('adds no dispersion while %s blocks shooting', (blocked) => {
    const weapon = makeWeapon();
    if (blocked === 'dry') {
      weapon.ammoInMagazine = 0;
      weapon.reserveAmmo = 0;
    } else if (blocked === 'equipping') weapon.equip();
    else {
      weapon.ammoInMagazine--;
      expect(weapon.reload()).toBe(true);
    }
    const spreads = advance(weapon, 0.1, FIRE);
    expect(spreads).toEqual([]);
    expect(weapon.currentBloom).toBe(0);
  });

  it('keeps capacity-upgraded weapons on the same accuracy rules', () => {
    const plain = makeWeapon();
    const forged = makeWeapon();
    forged.setCapacityScale(2);
    expect(advance(forged, 1.2, FIRE)).toEqual(advance(plain, 1.2, FIRE));
    expect(forged.currentBloom).toBe(plain.currentBloom);
    advance(forged, 0.3);
    advance(plain, 0.3);
    expect(forged.currentSpread()).toBeCloseTo(plain.currentSpread(), 8);
  });
});

describe('Per-shot accuracy snapshots', () => {
  it('fires the fresh first round before applying its own bloom and heat', () => {
    const weapon = makeWeapon('m4a1', true);
    const spreads = advance(weapon, 1 / 120, FIRE);
    expect(spreads).toEqual([weapon.definition.spread.hipBase]);
    expect(weapon.currentSpread()).toBeGreaterThan(spreads[0]);
  });

  it('retains each individual dispersion when several automatic rounds fall in one frame', () => {
    const weapon = makeWeapon();
    advance(weapon, 1 / 120, FIRE);
    const spreads = advance(weapon, weapon.shotInterval * 3, FIRE, 1);
    expect(spreads).toHaveLength(3);
    expect(spreads[0]).toBeLessThan(spreads[1]);
    expect(spreads[1]).toBeLessThan(spreads[2]);
    expect(last(spreads)).toBeLessThan(weapon.currentSpread());
  });

  it.each([30, 60])('keeps the same shot dispersion at %i FPS and 120 FPS', (fps) => {
    const definition: WeaponDefinition = { ...WEAPON_DEFINITIONS.vector, heat: undefined };
    const coarse = new Weapon(definition, () => 0.5);
    const fine = new Weapon(definition, () => 0.5);
    const coarseShots = advance(coarse, 1.2, FIRE, fps, true);
    const fineShots = advance(fine, 1.2, FIRE, 120, true);
    expect(coarseShots.length).toBe(fineShots.length);
    for (let shot = 0; shot < coarseShots.length; shot++) {
      expect(coarseShots[shot]).toBeCloseTo(fineShots[shot], 6);
    }
    expect(coarse.currentBloom).toBeCloseTo(fine.currentBloom, 6);
  });
});
