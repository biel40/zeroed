import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PPSH41_PROFILE } from '../src/weapons/PPSH41ViewModel';
import { buildProceduralViewModel } from '../src/weapons/WeaponView';

const view = WEAPON_DEFINITIONS.ppsh41.view;

function bounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('PPSh-41 view model', () => {
  it('builds its characteristic furniture and independent drum and open bolt', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('ppsh41-root');
    for (const part of ['stock', 'receiver', 'shroud', 'sights', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`ppsh41-${part}`), part).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('ppsh41-magazine'));
    expect(built.reloadParts?.handle).toBe(built.openBolt);
    expect(bounds(built.openBolt!).max.x).toBeGreaterThan(0.03);
  });

  it('keeps real overall length and the drum covers perpendicular to the bore', () => {
    const built = buildProceduralViewModel(view);
    const size = bounds(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.83);
    expect(size.z).toBeLessThan(0.86);
    const drumSize = bounds(built.reloadParts!.magazine!).getSize(new THREE.Vector3());
    expect(drumSize.x).toBeCloseTo(PPSH41_PROFILE.magazine.radius * 2, 2);
    expect(drumSize.y).toBeGreaterThan(0.14);
    expect(drumSize.z).toBeLessThan(0.065);
    expect(built.muzzlePosition.z).toBeLessThan(PPSH41_PROFILE.shroud.frontZ);
    expect(built.muzzlePosition.y).toBe(0);
  });

  it('has open ventilation slots and a barrel visible inside the jacket', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const jacket = built.group.getObjectByName('ppsh41-shroud')!;
    const sideRay = (z: number) => new THREE.Raycaster(new THREE.Vector3(0.1, 0.009, z), new THREE.Vector3(-1, 0, 0))
      .intersectObject(jacket, true);
    // At the first slot's upper edge the bore is below the ray and both plates are open.
    expect(sideRay(-0.164)).toHaveLength(0);
    // Between openings the same ray meets the stamped steel wall.
    expect(sideRay(-0.1885).length).toBeGreaterThan(0);
    // Lowering through the opening meets the real barrel inside, away from the jacket sides.
    const boreRay = new THREE.Raycaster(new THREE.Vector3(0.1, 0, -0.164), new THREE.Vector3(-1, 0, 0))
      .intersectObject(jacket, true);
    expect(boreRay[0]?.point.x).toBeLessThan(0.01);
    expect(boreRay[0]?.point.x).toBeGreaterThan(0.005);
  });

  it('rounds the folded jacket shoulders without closing the ventilated interior', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const jacket = built.group.getObjectByName('ppsh41-shroud')!;
    const shoulder = new THREE.Raycaster(new THREE.Vector3(0.05, 0.018, -0.3), new THREE.Vector3(-1, 0, 0))
      .intersectObject(jacket, true)[0];
    // A rounded shoulder recedes from the flat side and has an upward-facing normal.
    expect(shoulder?.point.x).toBeGreaterThan(0.017);
    expect(shoulder?.point.x).toBeLessThan(0.0195);
    expect(shoulder?.face?.normal.y).toBeGreaterThan(0.3);
    const fromAbove = new THREE.Raycaster(new THREE.Vector3(0.017, 0.05, -0.3), new THREE.Vector3(0, -1, 0))
      .intersectObject(jacket, true)[0];
    expect(fromAbove?.point.y).toBeLessThan(PPSH41_PROFILE.shroud.topY - 0.0002);
    expect(fromAbove?.point.y).toBeGreaterThan(0.018);
  });

  it('leaves an unobstructed sight picture above the post and through the rear notch', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const along = (y: number) => new THREE.Raycaster(new THREE.Vector3(0, y, 0.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(built.group, true);
    expect(built.sightY).toBe(view.sightHeight);
    expect(along(view.sightHeight + 0.001)).toHaveLength(0);
    expect(along(view.sightHeight - 0.002)[0]?.point.z).toBeCloseTo(PPSH41_PROFILE.frontSightZ, 2);
  });

  it('closes the sloping compensator nose around an open muzzle exit', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const jacket = built.group.getObjectByName('ppsh41-shroud')!;
    const fromFront = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, -0.55), new THREE.Vector3(0, 0, 1))
      .intersectObject(jacket, true)[0]?.point;
    // The centre passes through the plate to the recessed muzzle.
    expect(fromFront(0, 0)?.z).toBeGreaterThan(-0.44);
    expect(fromFront(0.014, 0)?.z).toBeLessThan(-0.455);
    // The nose's top is behind its bottom, matching the stamped compensator.
    expect(fromFront(0.014, 0.012)!.z).toBeGreaterThan(fromFront(0.014, -0.012)!.z);
    const underside = new THREE.Raycaster(new THREE.Vector3(0, -0.05, -0.462), new THREE.Vector3(0, 1, 0))
      .intersectObject(jacket, true)[0];
    expect(underside?.point.y).toBeCloseTo(PPSH41_PROFILE.shroud.bottomY, 4);
  });

  it('leaves real space through the trigger guard below the wooden foreend', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const through = (y: number) => new THREE.Raycaster(new THREE.Vector3(0.1, y, 0.03), new THREE.Vector3(-1, 0, 0))
      .intersectObject(built.group, true);
    expect(through(-0.075)).toHaveLength(0);
    expect(through(-0.089).length).toBeGreaterThan(0);
  });

  it('forms a rounded semi-pistol wrist deep enough for a three-finger stock grip', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const stock = built.group.getObjectByName('ppsh41-stock')!;
    const bottom = new THREE.Raycaster(new THREE.Vector3(0, -0.2, 0.125), new THREE.Vector3(0, 1, 0))
      .intersectObject(stock, true)[0]!.point;
    const top = new THREE.Raycaster(new THREE.Vector3(0, 0.1, 0.125), new THREE.Vector3(0, -1, 0))
      .intersectObject(stock, true)[0]!.point;
    expect(top.y - bottom.y).toBeGreaterThan(0.045);
    expect(top.y - bottom.y).toBeLessThan(0.065);
    const flank = new THREE.Raycaster(new THREE.Vector3(0.1, -0.056, 0.125), new THREE.Vector3(-1, 0, 0))
      .intersectObject(stock, true)[0]!.point;
    expect(flank.x * 2).toBeGreaterThan(0.028);
    expect(flank.x * 2).toBeLessThan(0.036);
  });

  it('batches its detail within the existing mobile weapon budget', () => {
    const built = buildProceduralViewModel(view);
    // The drum's rounds are only drawn while it is out of the well (reload, inspection).
    const rounds = built.reloadParts!.rounds!;
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      if (rounds.getObjectById(part.id)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(6500);
  });
});
