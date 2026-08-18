import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildProceduralViewModel } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const definition = WEAPON_DEFINITIONS.m1911;

function namedMeshes(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const matches: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name === name) matches.push(object);
  });
  return matches;
}

describe('M1911 first-person model', () => {
  it('uses a dedicated pistol frame and a camera pose that does not magnify it like a rifle', () => {
    expect(definition.view.frame).toBe('pistol');
    expect(definition.view.hip[2]).toBeLessThanOrEqual(-0.45);
    expect(definition.view.ads[2]).toBeLessThanOrEqual(-0.34);
  });

  it('keeps the signature slide, grip panels, trigger guard and animated magazine', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.getObjectByName('m1911-slide')).toBeTruthy();
    expect(namedMeshes(built.group, 'm1911-walnut-grip-panel')).toHaveLength(2);
    expect(namedMeshes(built.group, 'm1911-trigger-guard')).toHaveLength(2);
    expect(built.reloadParts?.magazine).toBeTruthy();
    expect(built.reloadParts?.handle).toBe(built.slide);
  });

  it('uses shallow side serrations instead of full-width blocks across the sight picture', () => {
    const built = buildProceduralViewModel(definition.view);
    const serrations = namedMeshes(built.group, 'm1911-slide-serration');
    expect(serrations).toHaveLength(10);
    for (const serration of serrations) {
      const size = new THREE.Box3().setFromObject(serration).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(0.005);
      expect(Math.abs(serration.position.x)).toBeGreaterThan(0.015);
    }
  });
});

describe('M1911 wall-buy silhouette', () => {
  it('renders a compact pistol profile instead of the generic long-gun template', () => {
    const parent = new THREE.Group();
    const buy = new WallBuy({
      id: 'test-m1911',
      weaponId: 'm1911',
      price: 500,
      ammoPrice: 250,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      floor: 0,
    });
    const view = new WallBuyView(buy, definition, parent);
    const size = new THREE.Box3().setFromObject(view.group).getSize(new THREE.Vector3());

    expect(view.group.userData.silhouette).toBe('pistol');
    expect(view.group.getObjectByName('pistol-slide')).toBeTruthy();
    expect(view.group.getObjectByName('pistol-grip')).toBeTruthy();
    expect(namedMeshes(view.group, 'pistol-trigger-guard')).toHaveLength(3);
    expect(size.x).toBeLessThan(1);
    expect(size.y).toBeGreaterThan(0.45);
    expect(parent.children).toContain(view.group);
  });
});
