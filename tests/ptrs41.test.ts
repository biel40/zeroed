import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PTRS41_RESKIN, reskinWeapons } from '../src/config/weaponReskins';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { PTRS41_PROFILE } from '../src/weapons/PTRS41ViewModel';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';
import type { WeaponDefinition } from '../src/weapons/WeaponTypes';
import { STATION33_WEAPONS } from '../src/zombies/maps/Station33Config';

const barrett = WEAPON_DEFINITIONS.barrett;
const ptrs = STATION33_WEAPONS.barrett;

function gameplayOf(definition: WeaponDefinition): Omit<WeaponDefinition, 'name' | 'view'> {
  const { name: _name, view: _view, ...gameplay } = definition;
  return gameplay;
}

describe('weapon reskins', () => {
  it('replaces only the name and look of a weapon, sharing the rest of the catalog', () => {
    const catalog = reskinWeapons({ barrett: PTRS41_RESKIN });
    for (const id of Object.keys(WEAPON_DEFINITIONS) as (keyof typeof WEAPON_DEFINITIONS)[]) {
      if (id !== 'barrett') expect(catalog[id]).toBe(WEAPON_DEFINITIONS[id]);
    }
    expect(catalog.barrett.id).toBe('barrett');
    expect(catalog.barrett.name).toBe(PTRS41_RESKIN.name);
    expect(WEAPON_DEFINITIONS.barrett.name).toBe('BARRETT .50');
  });
});

describe('Station 33 PTRS-41', () => {
  it('is the Barrett on Station 33 alone; every other map keeps the shared catalog', () => {
    expect(ZOMBIE_MAPS['station-33'].weapons).toBe(STATION33_WEAPONS);
    expect(ZOMBIE_MAPS['burned-mansion'].weapons).toBe(WEAPON_DEFINITIONS);
    expect(ptrs.name).toBe('PTRS-41');
    expect(ptrs.view.frame).toBe('ptrs41');
    expect(WEAPON_DEFINITIONS.barrett.view.frame).toBe('barrett');
  });

  it('keeps every Barrett stat, sound, effect and reload timing', () => {
    expect(gameplayOf(ptrs)).toEqual(gameplayOf(barrett));
    expect(ptrs.audio).toBe(barrett.audio);
    const { hip, ads, sway, bob, visualRecoil, scale, reloadAnim, hands } = ptrs.view;
    expect({ hip, ads, sway, bob, visualRecoil, scale }).toEqual({
      hip: barrett.view.hip, ads: barrett.view.ads, sway: barrett.view.sway, bob: barrett.view.bob,
      visualRecoil: barrett.view.visualRecoil, scale: barrett.view.scale,
    });
    expect(reloadAnim).toBe(barrett.view.reloadAnim);
    expect(hands.right).toBe(barrett.view.hands.right);
    expect(hands.action).toBe(barrett.view.hands.action);
    expect(hands.magazine).toBe(barrett.view.hands.magazine);
  });
});

describe('PTRS-41 model', () => {
  it('builds a long rifle within the procedural rendering budget', () => {
    const built = buildProceduralViewModel(ptrs.view);
    expect(built.group.name).toBe('ptrs41-root');
    for (const name of ['stock', 'receiver', 'barrel', 'muzzle-brake', 'scope', 'magazine', 'bipod', 'charging-handle']) {
      expect(built.group.getObjectByName(`ptrs41-${name}`)).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBeDefined();
    expect(built.reloadParts?.handle).toBeDefined();
    expect(built.reloadParts?.rounds).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(built.group);
    const barrettBounds = new THREE.Box3().setFromObject(buildProceduralViewModel(barrett.view).group);
    // Longer than the Barrett, yet its stock sits on the same shoulder.
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(barrettBounds.max.z - barrettBounds.min.z + 0.08);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(1.65);
    expect(bounds.max.z).toBeCloseTo(barrettBounds.max.z, 1);
    expect(built.muzzlePosition.z).toBeLessThanOrEqual(bounds.min.z + 0.001);
    expect(built.sightY).toBe(ptrs.view.sightHeight);
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(30);
    expect(triangles).toBeLessThan(18000);
    const display = buildWeaponDisplayModel(ptrs, null, 0.72);
    expect(new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3()).z).toBeCloseTo(0.72);
  });

  it('has a bare barrel ahead of the receiver and a box brake with an open bore and side windows', () => {
    const built = buildProceduralViewModel(ptrs.view);
    built.group.updateMatrixWorld(true);
    const P = PTRS41_PROFILE;
    const ray = new THREE.Raycaster();
    const hitsFromRight = (part: string, y: number, z: number): number => {
      ray.set(new THREE.Vector3(0.2, y, z), new THREE.Vector3(-1, 0, 0));
      return ray.intersectObject(built.group.getObjectByName(`ptrs41-${part}`)!, true).length;
    };
    // Midway down the barrel only the thin tube is there: nothing above or below it.
    const midZ = (P.gasCylinder.frontZ + P.brake.rearZ) / 2;
    expect(hitsFromRight('barrel', 0, midZ)).toBeGreaterThan(0);
    expect(hitsFromRight('barrel', P.barrel.rearRadius + 0.006, midZ)).toBe(0);
    // Side windows of the brake go right through it.
    expect(hitsFromRight('muzzle-brake', 0.004, P.brake.windowZ[0])).toBe(0);
    expect(hitsFromRight('muzzle-brake', 0.004, P.brake.webZ)).toBeGreaterThan(0);
    const brake = built.group.getObjectByName('ptrs41-muzzle-brake')!;
    ray.set(new THREE.Vector3(0, 0, P.brake.frontZ - 0.05), new THREE.Vector3(0, 0, 1));
    ray.far = 0.2;
    expect(ray.intersectObject(brake, true)).toHaveLength(0);
  });

  it('carries a wooden stock and grip and keeps the support hand on the barrel', () => {
    const built = buildProceduralViewModel(ptrs.view);
    const woodColor = new THREE.Color(ptrs.view.accentColor);
    const stock = built.group.getObjectByName('ptrs41-stock')!;
    const woodMeshes: THREE.Mesh[] = [];
    stock.traverse((part) => {
      if (part instanceof THREE.Mesh && (part.material as THREE.MeshStandardMaterial).color.equals(woodColor)) woodMeshes.push(part);
    });
    expect(woodMeshes.length).toBeGreaterThan(0);
    const [, , supportZ] = ptrs.view.hands.left!.position;
    expect(supportZ).toBeLessThan(PTRS41_PROFILE.receiver.frontZ);
    expect(supportZ).toBeGreaterThan(PTRS41_PROFILE.bipod.pivotZ);
  });
});
