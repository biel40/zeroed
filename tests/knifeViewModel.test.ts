import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildKnifeModel } from '../src/weapons/KnifeViewModel';

function buildModel(): THREE.Group {
  const model = new THREE.Group();
  buildKnifeModel(model);
  return model;
}

describe('knife view model', () => {
  it('fits the shared fist and retains a broad blade silhouette', () => {
    const model = buildModel();
    const blade = model.getObjectByName('knife-blade') as THREE.Mesh;
    blade.geometry.computeBoundingBox();
    const bounds = blade.geometry.boundingBox!;
    expect(bounds.min.z).toBeCloseTo(-0.515);
    expect(bounds.max.z).toBeCloseTo(-0.055);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.11);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(0.014);

    const grip = model.getObjectByName('knife-grip') as THREE.Mesh;
    const gripBounds = new THREE.Box3().setFromObject(grip);
    expect(gripBounds.containsPoint(new THREE.Vector3(0, 0, 0.075))).toBe(true);
    expect(gripBounds.getSize(new THREE.Vector3()).x).toBeLessThan(0.065);
    expect(model.getObjectByName('knife-guard')).toBeDefined();
    expect(model.getObjectByName('knife-pommel')).toBeDefined();
  });

  it('grounds the cutting edge and fuller into the blade with finite outward normals', () => {
    const model = buildModel();
    const blade = model.getObjectByName('knife-blade') as THREE.Mesh;
    expect(blade.geometry.groups).toHaveLength(3);
    expect(blade.geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2]);

    const positions = blade.geometry.getAttribute('position');
    const normals = blade.geometry.getAttribute('normal');
    for (let index = 0; index < positions.count; index++) {
      const position = new THREE.Vector3().fromBufferAttribute(positions, index);
      const normal = new THREE.Vector3().fromBufferAttribute(normals, index);
      expect(Number.isFinite(position.lengthSq())).toBe(true);
      expect(normal.length()).toBeCloseTo(1, 5);
      // Ground faces on either side must face outward instead of disappearing when culled.
      if (Math.abs(normal.x) > 0.8 && Math.abs(position.x) > 1e-6) expect(normal.x * position.x).toBeGreaterThan(0);
    }
  });

  it('keeps the detailed model within a small draw and triangle budget', () => {
    const model = buildModel();
    let draws = 0;
    let triangles = 0;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      draws += Array.isArray(object.material) ? object.geometry.groups.length : 1;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    expect(draws).toBeLessThanOrEqual(12);
    expect(triangles).toBeLessThan(5000);
  });
});
