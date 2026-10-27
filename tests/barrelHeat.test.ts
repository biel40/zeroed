import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { BarrelHeat } from '../src/weapons/BarrelHeat';
import { PPSH41_PROFILE } from '../src/weapons/PPSH41ViewModel';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import type { WeaponDefinition } from '../src/weapons/WeaponTypes';

const DT = 1 / 120;
const ALL = Object.values(WEAPON_DEFINITIONS) as WeaponDefinition[];
/** Semi-automatics whose barrel redlines and locks the trigger. */
const SEMI_AUTO_LOCKOUT: readonly string[] = ['barrett'];
const originalDocument = globalThis.document;

// The muzzle flash textures are drawn on a canvas.
beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

/** Holds the trigger for `seconds`, topping the magazine up so it never reloads. */
function holdTrigger(weapon: Weapon, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    weapon.ammoInMagazine = weapon.definition.magazineSize;
    weapon.update(DT, { trigger: true, ads: false });
    weapon.clearEvents();
  }
}

function rest(weapon: Weapon, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) weapon.update(DT, { trigger: false, ads: false });
}

function findGlow(view: WeaponView): THREE.Mesh | undefined {
  return view.root.getObjectByName('barrel-heat-glow') as THREE.Mesh | undefined;
}

describe('Barrel overheating', () => {
  it('is configured on every automatic weapon and the lockout semi-autos, nowhere else', () => {
    for (const definition of ALL) {
      const heated = definition.fireModes.includes('auto') || SEMI_AUTO_LOCKOUT.includes(definition.id);
      expect(definition.heat !== undefined, definition.id).toBe(heated);
    }
  });

  it('stays cold through short bursts and only shows under sustained fire', () => {
    const heat = new BarrelHeat(WEAPON_DEFINITIONS.m4a1.heat);
    for (let i = 0; i < 5; i++) heat.onShot();
    expect(heat.intensity).toBe(0);
    expect(heat.spreadBonus).toBe(0);
    for (let i = 0; i < 60; i++) heat.onShot();
    expect(heat.level).toBe(1);
    expect(heat.intensity).toBe(1);
    expect(heat.spreadBonus).toBeCloseTo(WEAPON_DEFINITIONS.m4a1.heat!.maxSpreadBonus, 6);
  });

  it('a weapon without a heat config never heats', () => {
    const heat = new BarrelHeat(undefined);
    for (let i = 0; i < 200; i++) heat.onShot();
    expect(heat.level).toBe(0);
    expect(heat.spreadBonus).toBe(0);
  });

  it('grows the spread of a weapon held on full auto and cools back once released', () => {
    const m4 = new Weapon(WEAPON_DEFINITIONS.m4a1, () => 0.5);
    rest(m4, m4.definition.equipTime + 0.1);
    holdTrigger(m4, 0.5);
    const shortBurstSpread = m4.currentSpread();
    holdTrigger(m4, 6);
    expect(m4.heat.intensity).toBe(1);
    expect(m4.currentSpread()).toBeGreaterThan(shortBurstSpread);
    rest(m4, m4.definition.heat!.coolTime + 0.5);
    expect(m4.heat.level).toBe(0);
  });

  it('starts every weapon cold after equip and ammo reset', () => {
    const ak = new Weapon(WEAPON_DEFINITIONS.ak47, () => 0.5);
    rest(ak, ak.definition.equipTime + 0.1);
    holdTrigger(ak, 6);
    expect(ak.heat.level).toBeGreaterThan(0.9);
    ak.equip();
    expect(ak.heat.level).toBe(0);
    rest(ak, ak.definition.equipTime + 0.1);
    holdTrigger(ak, 6);
    ak.resetAmmo();
    expect(ak.heat.level).toBe(0);
  });

  it('lights the barrel tip glow of the view model only while overheated', () => {
    const definition = WEAPON_DEFINITIONS.m4a1;
    const weapon = new Weapon(definition, () => 0.5);
    const view = new WeaponView(definition, null);
    const glow = findGlow(view);
    expect(glow).toBeDefined();
    view.update(DT, weapon, 0, 0, 0);
    expect(glow!.visible).toBe(false);
    rest(weapon, definition.equipTime + 0.1);
    holdTrigger(weapon, 6);
    view.update(DT, weapon, 0, 0, 0);
    expect(glow!.visible).toBe(true);
    // The sleeve hugs the muzzle: it starts at the crown and runs back along the barrel.
    glow!.geometry.computeBoundingBox();
    expect(glow!.geometry.boundingBox!.min.z).toBeCloseTo(0, 6);
    expect(glow!.geometry.boundingBox!.max.z).toBeGreaterThan(0);
  });

  it('shows within a second and a half of full auto on every automatic', () => {
    for (const definition of ALL.filter((d) => d.heat && d.fireModes.includes('auto'))) {
      const weapon = new Weapon(definition, () => 0.5);
      rest(weapon, definition.equipTime + 0.1);
      holdTrigger(weapon, 1.5);
      expect(weapon.heat.intensity, definition.id).toBeGreaterThan(0);
    }
  });

  it('wraps the PPSh-41 jacket nose, where its hidden barrel would not show', () => {
    const glow = findGlow(new WeaponView(WEAPON_DEFINITIONS.ppsh41, null))!;
    glow.geometry.computeBoundingBox();
    const box = glow.geometry.boundingBox!;
    expect(box.max.x).toBeGreaterThan(PPSH41_PROFILE.shroud.width / 2);
    expect(box.max.y).toBeGreaterThan(PPSH41_PROFILE.shroud.topY);
    // ...without reaching the sight line.
    expect(box.max.y).toBeLessThan(WEAPON_DEFINITIONS.ppsh41.view.sightHeight);
  });

  it('glows on the Barrett, whose four rapid rounds redline the barrel', () => {
    expect(findGlow(new WeaponView(WEAPON_DEFINITIONS.barrett, null))).toBeDefined();
  });

  it('semi-automatic and energy weapons have no barrel glow', () => {
    for (const id of ['m1911', 'l96', 'raygun', 'tesla'] as const) {
      expect(findGlow(new WeaponView(WEAPON_DEFINITIONS[id], null)), id).toBeUndefined();
    }
  });
});
