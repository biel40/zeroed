import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { resolveGlbMagazinePose } from '../src/weapons/WeaponView';

const view = WEAPON_DEFINITIONS.m4a1.view;
const measuredM4Bounds = new THREE.Box3(
  new THREE.Vector3(-0.0281, -0.1168, -0.5865),
  new THREE.Vector3(0.0281, 0.1742, 0.2535),
);

describe('M4A1 reload model', () => {
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
