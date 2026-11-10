import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS, WEAPON_ORDER, ZOMBIES_WEAPON_PRELOAD } from '../src/config/weapons';
import { L96_PROFILE } from '../src/weapons/L96ViewModel';
import { M40_PROFILE } from '../src/weapons/M40ViewModel';
import { BOLT_REAR_FRACTION, ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel } from '../src/weapons/WeaponView';
import type { WeaponDefinition } from '../src/weapons/WeaponTypes';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';
import { ZOMBIES_RESERVE_AMMO } from '../src/zombies/ZombieConfig';
import { MANSION_WALL_BUYS } from '../src/zombies/maps/BurnedMansionConfig';
import { STATION33_WALL_BUYS } from '../src/zombies/maps/Station33Config';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const m40 = WEAPON_DEFINITIONS.m40;
const l96 = WEAPON_DEFINITIONS.l96;
const view = m40.view;
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

/** Everything but identity, cadence and look. */
function sharedStatsOf(definition: WeaponDefinition): Partial<WeaponDefinition> {
  const { id: _id, name: _name, rpm: _rpm, boltCycleTime: _cycle, view: _view, ...rest } = definition;
  return rest;
}

describe('M40 definition', () => {
  it('shares every L96 attribute but its name, look and a slightly faster bolt', () => {
    expect(m40.id).toBe('m40');
    expect(m40.name).toBe('M40');
    expect(sharedStatsOf(m40)).toEqual(sharedStatsOf(l96));
    // Same shot sample and bolt foley: the audio config and reload style are the L96's.
    expect(m40.audio).toBe(l96.audio);
    expect(view.reloadAnim).toBe(l96.view.reloadAnim);
    // Same right hand on the same grip, bolt and magazine; only the support hand fits the wider forend.
    expect(view.hands.right).toBe(l96.view.hands.right);
    expect(view.hands.action).toBe(l96.view.hands.action);
    expect(view.hands.magazine).toBe(l96.view.hands.magazine);
    expect(view.frame).toBe('m40');

    const cadence = (definition: WeaponDefinition): number => Math.max(60 / definition.rpm, definition.boltCycleTime);
    expect(cadence(m40)).toBeLessThan(cadence(l96));
    expect(cadence(m40)).toBeGreaterThan(cadence(l96) * 0.75);
    expect(m40.boltCycleTime / (60 / m40.rpm)).toBeCloseTo(l96.boltCycleTime / (60 / l96.rpm), 1);
  });

  it('gets one more shot than the L96 out of 2.6 s of trigger taps', () => {
    const shotsIn = (definition: WeaponDefinition, seconds: number): number => {
      const weapon = new Weapon(definition, () => 0.5);
      const dt = 1 / 240;
      let shots = 0;
      for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
        weapon.update(dt, { trigger: frame % 2 === 0, ads: false });
        shots += weapon.pendingEvents.filter((event) => event.type === 'shot').length;
        weapon.clearEvents();
      }
      return shots;
    };
    expect(shotsIn(l96, 2.6)).toBe(3);
    expect(shotsIn(m40, 2.6)).toBe(4);
  });

  it('is a standard Mystery Box pull, preloaded, with the L96 reserve and death', () => {
    expect(MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'm40')).toEqual({ weaponId: 'm40', weight: 20, rarity: 'standard' });
    expect(ZOMBIES_WEAPON_PRELOAD).toContain('m40');
    expect(WEAPON_ORDER).toContain('m40');
    expect(ZOMBIES_RESERVE_AMMO.m40).toBe(ZOMBIES_RESERVE_AMMO.l96);
  });

  it('hangs on one wall of every map at the same sniper price', () => {
    for (const buys of [STATION33_WALL_BUYS, MANSION_WALL_BUYS]) {
      const m40Buys = buys.filter((buy) => buy.weaponId === 'm40');
      expect(m40Buys).toHaveLength(1);
      expect(m40Buys[0]).toMatchObject({ price: 2000, ammoPrice: 1000, floor: 0 });
    }
  });
});

describe('M40A5 view model', () => {
  it('reads as a different rifle from the L96 at a glance', () => {
    // Pale sage stock against the L96's dark olive.
    const luminance = (hex: number): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(luminance(view.accentColor)).toBeGreaterThan(luminance(l96.view.accentColor) + 0.08);
    // A much longer scope with a wider bell, on taller rings.
    const length = (scope: ReadonlyArray<readonly [number, number]>): number => scope[scope.length - 1][1] - scope[0][1];
    const bell = (scope: ReadonlyArray<readonly [number, number]>): number => Math.max(...scope.map(([radius]) => radius));
    expect(length(M40_PROFILE.scope)).toBeGreaterThan(length(L96_PROFILE.scope) + 0.07);
    expect(bell(M40_PROFILE.scope)).toBeGreaterThan(bell(L96_PROFILE.scope) + 0.008);
    expect(view.sightHeight).toBeGreaterThan(l96.view.sightHeight + 0.01);
    // The grey cheek-piece block stands above the comb; there is no thumbhole.
    const cheekTop = Math.max(...M40_PROFILE.cheekPiece.map(([, y]) => y));
    expect(cheekTop).toBeGreaterThan(0.04);
    expect('thumbhole' in M40_PROFILE).toBe(false);
    const built = buildProceduralViewModel(view);
    expect(built.group.getObjectByName('m40-stock')!.children.some((mesh) =>
      ((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex() === 0x4b4f52)).toBe(true);
  });

  it('builds the dedicated rifle at real proportions within the draw-call budget', () => {
    expect(view.modelUrl).toBeUndefined();
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('m40-root');
    for (const name of ['stock', 'action', 'barrel', 'scope', 'bolt', 'magazine', 'bipod']) {
      expect(built.group.getObjectByName(`m40-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('m40-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('m40-bolt'));
    expect(built.reloadParts?.rounds).toBe(built.group.getObjectByName('m40-magazine-rounds'));

    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    // Real M40A5: 1124 mm overall (plus the spacer stack), 50 mm objective bell.
    expect(size.z).toBeGreaterThan(1.1);
    expect(size.z).toBeLessThan(1.18);
    expect(size.x).toBeLessThan(0.13);
    expect(built.sightY).toBeCloseTo(view.sightHeight, 5);
    expect(built.muzzlePosition.z).toBeLessThan(M40_PROFILE.barrel.muzzleZ);

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

  it('looks in through the eyepiece and out through the objective with nothing beyond', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const firstHit = (fromZ: number, direction: number): THREE.Intersection =>
      new THREE.Raycaster(new THREE.Vector3(0, view.sightHeight, fromZ), new THREE.Vector3(0, 0, direction))
        .intersectObject(built.group, true)[0];
    // From the eye, the ocular lens; from the muzzle end, the objective lens. The
    // rings and turret saddle in between stay hidden inside the tube.
    const ocular = firstHit(0.3, -1);
    const objective = firstHit(-1, 1);
    expect(ocular.point.z).toBeCloseTo(M40_PROFILE.ocularLens.z, 3);
    expect(objective.point.z).toBeCloseTo(M40_PROFILE.objectiveLens.z, 3);
    expect(objective.object).toBe(ocular.object);
    // The objective bell clears the barrel beneath it.
    const bell = Math.max(...M40_PROFILE.scope.map(([radius]) => radius));
    expect(view.sightHeight - bell).toBeGreaterThan(M40_PROFILE.barrel.rearRadius + 0.01);
  });

  it('racks the bolt back clear of the scope and returns it home', () => {
    const built = buildProceduralViewModel(view);
    const bolt = built.reloadParts!.handle!;
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine: null, handle: bolt, cover: null }, null);
    const knob = M40_PROFILE.boltKnob;
    const local = new THREE.Vector3(knob.x, knob.y, knob.z - bolt.position.z);
    built.group.updateMatrixWorld(true);
    const rest = bolt.localToWorld(local.clone());

    animator.updateCycling(BOLT_REAR_FRACTION);
    built.group.updateMatrixWorld(true);
    const rear = bolt.localToWorld(local.clone());
    expect(rear.z - rest.z).toBeGreaterThan(0.08);
    expect(rear.y).toBeGreaterThan(rest.y + 0.03);
    // Past the eyepiece, so only the cheek piece could be in the way: it sits behind the stroke.
    expect(Math.hypot(rear.x, rear.y - view.sightHeight)).toBeGreaterThan(0.0245 + knob.radius);
    expect(rear.z + knob.radius).toBeLessThan(M40_PROFILE.cheekPiece[0][0] + 0.02);

    animator.updateCycling(1);
    expect(bolt.position.z).toBeCloseTo(0.03, 6);
    expect(bolt.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
  });

  it('keeps the rounds hidden in the stock while the magazine is seated', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const roundsBox = new THREE.Box3().setFromObject(built.reloadParts!.rounds!);
    expect(roundsBox.max.y).toBeLessThan(-0.008);
    const { z, depth } = M40_PROFILE.magazine;
    expect(roundsBox.min.z).toBeGreaterThan(z - depth / 2 - 0.001);
    expect(roundsBox.max.z).toBeLessThan(z + depth / 2);
  });
});

describe('M40A5 wall-buy silhouette', () => {
  it('traces the A5 rifle with its cheek piece, scope, bolt and bipod', () => {
    const buy = new WallBuy({
      id: 'test-m40', weaponId: 'm40', price: 2000, ammoPrice: 1000, position: { x: 0, y: 0, z: 0 }, yaw: 0, floor: 0,
    });
    const wall = new WallBuyView(buy, m40, new THREE.Group());

    expect(wall.group.userData.silhouette).toBe('m40');
    for (const part of ['stock', 'cheek-piece', 'buttpad', 'trigger-guard', 'receiver', 'barrel', 'scope', 'turret', 'bolt-knob', 'magazine', 'bipod']) {
      expect(wall.group.getObjectByName(`m40-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.55);
    expect(size.x).toBeLessThan(1.75);
    expect(size.y).toBeLessThan(0.45);
  });
});
