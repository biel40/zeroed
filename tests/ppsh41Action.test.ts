import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { HANDLE_TRAVEL } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';

const originalDocument = globalThis.document;
const DT = 1 / 1000;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '', fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

function rig(reserve: number) {
  const weapon = new Weapon(WEAPON_DEFINITIONS.ppsh41, () => 0.5, reserve);
  const view = new WeaponView(weapon.definition, null);
  const handle = view.root.getObjectByName('ppsh41-charging-handle')!;
  const home = handle.position.z;
  let shots = 0;
  const frame = (trigger = false): void => {
    weapon.update(DT, { trigger, ads: false });
    for (const event of weapon.pendingEvents) {
      if (event.type === 'shot') {
        shots++;
        view.onShot();
      }
    }
    weapon.clearEvents();
    view.update(DT, weapon, 0, 0, 0);
  };
  return { weapon, view, handle, home, frame, shots: () => shots };
}

describe('PPSh-41 firing action', () => {
  it('cycles toward the muzzle, returns to the rear sear and stays forward when exhausted', () => {
    const setup = rig(0);
    setup.frame(true);
    expect(setup.handle.position.z).toBeLessThan(setup.home - HANDLE_TRAVEL * 0.8);
    for (let frame = 0; frame < 100; frame++) setup.frame();
    expect(setup.handle.position.z).toBeCloseTo(setup.home, 6);
    setup.weapon.ammoInMagazine = 1;
    setup.frame(true);
    expect(setup.weapon.ammoInMagazine).toBe(0);
    for (let frame = 0; frame < 100; frame++) setup.frame();
    expect(setup.handle.position.z).toBeCloseTo(setup.home - HANDLE_TRAVEL, 6);
    setup.view.reset();
    setup.weapon.resetAmmo();
    setup.frame();
    expect(setup.handle.position.z).toBeCloseTo(setup.home, 6);
  });

  it('fires one 71-round drum at 900 rpm before the empty reload cocks and replenishes it', () => {
    const setup = rig(284);
    let elapsed = 0;
    while (setup.weapon.state !== 'reloading' && elapsed < 6) {
      setup.frame(true);
      elapsed += DT;
    }
    expect(setup.shots()).toBe(71);
    expect(elapsed).toBeCloseTo(70 * 60 / 900, 1);
    expect(setup.weapon.reserveAmmo).toBe(284);
    expect(setup.handle.position.z).toBeCloseTo(setup.home - HANDLE_TRAVEL, 6);
    while (setup.weapon.state === 'reloading') setup.frame();
    expect(setup.weapon.ammoInMagazine).toBe(71);
    expect(setup.weapon.reserveAmmo).toBe(213);
    expect(setup.handle.position.z).toBeCloseTo(setup.home, 6);
    expect(setup.shots()).toBe(71);
  });
});
