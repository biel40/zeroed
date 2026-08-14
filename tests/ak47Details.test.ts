import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildAk47Details } from '../src/weapons/WeaponView';

/**
 * Contract tests for the AK-47 GLB detail pass. The shipped low-poly GLB
 * (1122 tris, 4 material meshes) lacks the signature AK hardware — cleaning
 * rod under the barrel, muzzle brake and the tangent rear sight — so the
 * view model adds them as bounds-anchored procedural meshes, the same way
 * buildGlbReloadParts anchors the magazine and charging handle.
 *
 * The test box mirrors the real GLB after attachGlbModel normalization
 * (measured by parsing the asset): muzzle at z ≈ -0.636, stock butt at
 * z ≈ +0.244, front-sight post top (sightY) ≈ 0.255, half-width ≈ 0.048.
 */

const SIGHT_Y = 0.255;
const BOX = new THREE.Box3(
  new THREE.Vector3(-0.048, -0.197, -0.636),
  new THREE.Vector3(0.048, SIGHT_Y, 0.244),
);

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

describe('AK-47 GLB detail pass', () => {
  it('adds the missing signature hardware as bounds-anchored meshes', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    // Rod, brake + slots, dust cover, gas tube + block, handguards, pistol
    // grip, tangent sight, rear trunnion — a full AK read, not flat decor.
    expect(meshBounds(details.group).length).toBeGreaterThanOrEqual(10);
  });

  it('runs a wooden handguard pair over the gas tube, mid barrel', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    const bounds = meshBounds(details.group);
    const wood = bounds.filter(
      (m) =>
        m.center.z < BOX.min.z * 0.5 && // over the handguard zone
        m.center.z > BOX.min.z && // behind the muzzle
        m.size.z > 0.1, // long slabs, not fittings
    );
    // Lower handguard under the bore + upper over the gas tube.
    expect(wood.some((m) => m.center.y < SIGHT_Y * 0.55)).toBe(true);
    expect(wood.some((m) => m.center.y > SIGHT_Y * 0.55)).toBe(true);
  });

  it('sits a gas block on the barrel axis above the handguard', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    const gasBlock = meshBounds(details.group).find(
      (m) =>
        m.center.y > SIGHT_Y * 0.65 &&
        m.center.y < SIGHT_Y &&
        m.center.z < BOX.min.z * 0.55 &&
        m.center.z > BOX.min.z * 0.9,
    );
    expect(gasBlock).toBeTruthy();
  });

  it('keeps every detail clear of the ADS sight picture', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    // Nothing the pass adds may rise above the front-post sight line.
    for (const m of meshBounds(details.group)) {
      expect(m.center.y + m.size.y / 2).toBeLessThanOrEqual(SIGHT_Y + 1e-6);
    }
  });

  it('extends the muzzle with a brake and reports the new tip', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    // The muzzle flash must move to the brake tip, not stay inside it.
    expect(details.muzzleZ).not.toBeNull();
    expect(details.muzzleZ!).toBeLessThan(BOX.min.z);
    const protrudes = meshBounds(details.group).some((m) => m.center.z - m.size.z / 2 < BOX.min.z);
    expect(protrudes).toBe(true);
  });

  it('runs a cleaning rod under the barrel line, clear of the receiver', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    const rod = meshBounds(details.group).find(
      (m) =>
        Math.abs(m.center.x) < 0.01 &&
        m.center.y < SIGHT_Y * 0.65 && // below the bore line
        m.center.y > SIGHT_Y * 0.3 && // above the handguard bottom
        m.center.z < BOX.min.z * 0.3 && // along the barrel (front half)
        m.size.z > 0.12, // long and thin
    );
    expect(rod).toBeTruthy();
  });

  it('adds the tangent rear sight on the receiver top, below the sight line', () => {
    const details = buildAk47Details(BOX, SIGHT_Y);
    const tangent = meshBounds(details.group).find(
      (m) =>
        m.center.y + m.size.y / 2 > SIGHT_Y * 0.75 && // rides the receiver top
        m.center.y + m.size.y / 2 <= SIGHT_Y + 1e-6 && // never above the front post
        m.center.z > BOX.min.z * 0.65 &&
        m.center.z < BOX.min.z * 0.25, // mid-receiver zone
    );
    expect(tangent).toBeTruthy();
  });
});
