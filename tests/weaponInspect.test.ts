import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { checksMagazine, INSPECT_TIMELINE } from '../src/weapons/InspectAnimator';
import { ViewArms } from '../src/weapons/ViewArms';
import { INSPECT_TIME, Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import type { ReloadPhase, WeaponId } from '../src/weapons/WeaponTypes';

const originalDocument = globalThis.document;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

const DT = 1 / 120;
const IDLE = { trigger: false, ads: false };
const WEAPONS = Object.keys(WEAPON_DEFINITIONS) as WeaponId[];
/** Detachable box, drum and pistol magazines: their inspection draws the magazine to show its rounds. */
const CHECKED = WEAPONS.filter((id) => checksMagazine(WEAPON_DEFINITIONS[id].view.reloadAnim ?? null));

const shown = (object: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};
const descends = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
};

function rig(id: WeaponId) {
  const definition = WEAPON_DEFINITIONS[id];
  const weapon = new Weapon(definition, () => 0.5);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 100);
  const view = new WeaponView(definition, null);
  view.root.visible = true;
  const arms = new ViewArms();
  camera.add(view.root, arms.root);
  const frame = (): void => {
    weapon.update(DT, IDLE);
    view.update(DT, weapon, 0, 0, 0);
    arms.update(DT, view, null);
    camera.updateMatrixWorld(true);
  };
  const advanceTo = (progress: number): void => {
    while ((weapon.inspectProgress ?? 1) < progress) frame();
  };
  return { definition, weapon, camera, view, arms, frame, advanceTo };
}

/** Share of points along a cartridge that are on screen and not hidden by the weapon or the hands. */
function roundVisibleShare({ camera, view, arms }: ReturnType<typeof rig>, round: THREE.Object3D): number {
  const raycaster = new THREE.Raycaster();
  let seen = 0;
  const samples = 5;
  round.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(round);
  const center = bounds.getCenter(new THREE.Vector3());
  const length = bounds.getSize(new THREE.Vector3()).length();
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(round.getWorldQuaternion(new THREE.Quaternion()));
  for (let i = 0; i < samples; i++) {
    // Points along the cartridge, pulled a hair off its surface toward the camera.
    const point = center.clone().addScaledVector(axis, (i / (samples - 1) - 0.5) * length * 0.7);
    point.addScaledVector(point.clone().normalize(), -0.004);
    const ndc = point.clone().project(camera);
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
    raycaster.set(new THREE.Vector3(), point.clone().normalize());
    const first = raycaster.intersectObjects([view.root, arms.root], true).find((hit) => shown(hit.object));
    if (!first || first.distance > point.length() - 0.001 || descends(first.object, round)) seen++;
  }
  return seen / samples;
}

describe('Weapon inspection logic', () => {
  const definition = WEAPON_DEFINITIONS.m4a1;

  it('runs for INSPECT_TIME from a ready, unaimed weapon without touching its ammo', () => {
    const weapon = new Weapon(definition, () => 0.5);
    weapon.ammoInMagazine = 17;
    expect(weapon.inspect()).toBe(true);
    expect(weapon.inspect()).toBe(false);
    weapon.update(INSPECT_TIME / 2, IDLE);
    expect(weapon.inspectProgress).toBeCloseTo(0.5, 5);
    weapon.update(INSPECT_TIME / 2 + 0.01, IDLE);
    expect(weapon.inspectProgress).toBeNull();
    expect(weapon.ammoInMagazine).toBe(17);
    expect(weapon.state).toBe('ready');
  });

  it('refuses to start while reloading, equipping or aiming', () => {
    const weapon = new Weapon(definition, () => 0.5);
    weapon.equip();
    expect(weapon.inspect()).toBe(false);
    weapon.update(definition.equipTime + 0.01, IDLE);
    weapon.update(0.05, { trigger: false, ads: true });
    expect(weapon.inspect()).toBe(false);
    weapon.update(1, IDLE);
    weapon.ammoInMagazine = 3;
    weapon.reload();
    expect(weapon.inspect()).toBe(false);
  });

  it('is interrupted by the trigger without delaying the shot', () => {
    const weapon = new Weapon(definition, () => 0.5);
    weapon.inspect();
    weapon.update(0.5, IDLE);
    weapon.update(DT, { trigger: true, ads: false });
    expect(weapon.inspectProgress).toBeNull();
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize - 1);
  });

  it('is interrupted by aiming, reloading, equipping and cancelInspect', () => {
    const interruptions: Array<(weapon: Weapon) => void> = [
      (weapon) => weapon.update(DT, { trigger: false, ads: true }),
      (weapon) => { weapon.ammoInMagazine = 1; weapon.reload(); },
      (weapon) => weapon.equip(),
      (weapon) => weapon.cancelInspect(),
    ];
    for (const interrupt of interruptions) {
      const weapon = new Weapon(definition, () => 0.5);
      weapon.inspect();
      weapon.update(0.5, IDLE);
      interrupt(weapon);
      expect(weapon.inspectProgress).toBeNull();
    }
  });
});

describe('Weapon inspection view', () => {
  it('covers every rifle, SMG and pistol with a detachable box, drum or pistol magazine', () => {
    expect(CHECKED).toEqual(expect.arrayContaining(['m4a1', 'mp5', 'vector', 'ppsh41', 'ak47', 'barrett', 'm1911']));
  });

  it.each(CHECKED)('%s: draws the magazine and shows its top rounds clear of the weapon and the hands', (id) => {
    const setup = rig(id);
    const magazine = setup.view.root.getObjectByName(`${id}-magazine`)!;
    const rounds = setup.view.root.getObjectByName(`${id}-magazine-rounds`)!;
    expect(rounds.parent).toBe(magazine);
    setup.frame();
    const home = magazine.position.clone();
    // Seated, the rounds are not drawn, and even drawn the top one would sit hidden inside the receiver.
    const topRound = rounds.children[0];
    expect(rounds.visible).toBe(false);
    rounds.visible = true;
    expect(roundVisibleShare(setup, topRound)).toBeLessThan(0.2);
    rounds.visible = false;

    expect(setup.weapon.inspect()).toBe(true);
    const T = INSPECT_TIMELINE;
    setup.advanceTo((T.magClear + T.magIn) / 2);
    expect(magazine.position.distanceTo(home)).toBeGreaterThan(0.02);
    expect(rounds.children.filter(shown).length).toBe(Math.min(rounds.children.length, setup.weapon.ammoInMagazine));
    expect(roundVisibleShare(setup, topRound)).toBeGreaterThan(0.6);

    setup.advanceTo(T.homeFrom);
    expect(magazine.position.distanceTo(home)).toBeLessThan(1e-6);
    setup.advanceTo(1);
    for (let i = 0; i < 30; i++) setup.frame();
    expect(setup.view.root.rotation.y).toBeCloseTo(0, 3);
  });

  it('shows only the rounds the inspected magazine still carries', () => {
    const setup = rig('ak47');
    const rounds = setup.view.root.getObjectByName('ak47-magazine-rounds')!;
    const count = (): number => (rounds.visible ? rounds.children.filter((round) => round.visible).length : 0);
    setup.weapon.inspect();
    for (const [ammo, expected] of [[30, 2], [1, 1], [0, 0]] as const) {
      setup.weapon.ammoInMagazine = ammo;
      setup.frame();
      expect(count(), `ammo ${ammo}`).toBe(expected);
    }
    setup.advanceTo(1);
    setup.weapon.ammoInMagazine = 30;
    setup.frame();
    expect(count()).toBe(0);
  });

  it('keeps the old magazine rounds on a tactical reload and fills the fresh one', () => {
    const setup = rig('m4a1');
    const anim = setup.definition.view.reloadAnim!;
    const rounds = setup.view.root.getObjectByName('m4a1-magazine-rounds')!;
    setup.weapon.ammoInMagazine = 1;
    setup.weapon.reload();
    while (setup.weapon.stateProgress < (anim.magOut + anim.magDrop) / 2) setup.frame();
    expect(rounds.children.filter(shown).length).toBe(1);
    while (setup.weapon.stateProgress < (anim.magIn + anim.magSeat) / 2) setup.frame();
    expect(rounds.children.filter(shown).length).toBe(2);
  });

  it('plays the magazine foley once per beat and seats the magazine when interrupted', () => {
    const setup = rig('mp5');
    const magazine = setup.view.root.getObjectByName('mp5-magazine')!;
    setup.frame();
    const home = magazine.position.clone();
    const phases: ReloadPhase[] = [];
    setup.view.onReloadPhase = (phase) => phases.push(phase);
    setup.weapon.inspect();
    setup.advanceTo(1);
    expect(phases).toEqual(['magOut', 'magIn', 'magSeat']);

    setup.frame();
    setup.weapon.inspect();
    setup.advanceTo(INSPECT_TIMELINE.magClear);
    expect(magazine.position.distanceTo(home)).toBeGreaterThan(0.02);
    const raised = setup.view.root.rotation.y;
    setup.weapon.update(DT, { trigger: true, ads: false });
    setup.view.update(DT, setup.weapon, 0, 0, 0);
    expect(magazine.position.distanceTo(home)).toBeLessThan(1e-6);
    // The pose is let go quickly rather than snapped.
    expect(Math.abs(setup.view.root.rotation.y)).toBeGreaterThan(0);
    expect(Math.abs(setup.view.root.rotation.y)).toBeLessThan(Math.abs(raised));
    for (let i = 0; i < 60; i++) setup.frame();
    expect(setup.view.root.rotation.y).toBeCloseTo(0, 3);
  });

  it('turns weapons without a magazine check without moving their magazine', () => {
    const setup = rig('l96');
    const magazine = setup.view.root.getObjectByName('l96-magazine')!;
    setup.frame();
    const home = magazine.position.clone();
    setup.weapon.inspect();
    setup.advanceTo(0.3);
    expect(Math.abs(setup.view.root.rotation.y)).toBeGreaterThan(0.2);
    setup.advanceTo(0.7);
    expect(magazine.position.distanceTo(home)).toBeLessThan(1e-6);
  });
});
