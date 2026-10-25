import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { MagazineDropPool } from '../src/weapons/MagazineDrop';
import { ReloadAnimator, type ReloadParts } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import type { ReloadPhase } from '../src/weapons/WeaponTypes';

const DT = 1 / 240; // fine step: phases must fire exactly once each
const IDLE_INPUT = { trigger: false, ads: false };
const WEAPON_IDS = Object.keys(WEAPON_DEFINITIONS) as Array<keyof typeof WEAPON_DEFINITIONS>;

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
  it.each(WEAPON_IDS)('moves and restores the real reload component for %s', (weaponId) => {
    const { weapon, animator, parts } = makeRig(weaponId);
    weapon.ammoInMagazine = Math.min(1, weapon.definition.magazineSize - 1);
    const magazine = parts.magazine!;
    const homePosition = magazine.position.clone();
    const homeQuaternion = magazine.quaternion.clone();
    const config = weapon.definition.view.reloadAnim!;
    expect(weapon.reload()).toBe(true);

    const midDetach = (config.magOut + config.magDrop) / 2;
    step(weapon, animator, weapon.definition.tacticalReloadTime * midDetach);
    expect(
      magazine.position.distanceTo(homePosition) + magazine.quaternion.angleTo(homeQuaternion),
    ).toBeGreaterThan(0.005);

    step(weapon, animator, weapon.definition.tacticalReloadTime * (1.1 - midDetach));
    expect(magazine.visible).toBe(true);
    expect(magazine.position.distanceTo(homePosition)).toBeLessThan(1e-6);
    expect(magazine.quaternion.angleTo(homeQuaternion)).toBeLessThan(1e-6);
  });

  it('skips the action phase during a tactical reload', () => {
    const { weapon, animator, phases } = makeRig();
    expect(weapon.reload()).toBe(true);
    step(weapon, animator, weapon.definition.reloadTime + 0.1);
    expect(phases).toEqual(['magOut', 'magDrop', 'magIn', 'magSeat']);
  });

  it('works the action after the magazine swap during an empty reload', () => {
    const { weapon, animator, phases } = makeRig();
    weapon.ammoInMagazine = 0;
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

  it('strips rifle magazines down out of the well and shows the fresh one beside it before lining it up', () => {
    const anim = WEAPON_DEFINITIONS.m4a1.view.reloadAnim!;
    const rigAt = (progress: number) => {
      const rig = makeRig();
      const home = rig.parts.magazine!.position.clone();
      rig.weapon.reload();
      step(rig.weapon, rig.animator, rig.weapon.definition.tacticalReloadTime * progress);
      return { mag: rig.parts.magazine!, home };
    };

    // Drawn straight down its own axis (this test magazine stands upright).
    const outgoing = rigAt((anim.magOut + anim.magDrop) / 2);
    expect(outgoing.mag.position.y).toBeLessThan(outgoing.home.y - 0.01);
    expect(outgoing.mag.position.x).toBeCloseTo(outgoing.home.x, 5);

    // Held up beside the well, off the near flank...
    const shown = rigAt(anim.magIn + 0.4 * (anim.magSeat - anim.magIn));
    expect(shown.mag.visible).toBe(true);
    expect(shown.mag.position.x).toBeLessThan(shown.home.x - 0.03);
    expect(shown.mag.position.y).toBeLessThan(shown.home.y);

    // ...then lined up right under it before it goes in.
    const linedUp = rigAt(anim.magIn + 0.68 * (anim.magSeat - anim.magIn));
    expect(Math.abs(linedUp.mag.position.x - linedUp.home.x)).toBeLessThan(0.01);
    expect(linedUp.mag.position.y).toBeLessThan(linedUp.home.y - 0.03);
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

  it('preserves transparent cell materials while applying the final fade', () => {
    const scene = new THREE.Scene();
    const pool = new MagazineDropPool(scene);
    const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    const source = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), material);
    source.updateMatrixWorld(true);

    pool.drop(source);
    const dropped = scene.children[0].children[0] as THREE.Mesh;
    expect((dropped.material as THREE.Material).opacity).toBeCloseTo(0.4);

    pool.update(4.5);
    expect((dropped.material as THREE.Material).opacity).toBeCloseTo(0.2);
  });
});
