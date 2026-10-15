import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { M60_PROFILE } from '../src/weapons/M60ViewModel';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

/**
 * Contract tests for the procedural M60: real proportions traced from a
 * reference photo, a clean aperture sight picture, and the belt reload
 * driving its live parts (belt pouch, front-hinged feed cover, right-flank
 * charging handle).
 */

const definition = WEAPON_DEFINITIONS.m60;
const view = definition.view;

function fakeWeapon(state: Weapon['state'], stateProgress: number): Weapon {
  return { state, stateProgress, adsAlpha: 0, reloadType: 'empty' } as Weapon;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('M60 view model', () => {
  it('builds the dedicated machine gun with its animated assemblies', () => {
    expect(view.frame).toBe('lmg');
    expect(view.modelUrl).toBeUndefined();
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('m60-root');
    for (const name of ['stock', 'grip', 'receiver', 'cover', 'forearm', 'barrel', 'bipod', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`m60-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('m60-magazine'));
    expect(built.reloadParts?.cover).toBe(built.group.getObjectByName('m60-cover'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('m60-charging-handle'));
  });

  it('matches the real gun: 1105 mm overall, muzzle at the flash hider', () => {
    const built = buildProceduralViewModel(view);
    const size = worldBox(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(1.08);
    expect(size.z).toBeLessThan(1.13);
    expect(built.muzzlePosition.z).toBeLessThan(M60_PROFILE.flashHider.frontZ);
    expect(built.muzzlePosition.y).toBeCloseTo(0, 6);
    expect(built.ejectionPosition.x).toBeGreaterThan(0);
  });

  it('puts the front sight apex and the rear aperture on the sight line', () => {
    const built = buildProceduralViewModel(view);
    expect(built.sightY).toBeCloseTo(view.sightHeight, 6);
    const frontSight = worldBox(built.group.getObjectByName('m60-barrel')!);
    expect(frontSight.max.y).toBeCloseTo(built.sightY, 4);
    // The raised leaf frames the aperture: it rises just past the sight line.
    const leafTop = worldBox(built.group).max.y;
    expect(leafTop).toBeGreaterThan(built.sightY + M60_PROFILE.rearSightLeaf.aperture);
    expect(leafTop).toBeLessThan(built.sightY + 0.015);
  });

  it('hangs the belt pouch under the left of the receiver', () => {
    const built = buildProceduralViewModel(view);
    const pouch = worldBox(built.reloadParts!.magazine!);
    expect(pouch.getCenter(new THREE.Vector3()).x).toBeLessThan(0);
    expect(pouch.max.y).toBeGreaterThan(0);
    expect(pouch.min.y).toBeLessThan(-0.19);
  });

  it('keeps the procedural detail within a mobile-friendly budget', () => {
    const built = buildProceduralViewModel(view);
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(8500);
  });

  it('swings the feed cover open rear edge first and closes it again', () => {
    const built = buildProceduralViewModel(view);
    const cover = built.reloadParts!.cover!;
    const homeTop = worldBox(cover).max.y;
    const parts = { magazine: built.reloadParts!.magazine!, handle: built.reloadParts!.handle!, cover };
    const animator = new ReloadAnimator(view.reloadAnim!, parts, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', (anim.coverOpen! + anim.coverClose!) / 2));
    expect(worldBox(cover).max.y).toBeGreaterThan(homeTop + 0.05);
    // Standing on its front hinge, the open cover stays clear of the rear-sight leaf.
    expect(worldBox(cover).min.z).toBeGreaterThan(M60_PROFILE.rearSightLeaf.z + 0.005);
    animator.update(fakeWeapon('reloading', anim.coverClose! + 0.1));
    expect(worldBox(cover).max.y).toBeCloseTo(homeTop, 5);
  });

  it('drops the pouch left and down, then reseats it', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const home = magazine.position.clone();
    const parts = { magazine, handle: built.reloadParts!.handle!, cover: built.reloadParts!.cover! };
    const animator = new ReloadAnimator(view.reloadAnim!, parts, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', (anim.magOut + anim.magDrop) / 2));
    expect(magazine.position.x).toBeLessThan(home.x);
    expect(magazine.position.y).toBeLessThan(home.y);
    animator.update(fakeWeapon('reloading', anim.magSeat + 0.01));
    expect(magazine.position.toArray()).toEqual(home.toArray());
  });

  it('racks the right-flank charging handle along its slot and returns it', () => {
    const built = buildProceduralViewModel(view);
    const handle = built.reloadParts!.handle!;
    expect(handle.position.x).toBeGreaterThan(0);
    const homeZ = handle.position.z;
    const parts = { magazine: built.reloadParts!.magazine!, handle, cover: built.reloadParts!.cover! };
    const animator = new ReloadAnimator(view.reloadAnim!, parts, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', anim.charge + (anim.chargeEnd - anim.charge) * 0.45));
    expect(handle.position.z - homeZ).toBeGreaterThan(0.03);
    expect(handle.position.z).toBeLessThan(Math.max(...M60_PROFILE.chargingSlot.map(([z]) => z)));
    animator.update(fakeWeapon('reloading', anim.chargeEnd));
    expect(handle.position.z).toBeCloseTo(homeZ, 6);
  });

  it('builds the same M60 for world display models (Mystery Box, pickups)', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.95);
    expect(display.getObjectByName('m60-root')).toBeDefined();
    const size = worldBox(display).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x * 5);
  });
});

describe('M60 wall-buy silhouette', () => {
  it('traces the gun from the shared profile, butt to flash hider, bipod deployed', () => {
    const buy = new WallBuy({
      id: 'test-m60', weaponId: 'm60', price: 2500, ammoPrice: 1250, position: { x: 0, y: 0, z: 0 }, yaw: 0, floor: -1,
    });
    const wall = new WallBuyView(buy, definition, new THREE.Group());

    expect(wall.group.userData.silhouette).toBe('m60');
    for (const part of [
      'stock', 'grip', 'receiver', 'feed-cover', 'rear-sight', 'trigger-guard', 'pouch', 'forearm',
      'heat-shield', 'barrel', 'gas-cylinder', 'front-sight', 'flash-hider', 'bipod',
    ]) {
      expect(wall.group.getObjectByName(`m60-wall-${part}`), part).toBeDefined();
    }
    const box = worldBox(wall.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.35);
    expect(size.x).toBeLessThan(1.45);
    expect(size.y).toBeLessThan(0.62);
    // Butt at the left edge, muzzle at the right, bipod feet at the bottom.
    expect(worldBox(wall.group.getObjectByName('m60-wall-stock')!).min.x).toBeCloseTo(box.min.x, 2);
    expect(worldBox(wall.group.getObjectByName('m60-wall-flash-hider')!).max.x).toBeCloseTo(box.max.x, 2);
    let lowest = Infinity;
    wall.group.traverse((object) => {
      if (object.name === 'm60-wall-bipod') lowest = Math.min(lowest, worldBox(object).min.y);
    });
    expect(lowest).toBeCloseTo(box.min.y, 3);
  });
});
