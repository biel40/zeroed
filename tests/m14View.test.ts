import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { M14_PROFILE } from '../src/weapons/M14ViewModel';
import { HANDLE_RELEASE_FRACTION, HANDLE_TRAVEL, ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, WeaponView } from '../src/weapons/WeaponView';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';
import { ZOMBIE_BASE_HP, ZOMBIES_RESERVE_AMMO } from '../src/zombies/ZombieConfig';
import { MANSION_WALL_BUYS } from '../src/zombies/maps/BurnedMansionConfig';
import { STATION33_WALL_BUYS, VESTIBULE } from '../src/zombies/maps/Station33Config';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const definition = WEAPON_DEFINITIONS.m14;
const view = definition.view;
const reload = view.reloadAnim!;
const originalDocument = globalThis.document;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

describe('M14 definition', () => {
  it('is a semi-automatic battle rifle holding 8 rounds with 64 in reserve', () => {
    expect(definition.name).toBe('M14');
    expect(definition.fireModes).toEqual(['semi']);
    expect(definition.defaultFireMode).toBe('semi');
    expect(definition.magazineSize).toBe(8);
    expect(ZOMBIES_RESERVE_AMMO.m14).toBe(64);
    expect(definition.projectile.muzzleVelocity).toBe(853);
    expect(definition.heat).toBeDefined();
    expect(definition.heat!.lockout).toBeUndefined();
  });

  it('hits hard, two torso shots on a round-1 zombie, without outclassing the box rifles per magazine', () => {
    const magazineDamage = (weapon: 'm14' | 'ak47' | 'm4a1') => WEAPON_DEFINITIONS[weapon].damage * WEAPON_DEFINITIONS[weapon].magazineSize;
    expect(Math.ceil(ZOMBIE_BASE_HP / definition.damage)).toBe(2);
    expect(definition.damage).toBeGreaterThan(WEAPON_DEFINITIONS.ak47.damage);
    for (const rifle of ['ak47', 'm4a1'] as const) expect(magazineDamage('m14'), rifle).toBeLessThan(magazineDamage(rifle));
  });

  it('uses its own optional shot sample, falling back to the procedural report', () => {
    expect(definition.audio.sampleFile).toBe('m14_shot.mp3');
    expect(definition.audio.variation).toBeDefined();
  });

  it('reloads at the pace of the AK-47, no quicker than the lighter rifles', () => {
    expect(definition.reloadTime).toBe(WEAPON_DEFINITIONS.ak47.reloadTime);
    expect(definition.tacticalReloadTime).toBe(WEAPON_DEFINITIONS.ak47.tacticalReloadTime);
    expect(definition.reloadTime).toBeGreaterThan(WEAPON_DEFINITIONS.m4a1.reloadTime);
  });

  it('deals less damage per second than the AK-47', () => {
    const dps = (weapon: 'm14' | 'ak47') => (WEAPON_DEFINITIONS[weapon].damage * WEAPON_DEFINITIONS[weapon].rpm) / 60;
    expect(definition.damage).toBe(65);
    expect(dps('m14')).toBeLessThan(dps('ak47'));
  });
});

describe('M14 availability', () => {
  it('is a standard Mystery Box pull', () => {
    expect(MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'm14')).toMatchObject({ rarity: 'standard', weight: 20 });
  });

  it('takes over the L96 wall of the Burned Mansion starting room', () => {
    expect(MANSION_WALL_BUYS.find((buy) => buy.weaponId === 'm14')).toMatchObject({
      id: 'start-m14', price: 800, ammoPrice: 625, position: { x: 4.6, y: 1.45, z: 2.17 }, yaw: 0, floor: 0,
    });
    expect(MANSION_WALL_BUYS.some((buy) => buy.weaponId === 'l96')).toBe(false);
  });

  it('takes over the PPSh-41 wall of the Station 33 vestibule', () => {
    const buy = STATION33_WALL_BUYS.find((entry) => entry.weaponId === 'm14')!;
    expect(buy).toMatchObject({ id: 'vestibule-m14', price: 800, ammoPrice: 625, position: { y: 1.45, z: 2 }, yaw: -Math.PI / 2, floor: 0 });
    expect(buy.position.x).toBeGreaterThan(VESTIBULE.maxX - 0.5);
  });

  it('keeps the displaced weapons in the Mystery Box', () => {
    for (const id of ['l96', 'mp5'] as const) {
      expect(MYSTERY_BOX_POOL.some((entry) => entry.weaponId === id), id).toBe(true);
    }
  });
});

describe('M14 view model', () => {
  it('builds the dedicated model at real proportions within the draw-call budget', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('m14-root');
    for (const name of ['stock', 'handguard', 'receiver', 'lower', 'barrel', 'sights', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`m14-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('m14-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('m14-charging-handle'));
    expect(built.slide).toBe(built.reloadParts?.handle);
    expect(built.sightY).toBeCloseTo(view.sightHeight, 5);
    expect(built.muzzlePosition.z).toBeLessThan(M14_PROFILE.flashSuppressor.muzzleZ);

    // Real M14: 1126 mm overall, a wide walnut stock and a 20-round box below it.
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(1.09);
    expect(size.z).toBeLessThan(1.16);
    expect(size.x).toBeLessThan(0.12);
    expect(size.y).toBeGreaterThan(0.24);

    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(9000);
  });

  it('keeps the sight line clear: through the rear aperture and onto the front post', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const along = (y: number) => new THREE.Raycaster(new THREE.Vector3(0, y, 0.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(built.group, true);
    expect(along(view.sightHeight + 0.001)).toHaveLength(0);
    const hit = along(view.sightHeight - 0.002)[0];
    expect(hit?.point.z).toBeCloseTo(M14_PROFILE.frontSightZ, 2);
  });

  it('finishes the furniture in relieved walnut and the metal in parkerized steel', () => {
    const built = buildProceduralViewModel(view);
    const materialIn = (part: string): THREE.MeshStandardMaterial => {
      const mesh = built.group.getObjectByName(`m14-${part}`)!.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
      return mesh.material as THREE.MeshStandardMaterial;
    };
    const walnut = built.group.getObjectByName('m14-stock')!.children
      .map((child) => (child as THREE.Mesh).material as THREE.MeshStandardMaterial)
      .find((material) => material instanceof THREE.MeshPhysicalMaterial)!;
    expect(walnut.map).not.toBeNull();
    expect(walnut.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(walnut.bumpMap).not.toBeNull();
    expect(walnut.bumpMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);

    const steel = materialIn('receiver');
    expect(steel.map).not.toBeNull();
    expect(steel.roughnessMap).toBe(steel.bumpMap);
    expect(steel.roughnessMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
  });

  it('keeps texture detail at real scale on every metal part, however small', () => {
    const built = buildProceduralViewModel(view);
    const receiverMesh = built.group.getObjectByName('m14-receiver')!.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const uv = receiverMesh.geometry.attributes.uv;
    for (let vertex = 0; vertex < uv.count; vertex++) {
      // Metric coordinates: a part of a few centimetres never spans a whole 0..1 box UV.
      expect(Math.abs(uv.getX(vertex))).toBeLessThan(0.3);
      expect(Math.abs(uv.getY(vertex))).toBeLessThan(0.3);
    }
  });

  it('seats the magazine in the well, hiding the rounds inside the receiver', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    expect(magazine.position.toArray()).toEqual([...M14_PROFILE.magazine.seat]);
    expect(built.reloadParts!.rounds!.visible).toBe(false);
    expect(built.reloadParts!.rounds!.children).toHaveLength(2);
  });
});

describe('M14 reload', () => {
  function animated() {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const handle = built.reloadParts!.handle!;
    const animator = new ReloadAnimator(reload, { magazine, handle, cover: null }, null);
    const update = (progress: number, reloadType: 'empty' | 'tactical'): void => {
      animator.update({ state: 'reloading', stateProgress: progress, reloadType } as Weapon);
    };
    return { magazine, handle, magazineHome: magazine.position.clone(), handleHome: handle.position.clone(), update };
  }

  it('rocks the spent magazine off its front catch and away', () => {
    const { magazine, update } = animated();
    update((reload.magOut + reload.magDrop) / 2, 'empty');
    expect(magazine.rotation.x).toBeGreaterThan(0.1);
    update((reload.magDrop + reload.magIn) / 2, 'empty');
    expect(magazine.visible).toBe(false);
  });

  it('seats a fresh magazine with a slam back at its seat', () => {
    const { magazine, magazineHome, update } = animated();
    update((reload.magIn + reload.magSeat) / 2, 'empty');
    expect(magazine.visible).toBe(true);
    expect(magazine.position.y).toBeLessThan(magazineHome.y);
    update(reload.magSeat + 0.01, 'empty');
    expect(magazine.position.toArray()).toEqual(magazineHome.toArray());
  });

  it('holds the empty action open, tugs it off the stop and lets it slam home', () => {
    const { handle, handleHome, update } = animated();
    update(reload.magSeat, 'empty');
    expect(handle.position.z).toBeCloseTo(handleHome.z + HANDLE_TRAVEL, 6);
    const letGo = reload.charge + (reload.chargeEnd - reload.charge) * HANDLE_RELEASE_FRACTION;
    update((reload.charge + letGo) / 2, 'empty');
    expect(handle.position.z).toBeGreaterThan(handleHome.z + HANDLE_TRAVEL);
    update(reload.chargeEnd - 0.01, 'empty');
    expect(handle.position.z).toBeCloseTo(handleHome.z, 6);
  });

  it('leaves the action forward during a tactical reload', () => {
    const { handle, handleHome, update } = animated();
    update((reload.charge + reload.chargeEnd) / 2, 'tactical');
    expect(handle.position.toArray()).toEqual(handleHome.toArray());
  });

  it('cycles the operating rod per shot and locks it open on the last round', () => {
    const weapon = new Weapon(definition, () => 0.5);
    const weaponView = new WeaponView(definition, null);
    const handle = weaponView.root.getObjectByName('m14-charging-handle')!;
    const homeZ = handle.position.z;
    weapon.reserveAmmo = 0;
    weapon.ammoInMagazine = 0;
    weaponView.update(1 / 120, weapon, 0, 0, 0);
    expect(handle.position.z).toBeCloseTo(homeZ + HANDLE_TRAVEL, 6);
  });
});

describe('M14 wall-buy silhouette', () => {
  it('draws the M14 profile instead of the generic long gun', () => {
    const wallBuy = new WallBuy(MANSION_WALL_BUYS.find((config) => config.weaponId === 'm14')!);
    const wall = new WallBuyView(wallBuy, definition, new THREE.Group());
    expect(wall.group.userData.silhouette).toBe('m14');
    for (const part of [
      'stock', 'buttplate', 'handguard', 'receiver', 'trigger-guard', 'magazine', 'operating-rod',
      'rear-sight', 'front-sight', 'gas-cylinder', 'barrel', 'flash-suppressor',
    ]) {
      expect(wall.group.getObjectByName(`m14-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.42);
    expect(size.x).toBeLessThan(1.58);
    expect(size.y).toBeLessThan(0.45);
  });
});
