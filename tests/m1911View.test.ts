import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, buildWeaponDisplayModel, WeaponView } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const definition = WEAPON_DEFINITIONS.m1911;
const originalDocument = globalThis.document;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

function namedMeshes(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const matches: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name === name) matches.push(object);
  });
  return matches;
}

describe('M1911 first-person model', () => {
  it('keeps the pistol below the sightline and closer to the screen center', () => {
    expect(definition.view.frame).toBe('pistol');
    expect(definition.view.hip[0]).toBeGreaterThan(0.1);
    expect(definition.view.hip[0]).toBeLessThan(0.18);
    expect(definition.view.hip[1]).toBeLessThanOrEqual(-0.19);
    expect(definition.view.hip[2]).toBeGreaterThanOrEqual(-0.48);
    expect(definition.view.hip[2]).toBeLessThanOrEqual(-0.45);
    expect(definition.view.ads[2]).toBeLessThanOrEqual(-0.34);
  });

  it('keeps the signature slide, profiled grip, oval trigger guard and animated magazine', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.name).toBe('m1911-root');
    const frame = built.group.getObjectByName('m1911-frame');
    const slide = built.group.getObjectByName('m1911-slide');
    expect(frame?.parent).toBe(built.group);
    expect(slide?.parent).toBe(built.group);
    expect(namedMeshes(built.group, 'm1911-walnut-grip-panel')).toHaveLength(2);
    expect(namedMeshes(built.group, 'm1911-trigger-guard')).toHaveLength(1);
    expect(frame?.getObjectByName('m1911-barrel')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-recoil-spring-plug')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-trigger')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-hammer')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-mainspring-housing')).toBeTruthy();
    expect(namedMeshes(slide!, 'm1911-rear-sight')).toHaveLength(3);
    expect(namedMeshes(slide!, 'm1911-front-sight')).toHaveLength(2);
    expect(built.reloadParts?.magazine).toBeTruthy();
    expect(built.reloadParts?.magazine?.parent).toBe(built.group);
    expect(built.reloadParts?.handle).toBe(built.slide);
  });

  it.each(Object.keys(WEAPON_DEFINITIONS))('does not attach player hands to %s', (weaponId) => {
    const view = new WeaponView(WEAPON_DEFINITIONS[weaponId as keyof typeof WEAPON_DEFINITIONS], null);
    const handObjects: THREE.Object3D[] = [];
    view.root.traverse((object) => {
      if (object.name.startsWith('fps-') || object.name.includes('hand-anchor')) handObjects.push(object);
    });
    expect(handObjects).toHaveLength(0);
  });

  it('uses shallow side serrations instead of full-width blocks across the sight picture', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const slideBodyBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-slide-body')!);
    const serrations = namedMeshes(built.group, 'm1911-slide-serration');
    expect(serrations).toHaveLength(14);
    for (const serration of serrations) {
      const box = new THREE.Box3().setFromObject(serration);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(0.005);
      expect(Math.abs(serration.position.x)).toBeGreaterThan(0.015);
      expect(box.min.x).toBeGreaterThanOrEqual(slideBodyBox.min.x - 0.0001);
      expect(box.max.x).toBeLessThanOrEqual(slideBodyBox.max.x + 0.0001);
    }
  });

  it('embeds ADS-visible details into the slide and grip silhouette', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const slideBodyBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-slide-body')!);
    const sights = [
      ...namedMeshes(built.group, 'm1911-rear-sight'),
      ...namedMeshes(built.group, 'm1911-front-sight'),
    ];
    const sightBox = new THREE.Box3();
    for (const sight of sights) {
      sightBox.union(new THREE.Box3().setFromObject(sight));
      expect(new THREE.Box3().setFromObject(sight).intersectsBox(slideBodyBox)).toBe(true);
    }
    expect(Number.isFinite(sightBox.max.y)).toBe(true);
    expect(sightBox.max.y).toBeCloseTo(built.sightY, 6);

    const gripCoreBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-grip-core')!);
    for (const panel of namedMeshes(built.group, 'm1911-walnut-grip-panel')) {
      const panelBox = new THREE.Box3().setFromObject(panel);
      expect(panelBox.intersectsBox(gripCoreBox)).toBe(true);
      expect(panelBox.min.x).toBeGreaterThanOrEqual(gripCoreBox.min.x - 0.0025);
      expect(panelBox.max.x).toBeLessThanOrEqual(gripCoreBox.max.x + 0.0025);
    }
  });

  it('uses full-size Government proportions and rakes the grip base rearward', () => {
    const built = buildProceduralViewModel(definition.view);
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    const magazine = built.group.getObjectByName('m1911-magazine')!;
    const screws = namedMeshes(built.group, 'm1911-grip-screw');

    expect(size.z).toBeGreaterThan(0.21);
    expect(size.y / size.z).toBeGreaterThan(0.6);
    expect(size.y / size.z).toBeLessThan(0.68);
    expect(size.x / size.z).toBeLessThan(0.18);
    expect(magazine.rotation.x).toBeLessThan(0);
    expect(screws).toHaveLength(4);
    const leftScrews = screws.filter((screw) => screw.position.x < 0).sort((a, b) => b.position.y - a.position.y);
    expect(leftScrews[1].position.z).toBeGreaterThan(leftScrews[0].position.z);
  });

  it('anchors muzzle and casing effects to the modeled openings', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const crownBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-muzzle-crown')!);
    const portBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-ejection-port')!);

    expect(built.muzzlePosition.z).toBeLessThanOrEqual(crownBox.min.z + 0.001);
    expect(built.muzzlePosition.y).toBeGreaterThan(crownBox.min.y);
    expect(built.muzzlePosition.y).toBeLessThan(crownBox.max.y);
    expect(built.ejectionPosition.x).toBeGreaterThan(portBox.min.x);
    expect(built.ejectionPosition.y).toBeGreaterThan(portBox.min.y);
    expect(built.ejectionPosition.y).toBeLessThan(portBox.max.y);
    expect(built.ejectionPosition.z).toBeGreaterThan(portBox.min.z);
    expect(built.ejectionPosition.z).toBeLessThan(portBox.max.z);
  });

  it('reuses the same M1911 identity in world display models', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.72);
    expect(display.getObjectByName('m1911-slide')).toBeTruthy();
    expect(display.getObjectByName('m1911-grip-core')).toBeTruthy();
    expect(display.getObjectByName('m1911-recoil-spring-plug')).toBeTruthy();
    const size = new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.y);
  });

  it('returns the complete slide to battery after an empty reload', () => {
    const weapon = new Weapon(definition, () => 0.5);
    const view = new WeaponView(definition, null);
    const slide = view.root.getObjectByName('m1911-slide')!;
    const homeZ = slide.position.z;
    const dt = 1 / 120;

    for (let shot = 0; shot < definition.magazineSize; shot++) {
      weapon.update(dt, { trigger: true, ads: false });
      if (weapon.pendingEvents.some((event) => event.type === 'shot')) view.onShot();
      weapon.clearEvents();
      weapon.update(dt, { trigger: false, ads: false });
      for (let frame = 0; frame < 22; frame++) weapon.update(dt, { trigger: false, ads: false });
    }
    expect(weapon.state).toBe('reloading');

    let reloadFrames = 0;
    while (weapon.state === 'reloading' && reloadFrames < 220) {
      weapon.update(dt, { trigger: false, ads: false });
      view.update(dt, weapon, 0, 0, 0);
      reloadFrames++;
    }

    expect(weapon.state).toBe('ready');
    expect(slide.position.z).toBeCloseTo(homeZ, 6);
  });

  it('restores the magazine and slide immediately when the view is reset', () => {
    const weapon = new Weapon(definition, () => 0.5);
    const view = new WeaponView(definition, null);
    const magazine = view.root.getObjectByName('m1911-magazine')!;
    const slide = view.root.getObjectByName('m1911-slide')!;
    const magazineHome = magazine.position.clone();
    const slideHome = slide.position.clone();
    weapon.ammoInMagazine = 2;
    weapon.reload();

    for (let frame = 0; frame < 50; frame++) {
      weapon.update(1 / 120, { trigger: false, ads: false });
      view.update(1 / 120, weapon, 0, 0, 0);
    }
    view.reset();
    expect(magazine.visible).toBe(true);
    expect(magazine.position.distanceTo(magazineHome)).toBeLessThan(1e-6);
    expect(slide.position.distanceTo(slideHome)).toBeLessThan(1e-6);
  });
});

describe('M1911 wall-buy silhouette', () => {
  it('renders a dedicated Government profile with a real trigger opening', () => {
    const parent = new THREE.Group();
    const buy = new WallBuy({
      id: 'test-m1911',
      weaponId: 'm1911',
      price: 500,
      ammoPrice: 250,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      floor: 0,
    });
    const view = new WallBuyView(buy, definition, parent);
    const size = new THREE.Box3().setFromObject(view.group).getSize(new THREE.Vector3());

    const slide = view.group.getObjectByName('m1911-wall-slide')!;
    const frame = view.group.getObjectByName('m1911-wall-frame') as THREE.Mesh<THREE.ExtrudeGeometry>;
    expect(view.group.userData.silhouette).toBe('m1911');
    expect(slide).toBeTruthy();
    expect(frame).toBeTruthy();
    expect(view.group.getObjectByName('m1911-wall-spur-hammer')).toBeTruthy();
    expect(view.group.getObjectByName('m1911-wall-front-sight')).toBeTruthy();
    expect((frame.geometry.parameters.shapes as THREE.Shape).holes).toHaveLength(1);
    expect(size.x).toBeLessThan(1);
    expect(size.y / size.x).toBeGreaterThan(0.6);
    expect(size.y / size.x).toBeLessThan(0.68);
    const slideBox = new THREE.Box3().setFromObject(slide);
    const frameBox = new THREE.Box3().setFromObject(frame);
    expect(slideBox.max.x).toBeGreaterThan(frameBox.max.x);
    expect(slideBox.max.y).toBeGreaterThan(frameBox.max.y);
    expect(parent.children).toContain(view.group);
  });
});
