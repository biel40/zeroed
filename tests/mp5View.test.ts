import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';
import { MP5_PROFILE } from '../src/weapons/MP5ViewModel';
import { buildProceduralViewModel } from '../src/weapons/WeaponView';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';
import { ZOMBIE_BASE_HP, ZOMBIES_RESERVE_AMMO } from '../src/zombies/ZombieConfig';
import { STATION33_WALL_BUYS } from '../src/zombies/maps/Station33Config';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const definition = WEAPON_DEFINITIONS.mp5;
const view = definition.view;

describe('MP5 definition', () => {
  it('is a 30-round 9 mm SMG one tier under the rifles and above the starting pistol', () => {
    const dps = (id: WeaponId) => (WEAPON_DEFINITIONS[id].damage * WEAPON_DEFINITIONS[id].rpm) / 60;
    const magazineDamage = (id: WeaponId) => WEAPON_DEFINITIONS[id].damage * WEAPON_DEFINITIONS[id].magazineSize;
    expect(definition.magazineSize).toBe(30);
    expect(definition.fireModes).toEqual(['auto', 'semi']);
    expect(dps('mp5')).toBeGreaterThan(dps('m1911'));
    for (const rifle of ['m4a1', 'ak47', 'm60'] as const) expect(dps('mp5'), rifle).toBeLessThan(dps(rifle));
    for (const rifle of ['m4a1', 'ak47'] as const) expect(magazineDamage('mp5'), rifle).toBeLessThan(magazineDamage(rifle) * 0.7);
    expect(Math.ceil(ZOMBIE_BASE_HP / definition.damage)).toBe(5);
    expect(ZOMBIES_RESERVE_AMMO.mp5).toBeLessThan(ZOMBIES_RESERVE_AMMO.m4a1);
    expect(definition.projectile.muzzleVelocity).toBeLessThan(WEAPON_DEFINITIONS.m4a1.projectile.muzzleVelocity);
  });

  it('is a standard Mystery Box pull and a Station 33 wall buy', () => {
    expect(MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'mp5')).toMatchObject({ rarity: 'standard' });
    expect(STATION33_WALL_BUYS.find((wallBuy) => wallBuy.weaponId === 'mp5')).toMatchObject({ price: 1000, ammoPrice: 500 });
  });
});

describe('MP5A3 view model', () => {
  it('builds the dedicated model at real proportions within the draw-call budget', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('mp5-root');
    for (const name of ['receiver', 'lower', 'handguard', 'barrel', 'sights', 'stock', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`mp5-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('mp5-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('mp5-charging-handle'));
    expect(built.sightY).toBeCloseTo(view.sightHeight, 5);
    expect(built.muzzlePosition.z).toBeLessThan(MP5_PROFILE.barrel.muzzleZ);

    // Real MP5A3: 700 mm with the stock extended, a slim 9 mm receiver.
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.66);
    expect(size.z).toBeLessThan(0.74);
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

  it('keeps the sight line clear: drum below the aperture, post inside the hood', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const along = (y: number) => new THREE.Raycaster(new THREE.Vector3(0, y, 0.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(built.group, true);
    // Just over the post the eye sees through both apertures to the muzzle and beyond.
    expect(along(view.sightHeight + 0.001)).toHaveLength(0);
    // Just under its tip, the first thing on the line is the front post.
    const hit = along(view.sightHeight - 0.002)[0];
    expect(hit?.point.z).toBeCloseTo(MP5_PROFILE.frontSightZ, 2);
  });

  it('drops and reseats one magazine and racks the cocking handle back', () => {
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
    update(view.reloadAnim!.magSeat + 0.01);
    expect(magazine.visible).toBe(true);
    expect(magazine.position.toArray()).toEqual(magazineHome.toArray());
    update(0.78);
    expect(handle.position.z).toBeGreaterThan(handleHome.z);
    animator.reset();
    expect(handle.position.toArray()).toEqual(handleHome.toArray());
  });
});

describe('MP5 wall-buy silhouette', () => {
  it('draws the MP5A3 profile instead of the generic long gun', () => {
    const wallBuy = new WallBuy(STATION33_WALL_BUYS.find((config) => config.weaponId === 'mp5')!);
    const wall = new WallBuyView(wallBuy, definition, new THREE.Group());
    expect(wall.group.userData.silhouette).toBe('mp5');
    for (const part of ['stock', 'receiver', 'lower', 'grip', 'trigger-guard', 'magazine', 'handguard', 'rear-sight', 'front-sight', 'barrel']) {
      expect(wall.group.getObjectByName(`mp5-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.25);
    expect(size.x).toBeLessThan(1.45);
    expect(size.y).toBeGreaterThan(0.45);
    expect(size.y).toBeLessThan(0.65);
  });
});
