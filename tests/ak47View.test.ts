import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { AK47_PROFILE, ak47MagazineOutline } from '../src/weapons/AK47ViewModel';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

/**
 * Contract tests for the procedural AK-47 Type 3: real proportions traced
 * from a reference photo, a clean iron-sight picture, the curved magazine
 * seated under the receiver, and the rock-in reload driving its live parts.
 */

const definition = WEAPON_DEFINITIONS.ak47;
const view = definition.view;

function fakeWeapon(state: Weapon['state'], stateProgress: number): Weapon {
  return { state, stateProgress, adsAlpha: 0, reloadType: 'empty' } as Weapon;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('AK-47 view model', () => {
  it('builds the dedicated rifle with its animated assemblies', () => {
    expect(view.modelUrl).toBeUndefined();
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('ak47-root');
    for (const name of ['stock', 'grip', 'receiver', 'barrel', 'charging-handle', 'magazine']) {
      expect(built.group.getObjectByName(`ak47-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('ak47-magazine'));
    expect(built.reloadParts?.handle).toBe(built.group.getObjectByName('ak47-charging-handle'));
    // The charging handle rides the right flank, like the real rifle.
    expect(worldBox(built.reloadParts!.handle!).max.x).toBeGreaterThan(0.025);
  });

  it('matches the real rifle: 880 mm overall, slim receiver, muzzle at the nut', () => {
    const built = buildProceduralViewModel(view);
    const size = worldBox(built.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.86);
    expect(size.z).toBeLessThan(0.91);
    expect(size.x).toBeLessThan(0.07);
    expect(built.muzzlePosition.z).toBeLessThan(AK47_PROFILE.muzzleNut.frontZ);
    expect(built.muzzlePosition.y).toBeCloseTo(0, 6);
  });

  it('tops out exactly on the sight line, so ADS sees post and notch level', () => {
    const built = buildProceduralViewModel(view);
    expect(built.sightY).toBeCloseTo(view.sightHeight, 6);
    expect(worldBox(built.group).max.y).toBeCloseTo(built.sightY, 4);
  });

  it('hangs a forward-curving magazine whose top stays below the lightening cuts', () => {
    const outline = ak47MagazineOutline();
    const { wellY, hidden, length } = AK47_PROFILE.magazine;
    const cutBottom = Math.min(...AK47_PROFILE.lighteningCut.map(([, y]) => y));
    expect(Math.max(...outline.map(([, y]) => y))).toBeCloseTo(hidden, 6);
    expect(wellY + hidden).toBeLessThan(cutBottom);

    // Front edge: every step down also moves forward, faster near the base.
    const front = outline.slice(1, outline.length / 2);
    const slopes = front.slice(1).map(([z, y], i) => (front[i][0] - z) / (front[i][1] - y));
    for (const slope of slopes) expect(slope).toBeGreaterThan(0);
    expect(slopes[slopes.length - 1]).toBeGreaterThan(slopes[0] * 1.5);
    const built = buildProceduralViewModel(view);
    const box = worldBox(built.reloadParts!.magazine!);
    expect(box.min.y).toBeLessThan(wellY - length * 0.8);
  });

  it('keeps the procedural detail within a mobile-friendly budget', () => {
    const built = buildProceduralViewModel(view);
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(16);
    expect(triangles).toBeLessThan(6500);
  });

  it('rocks the magazine out base-first and reseats it', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts!.magazine!;
    const home = magazine.position.clone();
    const homeFront = worldBox(magazine).min.z;
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine, handle: built.reloadParts!.handle!, cover: null }, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', (anim.magOut + anim.magDrop) / 2));
    expect(worldBox(magazine).min.z).toBeLessThan(homeFront);
    expect(magazine.position.y).toBeLessThan(home.y);

    animator.update(fakeWeapon('reloading', anim.magSeat + 0.01));
    expect(magazine.position.toArray()).toEqual(home.toArray());
  });

  it('racks the charging handle and carrier rearward and returns them', () => {
    const built = buildProceduralViewModel(view);
    const handle = built.reloadParts!.handle!;
    const homeZ = handle.position.z;
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine: built.reloadParts!.magazine!, handle, cover: null }, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', anim.charge + (anim.chargeEnd - anim.charge) * 0.45));
    expect(handle.position.z - homeZ).toBeGreaterThan(0.03);
    animator.update(fakeWeapon('reloading', anim.chargeEnd));
    expect(handle.position.z).toBeCloseTo(homeZ, 6);
  });

  it('builds the same AK for world display models (Mystery Box, pickups)', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.72);
    expect(display.getObjectByName('ak47-root')).toBeDefined();
    const size = worldBox(display).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x * 5);
  });
});

describe('AK-47 wall-buy silhouette', () => {
  it('traces the rifle from the shared profile, stock to front sight', () => {
    const buy = new WallBuy({
      id: 'test-ak47', weaponId: 'ak47', price: 300, ammoPrice: 150, position: { x: 0, y: 0, z: 0 }, yaw: 0, floor: 0,
    });
    const wall = new WallBuyView(buy, definition, new THREE.Group());

    expect(wall.group.userData.silhouette).toBe('ak47');
    for (const part of [
      'stock', 'buttplate', 'grip', 'receiver', 'dust-cover', 'trigger-guard', 'magazine',
      'rear-sight', 'handguard', 'gas-tube', 'gas-block', 'barrel', 'front-sight',
    ]) {
      expect(wall.group.getObjectByName(`ak47-wall-${part}`), part).toBeDefined();
    }
    const box = worldBox(wall.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.3);
    expect(size.x).toBeLessThan(1.45);
    expect(size.y).toBeLessThan(0.5);
    // Butt at the left edge, muzzle at the right.
    expect(worldBox(wall.group.getObjectByName('ak47-wall-buttplate')!).min.x).toBeCloseTo(box.min.x, 2);
    expect(worldBox(wall.group.getObjectByName('ak47-wall-front-sight')!).max.x).toBeGreaterThan(box.max.x - 0.05);
  });
});

describe('AK-47 audio', () => {
  it('layers crack, room tail and the carrier slamming home over the report', () => {
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
    vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const clang = vi.spyOn(audio, 'metalClang').mockImplementation(() => {});
    const tail = vi.spyOn(audio, 'playShotTail').mockImplementation(() => {});

    audio.playShot(definition.audio);

    expect(tail).toHaveBeenCalledWith(definition.audio.volume, definition.audio.tail);
    expect(clang).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), definition.audio.mechanism, expect.any(Number));
    // Shorter, lighter tail than the full-power L96 report.
    expect(definition.audio.tail!).toBeLessThan(WEAPON_DEFINITIONS.l96.audio.tail!);
  });

  it('gives the rock-and-lock reload its own scrape and heavy carrier slam', () => {
    const audio = new AudioSystem() as any;
    const clang = vi.spyOn(audio, 'metalClang').mockImplementation(() => {});
    const scrape = vi.spyOn(audio, 'scrape').mockImplementation(() => {});
    vi.spyOn(audio, 'tick').mockImplementation(() => {});
    vi.spyOn(audio, 'sweep').mockImplementation(() => {});

    audio.playReloadPhase('magOut', false, 'rock');
    audio.playReloadPhase('chargeStart', false, 'rock');
    expect(scrape).toHaveBeenCalledTimes(2);

    clang.mockClear();
    audio.playReloadPhase('chargeEnd', false, 'rock');
    expect(clang.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
