import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MUZZLE_FLARES } from '../src/config/muzzleFlares';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { seededRandom } from '../src/weapons/ProceduralTextures';
import { buildFlareGeometry, flareEnvelope, flareLightDecay, MuzzleFlare } from '../src/weapons/MuzzleFlare';
import { WeaponView } from '../src/weapons/WeaponView';
import type { WeaponDefinition } from '../src/weapons/WeaponTypes';
import { resetSettings, updateSettings } from '../src/core/PlayerSettings';
import type { SpringRecoil } from '../src/weapons/SpringRecoil';
import type { SustainedFireKick } from '../src/weapons/SustainedFireKick';
import { Weapon } from '../src/weapons/Weapon';

const DT = 1 / 60;
const FLARE_NAME = 'muzzle-flare';

const originalDocument = globalThis.document;
beforeAll(() => {
  // The standard flash paints a canvas; node has no DOM.
  const context = new Proxy({}, { get: () => () => ({ addColorStop: () => undefined }) });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  });
});
afterAll(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});
afterEach(() => resetSettings());

function isBallistic(definition: WeaponDefinition): boolean {
  return !definition.energy && !definition.flame && definition.view.energyColor === undefined;
}

describe('Muzzle flare data', () => {
  it('gives every gunpowder weapon a flare and no energy or flame weapon one', () => {
    for (const definition of Object.values(WEAPON_DEFINITIONS)) {
      expect(definition.muzzleFlare !== undefined, definition.id).toBe(isBallistic(definition));
    }
  });

  it('keeps the flame brief, with a compact pistol core', () => {
    for (const [name, flare] of Object.entries(MUZZLE_FLARES)) {
      expect(flare.duration, name).toBeGreaterThanOrEqual(0.03);
      expect(flare.duration, name).toBeLessThanOrEqual(0.06);
    }
    expect(MUZZLE_FLARES.pistol.burst).toBeLessThanOrEqual(0.03);
  });

  it('scales the flame with the cartridge: pistol < carbine < rifle < sniper < anti-materiel', () => {
    const order = [MUZZLE_FLARES.pistol, MUZZLE_FLARES.carbine, MUZZLE_FLARES.rifle, MUZZLE_FLARES.sniper, MUZZLE_FLARES.antiMateriel];
    for (let index = 1; index < order.length; index++) {
      expect(order[index].length).toBeGreaterThan(order[index - 1].length);
      expect(order[index].light).toBeGreaterThan(order[index - 1].light);
    }
  });
});

describe('Muzzle flare geometry', () => {
  it('gives the crown flash depth instead of a flat disc perpendicular to the barrel', () => {
    const geometry = buildFlareGeometry(MUZZLE_FLARES.pistol);
    const positions = geometry.getAttribute('position');
    const shapes = geometry.getAttribute('aShape');
    const depths = new Set<number>();
    for (let index = 0; index < positions.count; index++) {
      if (shapes.getX(index) === 0) depths.add(positions.getZ(index));
    }
    expect(depths.size).toBeGreaterThan(3);
  });

  it('reaches forward from the crown and never back into the weapon', () => {
    const geometry = buildFlareGeometry(MUZZLE_FLARES.rifle);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Forward is -Z: the flame ends at its length and starts at the crown.
    expect(box.max.z).toBeLessThanOrEqual(0);
    expect(box.min.z).toBeCloseTo(-MUZZLE_FLARES.rifle.length, 5);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(Math.max(MUZZLE_FLARES.rifle.width, MUZZLE_FLARES.rifle.burst * 2) + 1e-6);
  });

  it('adds side jets only for a muzzle brake, from the brake outwards', () => {
    const plain = buildFlareGeometry(MUZZLE_FLARES.sniper);
    const braked = buildFlareGeometry(MUZZLE_FLARES.antiMateriel);
    expect(braked.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count);
    braked.computeBoundingBox();
    const vents = MUZZLE_FLARES.antiMateriel.vents!;
    expect(braked.boundingBox!.max.x).toBeCloseTo(vents.offset + vents.length, 5);
    expect(braked.boundingBox!.max.z).toBeLessThanOrEqual(vents.behind + vents.spread / 2 + 1e-6);
  });

  it('builds more forward tongues for a wider, more ragged flame', () => {
    const tongues = (count: number): number => buildFlareGeometry({ ...MUZZLE_FLARES.carbine, tongues: count }).getAttribute('position').count;
    expect(tongues(5)).toBeGreaterThan(tongues(3));
  });
});

describe('Muzzle flare envelope', () => {
  it('can reuse the envelope storage during automatic fire', () => {
    const envelope = { fade: 0, heat: 0, stretch: 0 };
    expect(flareEnvelope(0.5, envelope)).toBe(envelope);
    expect(envelope.fade).toBeGreaterThan(0);
    expect(flareEnvelope(1, envelope)).toBe(envelope);
    expect(envelope.fade).toBe(0);
  });

  it('starts at full strength and white-hot, then cools and fades to nothing', () => {
    const start = flareEnvelope(0);
    const end = flareEnvelope(1);
    expect(start.fade).toBe(1);
    expect(start.heat).toBe(1);
    expect(end.fade).toBe(0);
    for (let progress = 0.1; progress < 1; progress += 0.1) {
      const earlier = flareEnvelope(progress - 0.1);
      const now = flareEnvelope(progress);
      expect(now.fade).toBeLessThan(earlier.fade);
      expect(now.heat).toBeLessThan(earlier.heat);
      expect(now.stretch).toBeGreaterThan(earlier.stretch);
    }
  });

  it('drops the shot light under 5 % by the end of the flare', () => {
    const duration = MUZZLE_FLARES.carbine.duration;
    expect(Math.exp(-flareLightDecay(duration) * duration)).toBeLessThan(0.05);
  });
});

describe('Muzzle flare playback', () => {
  it('shows each shot for its duration only, with nothing left lit afterwards', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.carbine, seededRandom(4));
    expect(flare.root.visible).toBe(false);
    let visibleFrames = 0;
    // As in the game loop: the shot lands, the view updates, the frame is drawn.
    for (let frame = 0; frame < 30; frame++) {
      if (frame === 0) flare.trigger();
      flare.update(DT);
      if (flare.root.visible) visibleFrames++;
    }
    expect(visibleFrames).toBe(Math.ceil(MUZZLE_FLARES.carbine.duration / DT));
    expect(flare.root.visible).toBe(false);
  });

  it('varies roll, size and shape between shots without allocating', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.rifle, seededRandom(9));
    const mesh = flare.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const { geometry, material } = mesh;
    const looks = new Set<string>();
    // Full auto for twenty seconds.
    for (let shot = 0; shot < 1200; shot++) {
      flare.trigger();
      looks.add(`${flare.root.rotation.z.toFixed(3)}|${flare.root.scale.x.toFixed(3)}|${material.uniforms.uSeed.value.toFixed(3)}`);
      flare.update(DT);
    }
    expect(looks.size).toBeGreaterThan(1000);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    expect(flare.root.children).toHaveLength(1);
    for (const scale of [flare.root.scale.x, flare.root.scale.y]) {
      expect(scale).toBeGreaterThan(0.8);
      expect(scale).toBeLessThan(1.2);
    }
  });

  it('hides at once on reset', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.pistol, seededRandom(2));
    flare.trigger();
    flare.reset();
    expect(flare.root.visible).toBe(false);
    flare.update(DT);
    expect(flare.root.visible).toBe(false);
  });

  it('keeps muzzle-brake jets aligned with the barrel ports between shots', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.antiMateriel, seededRandom(7));
    for (let shot = 0; shot < 20; shot++) {
      flare.trigger();
      expect(flare.root.rotation.z).toBe(0);
    }
  });

  it('advances flame turbulence and resets it for each shot without rebuilding resources', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.pistol, seededRandom(3));
    const mesh = flare.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    flare.trigger();
    expect(mesh.material.uniforms.uProgress.value).toBe(0);
    flare.update(DT);
    flare.update(DT);
    expect(mesh.material.uniforms.uProgress.value).toBeGreaterThan(0);
    flare.trigger();
    expect(mesh.material.uniforms.uProgress.value).toBe(0);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.blending).toBe(THREE.NormalBlending);
    expect(mesh.material.forceSinglePass).toBe(true);
  });
});

describe('Muzzle flare in the weapon view', () => {
  it.each([false, true])('keeps the pistol flame on the muzzle through recoil (ADS: %s)', (ads) => {
    const definition = WEAPON_DEFINITIONS.m1911;
    const weapon = new Weapon(definition, seededRandom(1));
    const view = new WeaponView(definition, null, null, { cinematicFlash: true });
    for (let frame = 0; frame < 60; frame++) {
      weapon.update(DT, { trigger: false, ads });
      view.update(DT, weapon, 0, 0, 0);
    }
    view.onShot();
    view.update(DT, weapon, 0, 0, 0);
    view.root.updateMatrixWorld(true);
    const flame = view.root.getObjectByName(FLARE_NAME)!;
    const muzzle = view.getMuzzleWorldPosition(new THREE.Vector3());
    expect(flame.getWorldPosition(new THREE.Vector3()).distanceTo(muzzle)).toBeLessThan(1e-6);
    const barrel = new THREE.Vector3(0, 0, -1).transformDirection(flame.parent!.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).transformDirection(flame.matrixWorld);
    expect(forward.dot(barrel)).toBeCloseTo(1, 6);
  });

  it.each([false, true])('preserves automatic kick and the comfort setting (cinematic: %s)', (cinematicFlash) => {
    const view = new WeaponView(WEAPON_DEFINITIONS.ak47, null, null, { cinematicFlash });
    const internals = view as unknown as { spring: SpringRecoil; sustainedKick: SustainedFireKick };
    const kick = vi.spyOn(internals.spring, 'kick').mockImplementation(() => undefined);
    const burst = vi.spyOn(internals.sustainedKick, 'onShot').mockReturnValue(1.6);
    updateSettings({ weaponKick: 0.5 });
    view.onShot(true);
    expect(burst).toHaveBeenCalledWith(true);
    expect(kick).toHaveBeenLastCalledWith(0.8);
    updateSettings({ weaponKick: 0 });
    view.onShot(false);
    expect(burst).toHaveBeenLastCalledWith(false);
    expect(kick).toHaveBeenLastCalledWith(0);
  });

  it('replaces the flash sprites only when the cinematic flash is asked for', () => {
    const standard = new WeaponView(WEAPON_DEFINITIONS.ak47, null);
    expect(standard.root.getObjectByName(FLARE_NAME)).toBeUndefined();
    expect(standard.root.getObjectByName('muzzle-flash')).toBeDefined();

    const cinematic = new WeaponView(WEAPON_DEFINITIONS.ak47, null, null, { cinematicFlash: true });
    const flare = cinematic.root.getObjectByName(FLARE_NAME)!;
    const sprite = cinematic.root.getObjectByName('muzzle-flash')!;
    cinematic.onShot();
    expect(flare.visible).toBe(true);
    expect(sprite.visible).toBe(false);
  });

  it('keeps the brake jets of the Barrett out of the cinematic view and in the standard one', () => {
    expect(new WeaponView(WEAPON_DEFINITIONS.barrett, null).root.getObjectByName('heavy-muzzle-flash')).toBeDefined();
    const cinematic = new WeaponView(WEAPON_DEFINITIONS.barrett, null, null, { cinematicFlash: true });
    expect(cinematic.root.getObjectByName('heavy-muzzle-flash')).toBeUndefined();
    expect(cinematic.root.getObjectByName(FLARE_NAME)).toBeDefined();
  });

  it('leaves energy weapons with their plasma flash', () => {
    const view = new WeaponView(WEAPON_DEFINITIONS.vortex9, null, null, { cinematicFlash: true });
    expect(view.root.getObjectByName(FLARE_NAME)).toBeUndefined();
  });
});
