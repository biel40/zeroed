import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildProceduralViewModel, resolveGlbMagazinePose } from '../src/weapons/WeaponView';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';

const view = WEAPON_DEFINITIONS.m4a1.view;
const measuredM4Bounds = new THREE.Box3(
  new THREE.Vector3(-0.0281, -0.1168, -0.5865),
  new THREE.Vector3(0.0281, 0.1742, 0.2535),
);

describe('M4A1 reload model', () => {
  it('uses a dedicated classic model without a baked-in GLB magazine', () => {
    expect(view.modelUrl).toBeUndefined();
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('m4a1-root');
    for (const name of ['barrel', 'handguard', 'upper', 'lower', 'carry-handle', 'front-sight', 'grip', 'stock', 'magazine', 'charging-handle']) {
      expect(built.group.getObjectByName(`m4a1-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('m4a1-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('m4a1-charging-handle'));
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.75);
    expect(size.z).toBeLessThan(0.9);
    expect(size.x).toBeLessThan(0.1);
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(2500);
  });

  it.each(['tactical', 'empty'] as const)('has one magazine throughout a %s reload and restores it on interruption', (reloadType) => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const home = magazine.position.clone();
    const rotation = magazine.quaternion.clone();
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine, handle: built.reloadParts?.handle ?? null, cover: null }, null);
    const update = (progress: number): void => {
      animator.update({ state: 'reloading', stateProgress: progress, reloadType } as Weapon);
    };
    update(0.18);
    expect(magazine.position.y).toBeLessThan(home.y);
    update(0.3);
    expect(magazine.visible).toBe(false);
    const visibleMagazineParts: THREE.Object3D[] = [];
    built.group.traverseVisible((part) => {
      if (part.name.startsWith('m4a1-magazine')) visibleMagazineParts.push(part);
    });
    expect(visibleMagazineParts).toHaveLength(0);
    const seatedMagazineCenter = new THREE.Vector3(0, -0.095, -0.15);
    built.group.traverseVisible((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      expect(new THREE.Box3().setFromObject(part).containsPoint(seatedMagazineCenter), part.name).toBe(false);
    });
    update(0.52);
    expect(magazine.visible).toBe(true);
    expect(magazine.position.y).toBeLessThan(home.y);
    update(0.65);
    expect(magazine.position.toArray()).toEqual(home.toArray());
    expect(magazine.quaternion.toArray()).toEqual(rotation.toArray());
    animator.reset();
    update(0.3);
    animator.reset();
    expect(magazine.visible).toBe(true);
    expect(magazine.position.toArray()).toEqual(home.toArray());
    const magazines: THREE.Object3D[] = [];
    built.group.traverse((part) => {
      if (part.name === 'm4a1-magazine') magazines.push(part);
    });
    expect(magazines).toEqual([magazine]);
  });

  it('anchors the detachable magazine at the real magazine well instead of deriving it from barrel length', () => {
    const pose = resolveGlbMagazinePose(view, measuredM4Bounds, measuredM4Bounds.max.y);

    expect(view.reloadAnim?.magAnchor).toEqual([0, -0.07, -0.15]);
    expect(pose.position.toArray()).toEqual([0, -0.07, -0.15]);
    expect(pose.position.y).toBeLessThan(0);
    expect(pose.position.z).toBeGreaterThan(measuredM4Bounds.min.z * 0.45);
  });

  it('matches the slight forward rake of a seated STANAG magazine', () => {
    const pose = resolveGlbMagazinePose(view, measuredM4Bounds, measuredM4Bounds.max.y);

    expect(pose.rotation.x).toBeCloseTo(0.12, 5);
    expect(pose.rotation.y).toBe(0);
    expect(pose.rotation.z).toBe(0);
  });

  it('retains the bounds-derived fallback for GLB weapons without an explicit anchor', () => {
    const legacyView = {
      ...view,
      reloadAnim: { ...view.reloadAnim!, magAnchor: undefined, magRotation: undefined },
    };
    const pose = resolveGlbMagazinePose(legacyView, measuredM4Bounds, measuredM4Bounds.max.y);

    expect(pose.position.y).toBeCloseTo(0.1742 * 0.35 - 0.13 * 0.35, 5);
    expect(pose.position.z).toBeCloseTo(-0.5865 * 0.45, 5);
    expect(pose.rotation.x).toBe(0);
  });
});
