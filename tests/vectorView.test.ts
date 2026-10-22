import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { VECTOR_PROFILE } from '../src/weapons/VectorViewModel';
import type { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel } from '../src/weapons/WeaponView';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';
import { STATION33_WALL_BUYS } from '../src/zombies/maps/Station33Config';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';
import { ZOMBIE_BASE_HP } from '../src/zombies/ZombieConfig';

const definition = WEAPON_DEFINITIONS.vector;
const view = definition.view;
const FIREARMS = (Object.keys(WEAPON_DEFINITIONS) as WeaponId[]).filter((id) => !WEAPON_DEFINITIONS[id].energy);

describe('Vector definition', () => {
  it('is the highest-cadence firearm with 30 rounds and the lightest hits', () => {
    expect(definition.name).toBe('Vector');
    expect(definition.magazineSize).toBe(30);
    for (const id of FIREARMS.filter((other) => other !== 'vector')) {
      expect(definition.rpm, id).toBeGreaterThan(WEAPON_DEFINITIONS[id].rpm);
      expect(definition.damage, id).toBeLessThan(WEAPON_DEFINITIONS[id].damage);
    }
    expect(Math.ceil(ZOMBIE_BASE_HP / definition.damage)).toBe(7);
  });

  it('has the shortest reach of every firearm', () => {
    for (const id of FIREARMS.filter((other) => other !== 'vector')) {
      expect(definition.projectile.maxDistance, id).toBeLessThan(WEAPON_DEFINITIONS[id].projectile.maxDistance);
      expect(definition.projectile.drag, id).toBeGreaterThan(WEAPON_DEFINITIONS[id].projectile.drag);
    }
  });

  it('kicks less per shot and recovers faster than every other automatic', () => {
    for (const id of FIREARMS.filter((other) => other !== 'vector' && WEAPON_DEFINITIONS[other].fireModes.includes('auto'))) {
      const other = WEAPON_DEFINITIONS[id].recoil;
      expect(definition.recoil.verticalKick, id).toBeLessThan(other.verticalKick);
      expect(definition.recoil.recoverySpeed, id).toBeGreaterThan(other.recoverySpeed);
      // Even per second of sustained fire the climb stays the gentlest.
      const climb = (weapon: WeaponId) => WEAPON_DEFINITIONS[weapon].recoil.verticalKick * WEAPON_DEFINITIONS[weapon].rpm;
      expect(climb('vector'), id).toBeLessThan(climb(id));
    }
  });

  it('is a standard Mystery Box pull and a Station 33 wall buy', () => {
    expect(MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'vector')).toMatchObject({ rarity: 'standard' });
    expect(STATION33_WALL_BUYS.find((wallBuy) => wallBuy.weaponId === 'vector')).toMatchObject({ price: 1250, ammoPrice: 625 });
  });
});

describe('Vector view model', () => {
  it('builds the dedicated model at real proportions within the draw-call budget', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('vector-root');
    for (const name of ['upper', 'lower', 'muzzle', 'sights', 'stock', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`vector-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('vector-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('vector-charging-handle'));
    expect(built.sightY).toBeCloseTo(view.sightHeight, 5);
    expect(built.muzzlePosition.z).toBeLessThan(VECTOR_PROFILE.flashHider.frontZ);

    // Real Vector SMG: ~620-645 mm with the stock extended.
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.61);
    expect(size.z).toBeLessThan(0.67);
    expect(size.x).toBeLessThan(0.08);

    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(6000);
  });

  it('keeps the sight line clear between the aperture and the front post', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const along = (y: number) => new THREE.Raycaster(new THREE.Vector3(0, y, 0.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(built.group, true);
    expect(along(view.sightHeight + 0.001)).toHaveLength(0);
    const hit = along(view.sightHeight - 0.002)[0];
    expect(hit?.point.z).toBeCloseTo(VECTOR_PROFILE.frontSightZ, 2);
  });

  it('drops and reseats one magazine and racks the charging handle back', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const handle = built.reloadParts!.handle!;
    const magazineHome = magazine.position.clone();
    const handleHome = handle.position.clone();
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine, handle, cover: null }, null);
    const update = (progress: number): void => {
      animator.update({ state: 'reloading', stateProgress: progress, reloadType: 'empty' } as Weapon);
    };
    update(0.18);
    expect(magazine.position.y).toBeLessThan(magazineHome.y);
    update(0.3);
    expect(magazine.visible).toBe(false);
    update(0.65);
    expect(magazine.visible).toBe(true);
    expect(magazine.position.toArray()).toEqual(magazineHome.toArray());
    update(0.78);
    expect(handle.position.z).toBeGreaterThan(handleHome.z);
    animator.reset();
    expect(handle.position.toArray()).toEqual(handleHome.toArray());
  });
});

describe('Vector wall-buy silhouette', () => {
  it('draws the Vector profile instead of the generic long gun', () => {
    const wallBuy = new WallBuy(STATION33_WALL_BUYS.find((config) => config.weaponId === 'vector')!);
    const wall = new WallBuyView(wallBuy, definition, new THREE.Group());
    expect(wall.group.userData.silhouette).toBe('vector');
    for (const part of ['stock', 'upper', 'rail', 'lower', 'grip', 'magazine', 'sight', 'flash-hider']) {
      expect(wall.group.getObjectByName(`vector-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.2);
    expect(size.x).toBeLessThan(1.4);
    expect(size.y).toBeLessThan(0.8);
  });
});
