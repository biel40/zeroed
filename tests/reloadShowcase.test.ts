import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ViewArms } from '../src/weapons/ViewArms';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import type { ReloadPhase, ReloadStyle, WeaponId } from '../src/weapons/WeaponTypes';

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
const WEAPONS = Object.keys(WEAPON_DEFINITIONS) as WeaponId[];
const styleOf = (id: WeaponId): ReloadStyle => WEAPON_DEFINITIONS[id].view.reloadAnim!.style;
/** Detachable magazines the hand swaps in front of the eye. */
const SWAPPED = WEAPONS.filter((id) => ['pistol', 'rifle', 'rock', 'bolt'].includes(styleOf(id)));
/** Actions let go at the rear that slam home on their own spring. */
const SPRING_LOADED = WEAPONS.filter((id) => ['pistol', 'rifle', 'rock', 'belt'].includes(styleOf(id)));

const descends = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
};
const shown = (object: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};

/** A weapon view and the arms holding it, seen by a 75° camera at the origin. */
function rig(id: WeaponId) {
  const definition = WEAPON_DEFINITIONS[id];
  const weapon = new Weapon(definition, () => 0.5);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 100);
  const view = new WeaponView(definition, null);
  view.root.visible = true;
  const arms = new ViewArms();
  camera.add(view.root, arms.root);
  const frame = (): void => {
    weapon.update(DT, { trigger: false, ads: false });
    view.update(DT, weapon, 0, 0, 0);
    arms.update(DT, view, null);
    camera.updateMatrixWorld(true);
  };
  return { definition, weapon, camera, view, arms, frame };
}

/** Share of a magazine's camera-facing surface that is on screen and not hidden by the weapon or the hands. */
function visibleShare({ camera, view, arms }: ReturnType<typeof rig>, magazine: THREE.Object3D, bounds: THREE.Box3): number {
  const raycaster = new THREE.Raycaster();
  const size = bounds.getSize(new THREE.Vector3());
  const facing = magazine.getWorldQuaternion(new THREE.Quaternion());
  let seen = 0;
  let total = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const normal = new THREE.Vector3().setComponent(axis, sign).applyQuaternion(facing);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const local = new THREE.Vector3();
          local.setComponent(axis, sign < 0 ? bounds.min.getComponent(axis) - 0.0005 : bounds.max.getComponent(axis) + 0.0005);
          for (const [other, f] of [[(axis + 1) % 3, i], [(axis + 2) % 3, j]] as const) {
            local.setComponent(other, bounds.min.getComponent(other) + (size.getComponent(other) * (f + 0.5)) / 3);
          }
          const point = magazine.localToWorld(local);
          if (normal.dot(point.clone().negate().normalize()) < 0.05) continue;
          total++;
          const ndc = point.clone().project(camera);
          if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
          raycaster.set(new THREE.Vector3(), point.clone().normalize());
          const first = raycaster.intersectObjects([view.root, arms.root], true).find((hit) => shown(hit.object));
          if (!first || first.distance > point.length() - 0.002 || descends(first.object, magazine)) seen++;
        }
      }
    }
  }
  return total > 0 ? seen / total : 0;
}

/** Bounds of a part in its own frame. */
function localBounds(part: THREE.Object3D): THREE.Box3 {
  part.updateWorldMatrix(true, true);
  const toPart = part.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  part.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toPart.clone().multiply(mesh.matrixWorld)));
  });
  return bounds;
}

describe('Reload showcase', () => {
  it.each(SWAPPED)('%s: turns the swap to the eye and shows each magazine whole, clear of the hands and the weapon', (id) => {
    const setup = rig(id);
    const anim = setup.definition.view.reloadAnim!;
    const style = anim.style;
    const magazine = setup.view.root.getObjectByName(`${id}-magazine`)!;
    const bounds = localBounds(magazine);
    const nearFlank = (): number => {
      const flank = new THREE.Vector3(-1, 0, 0).applyQuaternion(setup.view.root.getWorldQuaternion(new THREE.Quaternion()));
      return flank.dot(setup.view.root.getWorldPosition(new THREE.Vector3()).negate().normalize());
    };
    setup.frame();
    const restingFlank = nearFlank();
    setup.weapon.ammoInMagazine = 0;
    expect(setup.weapon.reload()).toBe(true);

    // The fresh magazine is held up to the eye a beat before it is lined up.
    const showFrom = style === 'bolt' ? 0.1 : 0.3;
    const showTo = style === 'bolt' ? 0.4 : 0.5;
    let droppingBest = 0;
    let showingWorst = 1;
    for (let index = 0; setup.weapon.state === 'reloading'; index++) {
      setup.frame();
      const p = setup.weapon.stateProgress;
      const t = (p - anim.magIn) / (anim.magSeat - anim.magIn);
      if (p > anim.magOut + 0.02 && p < anim.magSeat - 0.02) expect(nearFlank(), `p=${p}`).toBeGreaterThan(restingFlank + 0.15);
      if (index % 6 !== 0) continue;
      if (p > anim.magOut && p < anim.magDrop) droppingBest = Math.max(droppingBest, visibleShare(setup, magazine, bounds));
      if (t > showFrom && t < showTo) showingWorst = Math.min(showingWorst, visibleShare(setup, magazine, bounds));
    }
    expect(droppingBest).toBeGreaterThan(0.85);
    expect(showingWorst).toBeGreaterThan(0.85);
  });

  it.each(SPRING_LOADED)('%s: fires the action foley on the frame the handle slams home', (id) => {
    const setup = rig(id);
    const handle = setup.view.root.getObjectByName(`${id}-${id === 'm1911' ? 'slide' : 'charging-handle'}`)!;
    const home = handle.position.clone();
    let handleAtChargeEnd: THREE.Vector3 | null = null;
    let fired = false;
    setup.view.onReloadPhase = (phase: ReloadPhase) => {
      if (phase === 'chargeEnd') fired = true;
    };
    setup.weapon.ammoInMagazine = 0;
    setup.weapon.reload();
    let wasOut = false;
    while (setup.weapon.state === 'reloading' && handleAtChargeEnd === null) {
      setup.frame();
      if (setup.weapon.stateProgress > setup.definition.view.reloadAnim!.charge && handle.position.distanceTo(home) > 0.01) wasOut = true;
      if (fired) handleAtChargeEnd = handle.position.clone();
    }
    expect(wasOut).toBe(true);
    expect(handleAtChargeEnd!.distanceTo(home)).toBeLessThan(1e-6);
    // Fired on the impact, well before the hand has finished easing off.
    expect(setup.weapon.stateProgress).toBeLessThan(setup.definition.view.reloadAnim!.chargeEnd);
  });

  it('slams the M60 feed cover shut on its foley', () => {
    const setup = rig('m60');
    const cover = setup.view.root.getObjectByName('m60-cover')!;
    const closed = cover.quaternion.clone();
    let openSeen = false;
    let closedOnFoley: number | null = null;
    setup.view.onReloadPhase = (phase: ReloadPhase) => {
      if (phase === 'coverClose') closedOnFoley = cover.quaternion.angleTo(closed);
    };
    setup.weapon.ammoInMagazine = 0;
    setup.weapon.reload();
    while (setup.weapon.state === 'reloading' && closedOnFoley === null) {
      setup.frame();
      if (cover.quaternion.angleTo(closed) > 1) openSeen = true;
    }
    setup.frame();
    expect(openSeen).toBe(true);
    expect(cover.quaternion.angleTo(closed)).toBeLessThan(1e-6);
  });

  it.each(WEAPONS)('%s: springs back to the exact hip pose after an empty and a tactical reload', (id) => {
    for (const ammo of [0, 1]) {
      const setup = rig(id);
      setup.frame();
      const hip = setup.view.root.position.clone();
      setup.weapon.ammoInMagazine = ammo;
      expect(setup.weapon.reload()).toBe(true);
      while (setup.weapon.state === 'reloading') setup.frame();
      setup.frame();
      expect(setup.view.root.position.distanceTo(hip)).toBeLessThan(1e-6);
      expect(setup.view.root.rotation.x).toBeCloseTo(0, 6);
      expect(setup.view.root.rotation.y).toBeCloseTo(0, 6);
      expect(setup.view.root.rotation.z).toBeCloseTo(0, 6);
    }
  });
});
