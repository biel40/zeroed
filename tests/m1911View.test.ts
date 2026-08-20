import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, WeaponView } from '../src/weapons/WeaponView';
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
  it('uses a dedicated pistol frame and a camera pose that does not magnify it like a rifle', () => {
    expect(definition.view.frame).toBe('pistol');
    expect(definition.view.hip[2]).toBeLessThanOrEqual(-0.45);
    expect(definition.view.ads[2]).toBeLessThanOrEqual(-0.34);
  });

  it('keeps the signature slide, grip panels, trigger guard and animated magazine', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.name).toBe('m1911-root');
    const frame = built.group.getObjectByName('m1911-frame');
    const slide = built.group.getObjectByName('m1911-slide');
    expect(frame?.parent).toBe(built.group);
    expect(slide?.parent).toBe(built.group);
    expect(namedMeshes(built.group, 'm1911-walnut-grip-panel')).toHaveLength(2);
    expect(namedMeshes(built.group, 'm1911-trigger-guard')).toHaveLength(3);
    expect(frame?.getObjectByName('m1911-barrel')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-trigger')).toBeTruthy();
    expect(frame?.getObjectByName('m1911-hammer')).toBeTruthy();
    expect(namedMeshes(slide!, 'm1911-rear-sight')).toHaveLength(3);
    expect(namedMeshes(slide!, 'm1911-front-sight')).toHaveLength(2);
    expect(built.reloadParts?.magazine).toBeTruthy();
    expect(built.reloadParts?.magazine?.parent).toBe(built.group);
    expect(built.reloadParts?.handle).toBe(built.slide);
  });

  it('uses shallow side serrations instead of full-width blocks across the sight picture', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const slideBodyBox = new THREE.Box3().setFromObject(built.group.getObjectByName('m1911-slide-body')!);
    const serrations = namedMeshes(built.group, 'm1911-slide-serration');
    expect(serrations).toHaveLength(10);
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
      expect(panelBox.min.x).toBeGreaterThanOrEqual(gripCoreBox.min.x - 0.0015);
      expect(panelBox.max.x).toBeLessThanOrEqual(gripCoreBox.max.x + 0.0015);
    }
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
});

describe('M1911 wall-buy silhouette', () => {
  it('renders a compact pistol profile instead of the generic long-gun template', () => {
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

    expect(view.group.userData.silhouette).toBe('pistol');
    expect(view.group.getObjectByName('pistol-slide')).toBeTruthy();
    expect(view.group.getObjectByName('pistol-grip')).toBeTruthy();
    expect(namedMeshes(view.group, 'pistol-trigger-guard')).toHaveLength(3);
    expect(size.x).toBeLessThan(1);
    expect(size.y).toBeGreaterThan(0.45);
    expect(parent.children).toContain(view.group);
  });
});
