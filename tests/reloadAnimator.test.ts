import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { MagazineDropPool } from '../src/weapons/MagazineDrop';
import { ReloadAnimator, type ReloadParts } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import type { ReloadPhase } from '../src/weapons/WeaponTypes';

const DT = 1 / 240; // fine step: phases must fire exactly once each
const IDLE_INPUT = { trigger: false, ads: false };

function makeRig(weaponId: keyof typeof WEAPON_DEFINITIONS = 'm4a1') {
  const weapon = new Weapon(WEAPON_DEFINITIONS[weaponId]);
  weapon.ammoInMagazine = 5; // reload only starts below full
  const parts: ReloadParts = {
    magazine: new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.05)),
    handle: new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.05)),
    cover: null,
  };
  parts.magazine!.position.set(0, -0.08, -0.2);
  const scene = new THREE.Scene();
  const dropPool = new MagazineDropPool(scene);
  const animator = new ReloadAnimator(weapon.definition.view.reloadAnim!, parts, dropPool);
  const phases: ReloadPhase[] = [];
  animator.onPhase = (phase) => phases.push(phase);
  return { weapon, parts, animator, phases, dropPool };
}

function step(weapon: Weapon, animator: ReloadAnimator, seconds: number): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    weapon.update(DT, IDLE_INPUT);
    animator.update(weapon);
  }
}

describe('ReloadAnimator phases', () => {
  it('fires every phase once, in timeline order', () => {
    const { weapon, animator, phases } = makeRig();
    expect(weapon.reload()).toBe(true);
    step(weapon, animator, weapon.definition.reloadTime + 0.1);
    expect(phases).toEqual(['magOut', 'magDrop', 'magIn', 'magSeat', 'chargeStart', 'chargeEnd']);
  });

  it('hides the magazine while it is dropped and seats it by the end', () => {
    const { weapon, animator, parts } = makeRig();
    const mag = parts.magazine!;
    const homeY = mag.position.y;
    weapon.reload();
    step(weapon, animator, weapon.definition.reloadTime * 0.3); // past magDrop
    expect(mag.visible).toBe(false);
    step(weapon, animator, weapon.definition.reloadTime * 0.5); // past magSeat
    expect(mag.visible).toBe(true);
    step(weapon, animator, weapon.definition.reloadTime * 0.3); // done
    expect(mag.position.y).toBeCloseTo(homeY, 5);
    expect(weapon.state).toBe('ready');
  });

  it('drops exactly one magazine into the world pool per reload', () => {
    const { weapon, animator, dropPool } = makeRig();
    weapon.reload();
    step(weapon, animator, weapon.definition.reloadTime + 0.1);
    expect(dropPool.activeCount).toBe(1);
  });

  it('never grants ammunition before the state completes', () => {
    const { weapon, animator, phases } = makeRig();
    weapon.reload();
    // Mid-insert: the mag is visibly going in, ammo is still the old count.
    step(weapon, animator, weapon.definition.reloadTime * 0.55);
    expect(phases).toContain('magIn');
    expect(weapon.ammoInMagazine).toBe(5);
    step(weapon, animator, weapon.definition.reloadTime * 0.6);
    expect(weapon.ammoInMagazine).toBe(weapon.definition.magazineSize);
  });

  it('restores every part when the reload is interrupted by a weapon switch', () => {
    const { weapon, animator, parts } = makeRig();
    const mag = parts.magazine!;
    const homeY = mag.position.y;
    weapon.reload();
    step(weapon, animator, weapon.definition.reloadTime * 0.3); // mag dropped
    expect(mag.visible).toBe(false);
    weapon.equip(); // switching weapons cancels the reload state
    animator.update(weapon);
    expect(mag.visible).toBe(true);
    expect(mag.position.y).toBeCloseTo(homeY, 5);
    expect(animator.bodyDip).toBe(0);
    expect(weapon.ammoInMagazine).toBe(5); // no free ammo from a cancelled reload
  });
});

describe('MagazineDropPool', () => {
  it('recycles the oldest entry once the cap is reached', () => {
    const scene = new THREE.Scene();
    const pool = new MagazineDropPool(scene);
    const source = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05));
    source.updateMatrixWorld(true);
    for (let i = 0; i < 15; i++) pool.drop(source);
    expect(pool.activeCount).toBeLessThanOrEqual(12);
  });

  it('drops settle on the ground and disappear after their lifetime', () => {
    const scene = new THREE.Scene();
    const pool = new MagazineDropPool(scene);
    const source = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05));
    source.position.set(0, 1.5, 0);
    source.updateMatrixWorld(true);
    pool.drop(source);
    for (let i = 0; i < 60; i++) pool.update(1 / 60); // 1 s: fallen and settled
    expect(pool.activeCount).toBe(1);
    for (let i = 0; i < 60 * 6; i++) pool.update(1 / 60); // past the 5 s lifetime
    expect(pool.activeCount).toBe(0);
  });
});
