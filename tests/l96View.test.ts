import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { L96_PROFILE } from '../src/weapons/L96ViewModel';
import { BOLT_REAR_FRACTION, ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, WeaponView } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

const definition = WEAPON_DEFINITIONS.l96;
const view = definition.view;
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

function fakeWeapon(state: Weapon['state'], stateProgress: number): Weapon {
  return { state, stateProgress, adsAlpha: 0, reloadType: 'empty' } as Weapon;
}

describe('L96A1 view model', () => {
  it('uses the dedicated procedural rifle instead of the old GLB', () => {
    expect(view.modelUrl).toBeUndefined();
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('l96-root');
    for (const name of ['stock', 'action', 'barrel', 'scope', 'bolt', 'magazine', 'bipod']) {
      expect(built.group.getObjectByName(`l96-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('l96-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('l96-bolt'));

    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    // Real L96A1: ~1.16 m overall, a slim stock and a 42 mm objective bell.
    expect(size.z).toBeGreaterThan(1.1);
    expect(size.z).toBeLessThan(1.22);
    expect(size.x).toBeLessThan(0.13);
    expect(built.sightY).toBeCloseTo(view.sightHeight, 5);
    expect(built.muzzlePosition.z).toBeLessThan(L96_PROFILE.barrel.muzzleZ);

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

  it('keeps the scope clear of the lifted bolt knob and the barrel', () => {
    const built = buildProceduralViewModel(view);
    const scopeBottom = view.sightHeight - 0.0252;
    expect(scopeBottom).toBeGreaterThan(L96_PROFILE.barrel.rearRadius);
    const bolt = built.reloadParts!.handle!;
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine: null, handle: bolt, cover: null }, null);
    const knob = new THREE.Vector3(L96_PROFILE.boltKnob.x, L96_PROFILE.boltKnob.y, L96_PROFILE.boltKnob.z - bolt.position.z);
    built.group.updateMatrixWorld(true);
    const rest = bolt.localToWorld(knob.clone());

    animator.updateCycling(BOLT_REAR_FRACTION);
    built.group.updateMatrixWorld(true);
    const rear = bolt.localToWorld(knob.clone());
    expect(rear.z - rest.z).toBeGreaterThan(0.08);
    expect(rear.y).toBeGreaterThan(rest.y + 0.03);
    expect(Math.hypot(rear.x, rear.y - view.sightHeight)).toBeGreaterThan(0.021 + L96_PROFILE.boltKnob.radius);

    animator.updateCycling(1);
    expect(bolt.position.z).toBeCloseTo(0.03, 6);
    expect(bolt.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
  });

  it('drops and reseats one detachable magazine during a reload', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const home = magazine.position.clone();
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine, handle: built.reloadParts!.handle!, cover: null }, null);
    const update = (progress: number): void => animator.update(fakeWeapon('reloading', progress));
    update(0.15);
    expect(magazine.position.y).toBeLessThan(home.y);
    update(0.3);
    expect(magazine.visible).toBe(false);
    update(0.5);
    expect(magazine.visible).toBe(true);
    update(0.6);
    expect(magazine.position.toArray()).toEqual(home.toArray());
  });

  it('ejects the spent case once, when the bolt reaches the rear', () => {
    const weaponView = new WeaponView(definition, null);
    const onBoltEject = vi.fn();
    weaponView.onBoltEject = onBoltEject;
    weaponView.update(1 / 60, fakeWeapon('cycling', BOLT_REAR_FRACTION - 0.05), 0, 0, 0);
    expect(onBoltEject).not.toHaveBeenCalled();
    weaponView.update(1 / 60, fakeWeapon('cycling', BOLT_REAR_FRACTION + 0.01), 0, 0, 0);
    weaponView.update(1 / 60, fakeWeapon('cycling', 0.9), 0, 0, 0);
    expect(onBoltEject).toHaveBeenCalledTimes(1);
    weaponView.update(1 / 60, fakeWeapon('ready', 0), 0, 0, 0);
    weaponView.update(1 / 60, fakeWeapon('cycling', 0.5), 0, 0, 0);
    expect(onBoltEject).toHaveBeenCalledTimes(2);
  });
});

describe('L96A1 wall-buy silhouette', () => {
  it('traces the thumbhole rifle with its scope, bolt and bipod', () => {
    const buy = new WallBuy({
      id: 'test-l96', weaponId: 'l96', price: 1250, ammoPrice: 625, position: { x: 0, y: 0, z: 0 }, yaw: 0, floor: 0,
    });
    const wall = new WallBuyView(buy, definition, new THREE.Group());

    expect(wall.group.userData.silhouette).toBe('l96');
    for (const part of ['stock', 'buttpad', 'receiver', 'barrel', 'scope', 'turret', 'bolt-knob', 'magazine', 'bipod']) {
      expect(wall.group.getObjectByName(`l96-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.6);
    expect(size.x).toBeLessThan(1.8);
    expect(size.y).toBeLessThan(0.45);
  });
});

describe('L96A1 audio', () => {
  it('layers a supersonic crack and a room tail over the report', () => {
    const audio = new AudioSystem() as any;
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
    audio.context = vi.fn(() => ({
      ctx: {
        currentTime: 0,
        createBufferSource: () => ({ ...node(), buffer: null }),
        createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() }),
        createGain: () => ({ ...node(), gain: param() }),
        createOscillator: () => ({ ...node(), type: 'sine', frequency: param() }),
      },
      master: {},
      noise: {},
    }));
    const tick = vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const tail = vi.spyOn(audio, 'playShotTail').mockImplementation(() => {});

    audio.playShot(definition.audio);

    expect(tick.mock.calls.some((call) => (call[1] as number) > 4000)).toBe(true);
    expect(tail).toHaveBeenCalledWith(definition.audio.volume, definition.audio.tail);
  });

  it('sequences the bolt foley across the visible bolt stroke', () => {
    const audio = new AudioSystem() as any;
    const clang = vi.spyOn(audio, 'metalClang').mockImplementation(() => {});
    const scrape = vi.spyOn(audio, 'scrape').mockImplementation(() => {});
    vi.spyOn(audio, 'tick').mockImplementation(() => {});

    audio.playBolt(definition.boltCycleTime);

    const clangTimes = clang.mock.calls.map((call) => call[0] as number);
    expect(clangTimes[0]).toBe(0);
    expect(clangTimes).toContain(BOLT_REAR_FRACTION * definition.boltCycleTime);
    expect(Math.max(...clangTimes)).toBeLessThan(definition.boltCycleTime);
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  it('replays the full bolt cycle for the empty-reload action instead of rifle ticks', () => {
    const audio = new AudioSystem() as any;
    const playBolt = vi.spyOn(audio, 'playBolt').mockImplementation(() => {});
    const clang = vi.spyOn(audio, 'metalClang').mockImplementation(() => {});

    audio.playReloadPhase('chargeStart', false, 'bolt', 0.35);
    audio.playReloadPhase('chargeEnd', false, 'bolt', 0.35);

    expect(playBolt).toHaveBeenCalledWith(0.35);
    expect(clang).not.toHaveBeenCalled();
  });
});
