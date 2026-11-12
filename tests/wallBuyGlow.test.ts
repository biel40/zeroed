import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildGrenadeWallBuy } from '../src/zombies/maps/shared/GrenadeWallBuy';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WALL_BUY_OUTLINE_MATERIAL, WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const BUY = new WallBuy({
  id: 'test-outline', weaponId: 'm1911', price: 500, ammoPrice: 250,
  position: { x: 0, y: 1.5, z: 0 }, yaw: 0, floor: 0,
});

function outline(advancedRendering = false): WallBuyView {
  return new WallBuyView(BUY, WEAPON_DEFINITIONS.m1911, new THREE.Group(), advancedRendering);
}

function materialOf(root: THREE.Object3D): THREE.MeshStandardMaterial {
  let material: THREE.MeshStandardMaterial | undefined;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) material = object.material;
  });
  if (!material) throw new Error('No wall-buy material found');
  return material;
}

function emissiveLuminance(material: THREE.MeshStandardMaterial): number {
  return (material.emissive.r * 0.2126 + material.emissive.g * 0.7152 + material.emissive.b * 0.0722) * material.emissiveIntensity;
}

describe('Ultra Max wall-buy glow', () => {
  it('reduces constant HDR emission while keeping a visible cool chalk silhouette', () => {
    const legacy = materialOf(outline().group);
    const ultra = materialOf(outline(true).group);
    expect(ultra).not.toBe(legacy);
    expect(emissiveLuminance(ultra)).toBeGreaterThan(0.2);
    expect(emissiveLuminance(ultra)).toBeLessThan(emissiveLuminance(legacy) * 0.6);
    expect(ultra.emissive.b).toBeGreaterThan(ultra.emissive.r);
    expect(ultra.envMapIntensity).toBeLessThan(legacy.envMapIntensity);
    expect(ultra.blending).toBe(THREE.NormalBlending);
    expect(ultra.toneMapped).toBe(true);
    expect(ultra.transparent).toBe(false);
    expect(ultra.opacity).toBe(1);
  });

  it('shares one Ultra material without mutating the legacy material across runs', () => {
    const first = materialOf(outline(true).group);
    expect(materialOf(outline().group)).toBe(WALL_BUY_OUTLINE_MATERIAL);
    expect(materialOf(outline(true).group)).toBe(first);
    expect(WALL_BUY_OUTLINE_MATERIAL.color.getHex()).toBe(0xd7dde0);
    expect(WALL_BUY_OUTLINE_MATERIAL.emissive.getHex()).toBe(0xb9c8ce);
    expect(WALL_BUY_OUTLINE_MATERIAL.emissiveIntensity).toBe(1.15);
    expect(WALL_BUY_OUTLINE_MATERIAL.roughness).toBe(0.72);
    expect(WALL_BUY_OUTLINE_MATERIAL.metalness).toBe(0.08);
  });

  it('preserves geometry, trigger openings and placement instead of inflating the glow', () => {
    const legacy = outline().group;
    const ultra = outline(true).group;
    expect(new THREE.Box3().setFromObject(ultra)).toEqual(new THREE.Box3().setFromObject(legacy));
    expect(ultra.children).toHaveLength(legacy.children.length);
    const frame = ultra.getObjectByName('m1911-wall-frame') as THREE.Mesh<THREE.ExtrudeGeometry>;
    expect((frame.geometry.parameters.shapes as THREE.Shape).holes).toHaveLength(1);
    expect(ultra.position).toEqual(legacy.position);
  });

  it('keeps grenade wall outlines in the same preset-specific material', () => {
    for (const advanced of [false, true]) {
      const parent = new THREE.Group();
      buildGrenadeWallBuy(parent, {
        id: 'f1-wall', position: BUY.position, floor: 0, yaw: 0,
        cost: 250, useRange: 2.2, lookDotMin: 0.5,
      }, advanced);
      expect(materialOf(parent)).toBe(materialOf(outline(advanced).group));
    }
  });
});
