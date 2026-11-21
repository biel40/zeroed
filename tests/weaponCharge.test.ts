import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponEventType, WeaponFrameInput } from '../src/weapons/WeaponTypes';

const definition = WEAPON_DEFINITIONS.exhalis;
const FULL = definition.charge!.fullSeconds;
const DT = 1 / 120;
const IDLE: WeaponFrameInput = { trigger: false, ads: false };
const HOLD: WeaponFrameInput = { trigger: true, ads: false };
/** A touch fire button held down: it also asks semi-automatic weapons to repeat. */
const TOUCH_HOLD: WeaponFrameInput = { trigger: true, ads: false, repeatSemiAuto: true };

interface Run {
  readonly shots: number;
  readonly events: WeaponEventType[];
}

function ready(): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  run(weapon, definition.equipTime + 0.05, IDLE);
  return weapon;
}

function run(weapon: Weapon, seconds: number, input: WeaponFrameInput): Run {
  const events: WeaponEventType[] = [];
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let step = 0; step < steps; step++) {
    weapon.update(DT, input);
    for (const event of weapon.pendingEvents) events.push(event.type);
    weapon.clearEvents();
  }
  return { shots: events.filter((type) => type === 'shot').length, events };
}

/** Holds the trigger for `seconds` and releases it once. */
function draw(weapon: Weapon, seconds: number, hold = HOLD): Run {
  const held = run(weapon, seconds, hold);
  const released = run(weapon, DT, IDLE);
  return { shots: held.shots + released.shots, events: [...held.events, ...released.events] };
}

describe('EXHALIS hold-to-draw shot', () => {
  it('looses a normal shot on a quick tap, on the release', () => {
    const weapon = ready();
    const pressed = run(weapon, DT, HOLD);
    expect(pressed.shots).toBe(0);
    expect(weapon.isCharging).toBe(true);
    expect(run(weapon, DT, IDLE).shots).toBe(1);
    expect(weapon.lastShotCharge).toBe(0);
    expect(weapon.isCharging).toBe(false);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize - 1);
  });

  it('charges continuously while held and looses the charge reached', () => {
    const weapon = ready();
    run(weapon, DT, HOLD);
    run(weapon, FULL * 0.3, HOLD);
    expect(weapon.chargeLevel).toBeCloseTo(0.3, 2);
    run(weapon, FULL * 0.3, HOLD);
    expect(weapon.chargeLevel).toBeCloseTo(0.6, 2);
    expect(run(weapon, DT, IDLE).shots).toBe(1);
    expect(weapon.lastShotCharge).toBeCloseTo(0.6, 2);
    expect(weapon.chargeLevel).toBe(0);
  });

  it('caps the charge at full, announcing the draw and the full draw once each', () => {
    const weapon = ready();
    const held = run(weapon, FULL * 3, HOLD);
    expect(weapon.chargeLevel).toBe(1);
    expect(held.events.filter((type) => type === 'chargeStart')).toHaveLength(1);
    expect(held.events.filter((type) => type === 'chargeFull')).toHaveLength(1);
    expect(run(weapon, DT, IDLE).shots).toBe(1);
    expect(weapon.lastShotCharge).toBe(1);
  });

  it('never fires while held, even when a touch button asks semi-automatics to repeat', () => {
    const weapon = ready();
    expect(run(weapon, 4, TOUCH_HOLD).shots).toBe(0);
    expect(run(weapon, DT, IDLE).shots).toBe(1);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize - 1);
  });

  it('spends exactly one breath per release, whatever the charge', () => {
    const weapon = ready();
    let shots = 0;
    for (const seconds of [DT, FULL * 0.5, FULL * 2]) {
      shots += draw(weapon, seconds).shots;
      run(weapon, weapon.shotInterval + 0.05, IDLE);
    }
    expect(shots).toBe(3);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize - 3);
  });

  it('keeps a press during the recovery, drawing only once the bow is ready again', () => {
    const weapon = ready();
    draw(weapon, DT);
    // Pressed again at once and held through the rest of the recovery.
    run(weapon, weapon.shotInterval * 0.5, HOLD);
    expect(weapon.isCharging).toBe(true);
    expect(weapon.chargeLevel).toBe(0);
    run(weapon, weapon.shotInterval * 0.5 + FULL * 0.5, HOLD);
    expect(weapon.chargeLevel).toBeGreaterThan(0.4);
    expect(weapon.chargeLevel).toBeLessThan(0.55);
    expect(run(weapon, DT, IDLE).shots).toBe(1);
  });

  it('drops a press released before the bow recovered, as a semi-automatic would', () => {
    const weapon = ready();
    draw(weapon, DT);
    expect(draw(weapon, weapon.shotInterval * 0.3).shots).toBe(0);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize - 1);
  });

  it('a long draw banks no time: the next shot still waits a full interval', () => {
    const weapon = ready();
    run(weapon, FULL * 2, HOLD);
    run(weapon, DT, IDLE);
    expect(draw(weapon, DT).shots).toBe(0);
    run(weapon, weapon.shotInterval, IDLE);
    expect(draw(weapon, DT).shots).toBe(1);
  });

  it('clicks dry on an empty bow instead of drawing', () => {
    const weapon = ready();
    weapon.ammoInMagazine = 0;
    weapon.reserveAmmo = 0;
    const held = run(weapon, FULL, HOLD);
    expect(held.events).toContain('dryFire');
    expect(weapon.isCharging).toBe(false);
    expect(run(weapon, DT, IDLE).shots).toBe(0);
  });

  it('a reload interrupts the draw: no shot on release, no breath spent', () => {
    const weapon = ready();
    weapon.ammoInMagazine = 2;
    run(weapon, FULL * 0.5, HOLD);
    expect(weapon.reload()).toBe(true);
    run(weapon, DT, HOLD);
    expect(weapon.isCharging).toBe(false);
    expect(run(weapon, DT, IDLE).shots).toBe(0);
    expect(weapon.state).toBe('reloading');
    expect(weapon.ammoInMagazine).toBe(2);
  });

  it('a restart drops the draw', () => {
    const weapon = ready();
    run(weapon, FULL * 0.5, HOLD);
    weapon.resetAmmo();
    expect(weapon.isCharging).toBe(false);
    expect(weapon.chargeLevel).toBe(0);
    expect(weapon.lastShotCharge).toBe(0);
  });

  it('a weapon switch or a cancel (pause, menu, knife) drops the draw and needs a fresh press', () => {
    for (const interrupt of [
      (weapon: Weapon): void => weapon.equip(),
      (weapon: Weapon): void => weapon.cancelCharge(),
    ]) {
      const weapon = ready();
      run(weapon, FULL * 0.5, HOLD);
      interrupt(weapon);
      expect(weapon.isCharging).toBe(false);
      expect(weapon.chargeLevel).toBe(0);
      // Still held through the interruption: nothing draws until the trigger is pressed again.
      expect(run(weapon, definition.equipTime + FULL, HOLD).shots).toBe(0);
      expect(weapon.isCharging).toBe(false);
      expect(run(weapon, DT, IDLE).shots).toBe(0);
      expect(draw(weapon, DT).shots).toBe(1);
    }
  });

  it('leaves weapons without a draw firing on the press', () => {
    const pistol = new Weapon(WEAPON_DEFINITIONS.m1911, () => 0.5);
    run(pistol, WEAPON_DEFINITIONS.m1911.equipTime + 0.05, IDLE);
    expect(run(pistol, DT, HOLD).shots).toBe(1);
    expect(pistol.chargeLevel).toBe(0);
    expect(pistol.isCharging).toBe(false);
    expect(pistol.lastShotCharge).toBe(0);
  });
});
