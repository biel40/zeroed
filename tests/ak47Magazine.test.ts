import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildAk47Magazine } from '../src/weapons/WeaponView';

/**
 * Contract tests for the AK curved magazine. The shipped GLB is single-mesh
 * and the generic buildGlbReloadParts hangs a straight box under it — the
 * AK's 30-round "banana" is its most recognizable feature, so the view model
 * substitutes a tangential-arc magazine the ReloadAnimator's 'rock' style
 * can still rock out of the well.
 */

const SIGHT_Y = 0.255;
const BOX = new THREE.Box3(
  new THREE.Vector3(-0.048, -0.197, -0.636),
  new THREE.Vector3(0.048, SIGHT_Y, 0.244),
);
const MAG_HEIGHT = 0.15;

interface MeshBounds {
  center: THREE.Vector3;
  size: THREE.Vector3;
}

function meshBounds(root: THREE.Object3D): MeshBounds[] {
  root.updateMatrixWorld(true);
  const out: MeshBounds[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(object);
      out.push({
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3()),
      });
    }
  });
  return out;
}

describe('AK-47 curved magazine', () => {
  it('is built from arc segments, not a single rectangular box', () => {
    const mag = buildAk47Magazine(BOX, SIGHT_Y, MAG_HEIGHT);
    expect(mag.children.length).toBeGreaterThanOrEqual(3);
  });

  it('curves forward: the lower it hangs, the more it rakes toward -Z', () => {
    const mag = buildAk47Magazine(BOX, SIGHT_Y, MAG_HEIGHT);
    mag.updateMatrixWorld(true);
    const seg = (i: number) => mag.children[i].getWorldPosition(new THREE.Vector3());
    const top = seg(0);
    const mid = seg(1);
    const bottom = seg(mag.children.length - 1);

    expect(top.y).toBeGreaterThan(mid.y);
    expect(mid.y).toBeGreaterThan(bottom.y);
    // The defining banana trait: forward rake grows with depth.
    expect(mid.z).toBeLessThan(top.z);
    expect(bottom.z).toBeLessThan(mid.z);
    // A real 30-rounder sweeps ~7-9 cm forward across its 15 cm body.
    expect(top.z - bottom.z).toBeGreaterThan(0.04);
  });

  it('stays a thin tapered box stack, not a bulky slab', () => {
    const mag = buildAk47Magazine(BOX, SIGHT_Y, MAG_HEIGHT);
    for (const m of meshBounds(mag)) {
      expect(m.size.x).toBeLessThan(0.06);
      expect(m.size.y).toBeLessThan(MAG_HEIGHT);
    }
  });
});
