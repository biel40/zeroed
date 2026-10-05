import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { RAYGUN_LAYOUT } from '../src/weapons/RayGunViewModel';
import { ReloadAnimator } from '../src/weapons/ReloadAnimator';
import type { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, buildWeaponDisplayModel, WeaponView } from '../src/weapons/WeaponView';

/**
 * Contract tests for the procedural Ray Gun: its named assemblies, a clean
 * picture through the scope tube, the plasma cell reload, the energy flare
 * and flow, and a shot voice of its own.
 */

const definition = WEAPON_DEFINITIONS.raygun;
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
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

function fakeWeapon(state: Weapon['state'], stateProgress: number): Weapon {
  return { state, stateProgress, adsAlpha: 0, reloadType: 'empty' } as Weapon;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('Ray Gun view model', () => {
  it('builds the dedicated model with its assemblies and live cell', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('raygun-root');
    for (const name of ['body', 'barrel', 'arms', 'scope', 'grip', 'cell']) {
      expect(built.group.getObjectByName(`raygun-${name}`), name).toBeDefined();
    }
    expect(built.reloadParts?.magazine).toBe(built.group.getObjectByName('raygun-cell'));
    expect(built.energyMaterials?.length).toBeGreaterThan(0);
    expect(built.energyFlow).toBeInstanceOf(THREE.Texture);
    expect(built.energyMaterials!.every((material) => material.emissiveMap === built.energyFlow)).toBe(true);
  });

  it('fires from the emitter ball and aims through the open scope tube', () => {
    const built = buildProceduralViewModel(view);
    expect(built.muzzlePosition.z).toBeLessThan(RAYGUN_LAYOUT.emitter.z - RAYGUN_LAYOUT.emitter.radius + 0.001);
    expect(built.muzzlePosition.y).toBeCloseTo(0, 6);
    expect(built.sightY).toBeCloseTo(RAYGUN_LAYOUT.sightY, 6);

    // Nothing ahead of the scope may rise into its picture: the seated cell
    // and the field arms stay below the tube's lower rim.
    const scopeFrontZ = RAYGUN_LAYOUT.scope.z - RAYGUN_LAYOUT.scope.length / 2;
    const ceiling = RAYGUN_LAYOUT.sightY - RAYGUN_LAYOUT.scope.radius;
    const scope = built.group.getObjectByName('raygun-scope')!;
    const point = new THREE.Vector3();
    built.group.updateWorldMatrix(true, true);
    let highest = -Infinity;
    built.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.parent === scope) return;
      const position = object.geometry.attributes.position;
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
        if (point.z < scopeFrontZ) highest = Math.max(highest, point.y);
      }
    });
    expect(highest).toBeLessThan(ceiling);
  });

  it('lifts the plasma cell clear of the chamber and reseats it', () => {
    const built = buildProceduralViewModel(view);
    const cell = built.reloadParts!.magazine!;
    const home = cell.position.clone();
    const animator = new ReloadAnimator(view.reloadAnim!, { magazine: cell, handle: null, cover: null }, null);
    const anim = view.reloadAnim!;

    animator.update(fakeWeapon('reloading', anim.magDrop - 0.01));
    expect(worldBox(cell).min.y).toBeGreaterThan(RAYGUN_LAYOUT.chamber.radius);

    animator.update(fakeWeapon('reloading', anim.magSeat + 0.01));
    expect(cell.position.toArray()).toEqual(home.toArray());
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
    expect(meshes).toBeLessThanOrEqual(20);
    expect(triangles).toBeLessThan(8000);
  });

  it('builds the same Ray Gun for world display models (Mystery Box, bunker case)', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.62);
    expect(display.getObjectByName('raygun-root')).toBeDefined();
    const size = worldBox(display).getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(0.62, 2);
  });

  it('flares its energy on each shot and keeps the plasma flowing', () => {
    const weaponView = new WeaponView(definition, null);
    const material = buildProceduralViewModel(view).energyMaterials![0];
    const energy: THREE.MeshStandardMaterial[] = [];
    weaponView.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial
        && object.material.emissiveMap === material.emissiveMap) energy.push(object.material);
    });
    expect(energy.length).toBeGreaterThan(0);
    const idle = fakeWeapon('ready', 0);
    const flow = energy[0].emissiveMap!;

    weaponView.update(1 / 60, idle, 0, 0, 0);
    const offset = flow.offset.y;
    const resting = energy[0].emissiveIntensity;
    weaponView.onShot();
    weaponView.update(1 / 60, idle, 0, 0, 0);
    expect(energy[0].emissiveIntensity).toBeGreaterThan(resting + 1.5);
    expect(flow.offset.y).not.toBe(offset);

    for (let frame = 0; frame < 60; frame++) weaponView.update(1 / 60, idle, 0, 0, 0);
    expect(energy[0].emissiveIntensity).toBeLessThan(2.2);
  });
});

describe('Ray Gun audio', () => {
  it('fires its own warbling zap while the arc weapon keeps its voice', () => {
    const audio = new AudioSystem() as any;
    const rayGun = vi.spyOn(audio, 'playRayGunShot').mockImplementation(() => {});
    const arc = vi.spyOn(audio, 'playEnergyShot').mockImplementation(() => {});

    audio.playShot(definition.audio);
    expect(rayGun).toHaveBeenCalledWith(definition.audio);
    expect(arc).not.toHaveBeenCalled();

    audio.playShot(WEAPON_DEFINITIONS.tesla.audio);
    expect(arc).toHaveBeenCalledWith(WEAPON_DEFINITIONS.tesla.audio);
    expect(rayGun).toHaveBeenCalledTimes(1);
  });

  it('layers a vibrato-modulated, filtered zap under a sub punch and an echo', () => {
    const audio = new AudioSystem() as any;
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const node = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
    const oscillators: Array<{ type: string; connect: ReturnType<typeof vi.fn> }> = [];
    const filters: Array<{ type: string; Q: ReturnType<typeof param> }> = [];
    audio.context = vi.fn(() => ({
      ctx: {
        currentTime: 0,
        createBufferSource: () => ({ ...node(), buffer: null }),
        createBiquadFilter: () => {
          const filter = { ...node(), type: 'lowpass', frequency: param(), Q: param() };
          filters.push(filter);
          return filter;
        },
        createGain: () => ({ ...node(), gain: param() }),
        createOscillator: () => {
          const oscillator = { ...node(), type: 'sine', frequency: param() };
          oscillators.push(oscillator);
          return oscillator;
        },
      },
      master: {},
      noise: {},
    }));
    vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const sweep = vi.spyOn(audio, 'sweep').mockImplementation(() => {});

    audio.playShot(definition.audio);

    expect(oscillators.map((oscillator) => oscillator.type)).toEqual(['sawtooth', 'sine']);
    expect(filters[0].Q.value).toBeGreaterThan(4);
    // Sub punch from the configured thump, plus a delayed echo zap.
    expect(sweep).toHaveBeenCalledWith(0, 'sine', definition.audio.thump, expect.any(Number), expect.any(Number), expect.any(Number));
    expect(sweep.mock.calls.some(([offset]) => (offset as number) > 0)).toBe(true);
  });
});
