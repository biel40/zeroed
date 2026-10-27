import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../src/config/weapons';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { FAKEL_PROFILE } from '../src/weapons/FakelViewModel';
import { MagazineDropPool } from '../src/weapons/MagazineDrop';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, WeaponView } from '../src/weapons/WeaponView';
import type { ReloadPhase, WeaponEventType } from '../src/weapons/WeaponTypes';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';

const definition = WEAPON_DEFINITIONS.fakel;
const DT = 1 / 120;
const IDLE = { trigger: false, ads: false };
const originalDocument = globalThis.document;

// The muzzle flash textures are drawn on a canvas.
beforeAll(() => {
  const context = { createRadialGradient: () => ({ addColorStop: () => undefined }), fillStyle: '', fillRect: () => undefined };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});
const FIRE = { trigger: true, ads: false };

function ready(): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  for (let t = 0; t < definition.equipTime + 0.05; t += DT) weapon.update(DT, IDLE);
  weapon.clearEvents();
  return weapon;
}

/** Runs the weapon for `seconds`, collecting every event type in order. */
function run(weapon: Weapon, seconds: number, input: typeof IDLE, events: WeaponEventType[] = [], view?: WeaponView): WeaponEventType[] {
  for (let t = 0; t < seconds; t += DT) {
    weapon.update(DT, input);
    view?.update(DT, weapon, 0, 0, 0);
    for (const event of weapon.pendingEvents) events.push(event.type);
    weapon.clearEvents();
  }
  return events;
}

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => { if (object instanceof THREE.Mesh) count++; });
  return count;
}

describe('ФАКЕЛ-33 definition', () => {
  it('is named in Cyrillic and fires a flame stream, not bullets or energy bolts', () => {
    expect(definition.name).toBe('ФАКЕЛ-33');
    expect(definition.name).toMatch(/^[А-ЯЁ]+-33$/);
    expect(definition.flame).toBeDefined();
    expect(definition.energy).toBeUndefined();
    expect(definition.fireModes).toEqual(['auto']);
  });

  it('burns one crystal in eight seconds of fire and carries three spares', () => {
    const ticksPerSecond = definition.rpm / 60;
    expect(definition.magazineSize / ticksPerSecond).toBeCloseTo(8, 5);
    expect(definition.reserveAmmo).toBe(definition.magazineSize * 3);
    // Every reload swaps the crystal, so a tactical one is as long.
    expect(definition.tacticalReloadTime).toBe(definition.reloadTime);
  });

  it('is short ranged: nine metres against the tens of every bullet weapon', () => {
    expect(definition.flame!.range).toBe(9);
    for (const other of Object.values(WEAPON_DEFINITIONS)) {
      if (other.id === 'fakel') continue;
      expect(other.projectile.maxDistance, other.id).toBeGreaterThan(definition.flame!.range * 3);
    }
  });

  it('is exclusive to Station 33: not in the box, not in the shared preload, only in its map registry', () => {
    expect(MYSTERY_BOX_POOL.some((entry) => entry.weaponId === 'fakel')).toBe(false);
    expect(ZOMBIES_WEAPON_PRELOAD).not.toContain('fakel');
    expect(ZOMBIE_MAPS['station-33'].exclusiveWeapons).toEqual(['fakel']);
    expect(ZOMBIE_MAPS['burned-mansion'].exclusiveWeapons).toEqual([]);
    expect(new ZombiesMode('station-33').weaponIds).toContain('fakel');
    expect(new ZombiesMode('burned-mansion').weaponIds).not.toContain('fakel');
  });
});

describe('ФАКЕЛ-33 heat', () => {
  it('keeps the stream on while the trigger is held and drops it right after release', () => {
    const weapon = ready();
    run(weapon, 0.5, FIRE);
    expect(weapon.isFiring).toBe(true);
    run(weapon, 0.2, IDLE);
    expect(weapon.isFiring).toBe(false);
  });

  it('warns a second before the lockout, locks, and announces when it can fire again', () => {
    const weapon = ready();
    const events = run(weapon, 5, FIRE);
    const warning = events.indexOf('heatWarning');
    const lockout = events.indexOf('overheated');
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(lockout).toBeGreaterThan(warning);
    const shotsBetween = events.slice(warning, lockout).filter((type) => type === 'shot').length;
    expect(shotsBetween / (definition.rpm / 60)).toBeGreaterThan(0.8);
    expect(weapon.heat.overheated).toBe(true);

    // Locked: the trigger does nothing until the nozzle has cooled completely.
    const locked = run(weapon, 1, FIRE);
    expect(locked).not.toContain('shot');
    const cooling = run(weapon, definition.heat!.coolTime + definition.heat!.coolDelay! + 0.2, IDLE);
    expect(cooling).toContain('cooledDown');
    expect(weapon.heat.overheated).toBe(false);
    expect(run(weapon, 0.2, FIRE)).toContain('shot');
  });

  it('never announces a cool-down on weapons without a warning (the Barrett keeps its behaviour)', () => {
    const barrett = new Weapon(WEAPON_DEFINITIONS.barrett, () => 0.5);
    const events: WeaponEventType[] = [];
    for (let t = 0; t < 12; t += DT) {
      if (barrett.ammoInMagazine < 2) barrett.ammoInMagazine = 10;
      barrett.update(DT, { trigger: t < 4 && Math.floor(t * 8) % 2 === 0, ads: false });
      for (const event of barrett.pendingEvents) events.push(event.type);
      barrett.clearEvents();
    }
    expect(events).not.toContain('cooledDown');
    expect(events).not.toContain('heatWarning');
  });
});

describe('ФАКЕЛ-33 view model', () => {
  it('stays within its draw budget and keeps the core, cage and gauge clear of the sight line', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.name).toBe('fakel-root');
    expect(meshCount(built.group)).toBeLessThanOrEqual(42);
    built.group.updateMatrixWorld(true);
    const sightY = definition.view.sightHeight * definition.view.scale;
    for (const name of ['fakel-core-crystal', 'fakel-cage-lid', 'fakel-gauge', 'fakel-cage']) {
      const box = new THREE.Box3().setFromObject(built.group.getObjectByName(name)!);
      expect(box.max.y, name).toBeLessThan(sightY - 0.003);
      expect(box.max.x, name).toBeLessThan(-0.005);
    }
  });

  it('leaves the sight picture open between the rear blades and over the front post', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const sightY = definition.view.sightHeight * definition.view.scale;
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, sightY + 0.002, 0.5), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(built.group, true)).toHaveLength(0);
  });

  it('opens the nozzle petals with the stream, heats them, and closes them once it cools', () => {
    const weapon = ready();
    const view = new WeaponView(definition, null);
    const petal = view.root.getObjectByName('fakel-petal')!;
    view.update(DT, weapon, 0, 0, 0);
    const closed = petal.rotation.x;
    run(weapon, 3, FIRE, [], view);
    expect(petal.rotation.x).toBeGreaterThan(closed + 0.5);
    // Three quarters of the way to the redline.
    const needle = view.root.getObjectByName('fakel-gauge-needle')!;
    expect(needle.rotation.z).toBeLessThan(-0.8);
    run(weapon, 8, IDLE, [], view);
    expect(petal.rotation.x).toBeCloseTo(closed, 2);
  });

  it('puts the pilot flame out while locked and lights it again when the nozzle can fire', () => {
    const weapon = ready();
    const view = new WeaponView(definition, null);
    const pilot = view.root.getObjectByName('fakel-pilot-flame')!;
    view.update(DT, weapon, 0, 0, 0);
    expect(pilot.visible).toBe(true);
    run(weapon, 5, FIRE, [], view);
    expect(weapon.heat.overheated).toBe(true);
    expect(pilot.visible).toBe(false);
    run(weapon, 5, IDLE, [], view);
    expect(pilot.visible).toBe(true);
  });
});

describe('ФАКЕЛ-33 crystal reload', () => {
  function rig() {
    const weapon = ready();
    const built = buildProceduralViewModel(definition.view);
    const crystal = built.reloadParts!.magazine!;
    const lid = built.reloadParts!.cover!;
    const pool = new MagazineDropPool(new THREE.Scene());
    const animator = new ReloadAnimator(definition.view.reloadAnim!, { magazine: crystal, handle: null, cover: lid }, pool);
    const phases: ReloadPhase[] = [];
    animator.onPhase = (phase) => phases.push(phase);
    const step = (seconds: number): void => {
      for (let t = 0; t < seconds; t += DT) {
        weapon.update(DT, IDLE);
        animator.update(weapon);
      }
    };
    return { weapon, crystal, lid, pool, phases, step };
  }

  it('opens the cage, swaps the crystal, locks it and re-energises the core, even on a tactical reload', () => {
    const { weapon, pool, phases, step } = rig();
    weapon.ammoInMagazine = 40;
    expect(weapon.reload()).toBe(true);
    expect(weapon.reloadType).toBe('tactical');
    step(definition.reloadTime + 0.1);
    expect(phases).toEqual(['coverOpen', 'magOut', 'magDrop', 'magIn', 'magSeat', 'coverClose', 'chargeStart', 'chargeEnd']);
    expect(pool.activeCount).toBe(1);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize);
  });

  it('swings the lid open and lifts the spent crystal clear of its cage', () => {
    const { weapon, crystal, lid, step } = rig();
    const home = crystal.position.clone();
    weapon.ammoInMagazine = 0;
    weapon.reload();
    const reload = definition.view.reloadAnim!;
    step(definition.reloadTime * (reload.magOut + reload.magDrop) / 2);
    expect(lid.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(1);
    expect(crystal.position.y - home.y).toBeGreaterThan(reload.magSize[1]);
  });

  it('puts crystal and lid back home when a weapon switch interrupts the swap, granting nothing', () => {
    const { weapon, crystal, lid, step } = rig();
    const crystalHome = crystal.position.clone();
    const lidHome = lid.quaternion.clone();
    weapon.ammoInMagazine = 10;
    weapon.reload();
    step(definition.reloadTime * 0.45);
    weapon.equip();
    step(DT * 2);
    expect(crystal.visible).toBe(true);
    expect(crystal.position.distanceTo(crystalHome)).toBeLessThan(1e-6);
    expect(lid.quaternion.angleTo(lidHome)).toBeLessThan(1e-6);
    expect(weapon.ammoInMagazine).toBe(10);
  });

  it('keeps the cage and its crystal a hand away from the sleeve the support hand holds', () => {
    const crystalFront = FAKEL_PROFILE.crystal.z - FAKEL_PROFILE.crystal.length / 2;
    expect(crystalFront).toBeGreaterThan(FAKEL_PROFILE.sleeve.rearZ);
  });
});
