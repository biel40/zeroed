import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';

const definition = WEAPON_DEFINITIONS.tesla;

function namedMeshes(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const matches: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name === name) matches.push(object);
  });
  return matches;
}

function sourceCount(root: THREE.Object3D, name: string): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === name) count++;
    const sourceNames = object.userData.sourceNames as string[] | undefined;
    if (sourceNames) count += sourceNames.filter((source) => source === name).length;
  });
  return count;
}

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) count++;
  });
  return count;
}

describe('ZEUS-77 dedicated view model', () => {
  it('keeps the Tesla builder identity ahead of the generic energy-weapon path', () => {
    expect(definition.name).toBe('ZEUS-77');
    expect(definition.view.teslaFrame).toBe('tesla');
    expect(definition.view.energyColor).toBeDefined();
    expect(buildProceduralViewModel(definition.view).group.name).toBe('zeus77-root');
  });

  it('builds a coherent stock, receiver, transformer, coil chamber and fork emitter', () => {
    const built = buildProceduralViewModel(definition.view);
    for (const name of [
      'zeus77-stock',
      'zeus77-receiver',
      'zeus77-transformer-bank',
      'zeus77-coil-chamber',
      'zeus77-fork-emitter',
      'zeus77-optic',
    ]) {
      expect(built.group.getObjectByName(name)).toBeInstanceOf(THREE.Group);
    }
    expect(sourceCount(built.group, 'zeus77-exposed-copper-coil')).toBe(1);
    expect(sourceCount(built.group, 'zeus77-coil-support-ring')).toBe(5);
    expect(sourceCount(built.group, 'zeus77-insulated-feed-wire')).toBe(2);
    expect(sourceCount(built.group, 'zeus77-cooling-fin')).toBe(7);
    expect(sourceCount(built.group, 'zeus77-emitter-prong')).toBe(2);
    expect(sourceCount(built.group, 'zeus77-emitter-electrode')).toBe(2);
    expect(meshCount(built.group)).toBeLessThanOrEqual(40);
    const prongBatch = built.group.getObjectByName('zeus77-fork-emitter')!.children.find((child) => (
      (child.userData.sourceNames as string[] | undefined)?.includes('zeus77-emitter-prong')
    ))!;
    const electrodeBatch = built.group.getObjectByName('zeus77-fork-emitter')!.children.find((child) => (
      (child.userData.sourceNames as string[] | undefined)?.includes('zeus77-emitter-electrode')
    ))!;
    built.group.updateMatrixWorld(true);
    const prongBox = new THREE.Box3().setFromObject(prongBatch);
    const electrodeBox = new THREE.Box3().setFromObject(electrodeBatch);
    expect(Math.abs(prongBox.max.x - electrodeBox.max.x)).toBeLessThan(0.015);
    expect(Math.abs(prongBox.min.x - electrodeBox.min.x)).toBeLessThan(0.015);
  });

  it('uses a complete flank-mounted capacitor module as the reload cell', () => {
    const built = buildProceduralViewModel(definition.view);
    const capacitor = built.reloadParts?.magazine;

    expect(capacitor?.name).toBe('zeus77-capacitor-cell');
    expect(capacitor?.parent).toBe(built.group);
    expect(capacitor?.position.x).toBeGreaterThan(0.04);
    expect(namedMeshes(capacitor!, 'zeus77-capacitor-energy-core')).toHaveLength(1);
    expect(namedMeshes(capacitor!, 'zeus77-capacitor-glass')).toHaveLength(1);
    expect(namedMeshes(capacitor!, 'zeus77-capacitor-cap')).toHaveLength(2);
    expect(namedMeshes(capacitor!, 'zeus77-capacitor-cage-bar')).toHaveLength(4);

    built.group.updateMatrixWorld(true);
    const capacitorBox = new THREE.Box3().setFromObject(capacitor!);
    expect(capacitorBox.min.x).toBeGreaterThan(0.015 * definition.view.scale);
  });

  it('keeps a long narrow first-person silhouette and a clear aiming line', () => {
    const built = buildProceduralViewModel(definition.view);
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());

    expect(size.z).toBeGreaterThan(0.85);
    expect(size.x / size.z).toBeLessThan(0.18);
    expect(built.sightY).toBeCloseTo(definition.view.sightHeight * definition.view.scale, 6);
    expect(built.muzzlePosition.y).toBeLessThan(built.sightY);
  });

  it('places the VFX muzzle beyond the discharge electrodes', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const electrodeBounds = new THREE.Box3();
    electrodeBounds.setFromObject(built.group.getObjectByName('zeus77-fork-emitter')!);

    expect(built.muzzlePosition.z).toBeLessThanOrEqual(electrodeBounds.min.z + 0.001);
    expect(built.energyMaterials).toHaveLength(1);
  });

  it('reuses the redesign for normalized world-space displays', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.72);
    expect(display.getObjectByName('zeus77-root')).toBeTruthy();
    expect(display.getObjectByName('zeus77-exposed-copper-coil')).toBeTruthy();
    const size = new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeCloseTo(0.72, 5);
  });
});
