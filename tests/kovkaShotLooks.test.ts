import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MUZZLE_FLARES } from '../src/config/muzzleFlares';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { BallisticsSystem } from '../src/shooting/BallisticsSystem';
import { TRACER_STREAK, TracerStreak } from '../src/shooting/TracerStreak';
import { MuzzleFlare } from '../src/weapons/MuzzleFlare';
import { MuzzleFlash } from '../src/weapons/MuzzleFlash';
import { energyShotLook, firearmShotLook, type EnergyShotLook } from '../src/weapons/WeaponShotLook';
import { ChainLightning } from '../src/zombies/ChainLightning';
import { EnergyProjectiles } from '../src/zombies/EnergyProjectiles';
import { KOVKA_WEAPON_FINISH } from '../src/zombies/maps/Station33Config';

const KOVKA_SHOTS = KOVKA_WEAPON_FINISH.shots;

function channels(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function isRed(hex: number): boolean {
  const { r, g, b } = channels(hex);
  return r >= 0xe0 && r > g * 1.5 && r > b * 1.5;
}

function isPurple(hex: number): boolean {
  const { r, g, b } = channels(hex);
  return b >= r && r > g * 1.5 && b > 0x80;
}

function isRedOrange(hex: number): boolean {
  const { r, g, b } = channels(hex);
  return r >= 0xe0 && r > g && g >= b;
}

function luminance(hex: number): number {
  const { r, g, b } = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const previousDocument = globalThis.document;

beforeAll(() => {
  const context = {
    fillStyle: '',
    fillRect: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
});

describe('KOVKA shot looks', () => {
  it('turns conventional firearms red-orange and leaves energy and flame weapons to their own looks', () => {
    expect(KOVKA_SHOTS).toBeDefined();
    const firearm = firearmShotLook(WEAPON_DEFINITIONS.m4a1, KOVKA_SHOTS);
    expect(firearm).toBe(KOVKA_SHOTS?.firearm);
    expect(isRedOrange(firearm!.tracer)).toBe(true);
    expect(isRedOrange(firearm!.flashTint)).toBe(true);
    expect(isRedOrange(firearm!.light)).toBe(true);
    expect(firearmShotLook(WEAPON_DEFINITIONS.vortex9, KOVKA_SHOTS)).toBeNull();
    expect(firearmShotLook(WEAPON_DEFINITIONS.tesla, KOVKA_SHOTS)).toBeNull();
    const flame = Object.values(WEAPON_DEFINITIONS).find((definition) => definition.flame);
    expect(flame).toBeDefined();
    expect(firearmShotLook(flame!, KOVKA_SHOTS)).toBeNull();
  });

  it('keeps every weapon on its own look while it is not upgraded', () => {
    expect(firearmShotLook(WEAPON_DEFINITIONS.m4a1, null)).toBeNull();
    expect(energyShotLook('vortex9', null)).toBeNull();
    expect(energyShotLook('tesla', undefined)).toBeNull();
    expect(energyShotLook('m4a1', KOVKA_SHOTS)).toBeNull();
  });

  it('fires the upgraded VORTEX-9 in red with a bright core, the basic one stays green', () => {
    const vortex = energyShotLook('vortex9', KOVKA_SHOTS);
    expect(vortex).not.toBeNull();
    expect(isRed(vortex!.color)).toBe(true);
    expect(isRed(vortex!.core)).toBe(true);
    expect(luminance(vortex!.core)).toBeGreaterThan(luminance(vortex!.color));
    expect(vortex!.shroud).toBeNull();
    const basic = channels(WEAPON_DEFINITIONS.vortex9.energy!.color);
    expect(basic.g).toBeGreaterThan(basic.r);
  });

  it('fires the upgraded ZEUS-77 in purple wrapped in dark energy, its arcs too', () => {
    const zeus = energyShotLook('tesla', KOVKA_SHOTS);
    expect(zeus).not.toBeNull();
    expect(isPurple(zeus!.color)).toBe(true);
    expect(isPurple(zeus!.core)).toBe(true);
    expect(zeus!.shroud).not.toBeNull();
    expect(luminance(zeus!.shroud!)).toBeLessThan(0.05);
    const arc = zeus!.arc!;
    expect(isPurple(arc.core)).toBe(true);
    expect(isPurple(arc.branch)).toBe(true);
    expect(luminance(arc.shroud)).toBeLessThan(0.05);
  });
});

describe('Tracer streak', () => {
  const muzzle = new THREE.Vector3(0.2, -0.15, 0);

  it('leaves the muzzle and slides onto the round’s true path', () => {
    const streak = new TracerStreak();
    streak.begin(muzzle, new THREE.Vector3());
    expect(streak.visible).toBe(true);
    expect(streak.head.distanceTo(muzzle)).toBeLessThan(1e-9);

    streak.follow(0, 0, -1, 1);
    expect(streak.tail.distanceTo(muzzle)).toBeLessThan(1e-6);
    expect(streak.head.x).toBeCloseTo(0.2 * (1 - 1 / TRACER_STREAK.converge));

    streak.follow(0, 0, -TRACER_STREAK.converge - 5, TRACER_STREAK.converge + 5);
    expect(streak.head.distanceTo(new THREE.Vector3(0, 0, -TRACER_STREAK.converge - 5))).toBeLessThan(1e-9);
    expect(streak.length).toBeCloseTo(TRACER_STREAK.length);
  });

  it('ends exactly at the impact and pulls into it within its brief fade', () => {
    const streak = new TracerStreak();
    streak.begin(muzzle, new THREE.Vector3());
    streak.follow(0, 0, -20, 20);
    streak.land(0, 0, -24);
    const impact = new THREE.Vector3(0, 0, -24);
    expect(streak.head.distanceTo(impact)).toBeLessThan(1e-9);
    expect(streak.length).toBeCloseTo(TRACER_STREAK.length);

    expect(streak.update(TRACER_STREAK.fade / 2)).toBe(true);
    expect(streak.length).toBeCloseTo(TRACER_STREAK.length / 2);
    expect(streak.head.distanceTo(impact)).toBeLessThan(1e-9);
    expect(streak.update(TRACER_STREAK.fade)).toBe(false);
    expect(streak.visible).toBe(false);
  });

  it('fades where it is when the round runs out of range', () => {
    const streak = new TracerStreak();
    streak.begin(muzzle, new THREE.Vector3());
    streak.follow(0, 0, -30, 30);
    streak.fadeOut();
    streak.follow(0, 0, -60, 60);
    expect(streak.head.z).toBeCloseTo(-30);
    expect(streak.update(TRACER_STREAK.fade + 0.01)).toBe(false);
  });
});

describe('Ballistic tracers of an upgraded firearm', () => {
  function shoot(withTracer: boolean): { points: THREE.Vector3[]; parent: THREE.Group; ballistics: BallisticsSystem } {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.2));
    wall.position.z = -30;
    wall.updateMatrixWorld(true);
    const parent = new THREE.Group();
    const ballistics = new BallisticsSystem([wall], parent);
    const points: THREE.Vector3[] = [];
    ballistics.onEnvironmentHit = (point) => points.push(point.clone());
    const tracer = withTracer ? { muzzle: new THREE.Vector3(0.2, -0.15, 0), color: KOVKA_SHOTS!.firearm.tracer } : null;
    ballistics.spawn(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), WEAPON_DEFINITIONS.m4a1.projectile, null, tracer);
    return { points, parent, ballistics };
  }

  const streaks = (parent: THREE.Group): THREE.Mesh[] =>
    parent.children.filter((child): child is THREE.Mesh => child.name === 'tracer-streak' && child.visible);

  it('draws a short red streak that lands on the impact point and quickly disappears, without moving the hit', () => {
    const plain = shoot(false);
    const upgraded = shoot(true);
    for (let frame = 0; frame < 3; frame++) {
      plain.ballistics.update(1 / 60);
      upgraded.ballistics.update(1 / 60);
    }
    expect(upgraded.points).toHaveLength(1);
    expect(upgraded.points[0].distanceTo(plain.points[0])).toBeLessThan(1e-9);
    expect(streaks(plain.parent)).toHaveLength(0);

    const [streak] = streaks(upgraded.parent);
    expect(streak).toBeDefined();
    expect((streak.material as THREE.MeshBasicMaterial).color.getHex()).toBe(KOVKA_SHOTS!.firearm.tracer);
    expect(streak.scale.z).toBeLessThanOrEqual(TRACER_STREAK.length + 1e-6);
    const front = streak.position.z - streak.scale.z / 2;
    expect(front).toBeCloseTo(upgraded.points[0].z, 1);

    for (let frame = 0; frame < 10; frame++) upgraded.ballistics.update(1 / 60);
    expect(streaks(upgraded.parent)).toHaveLength(0);
  });
});

describe('Energy bolts of an upgraded energy weapon', () => {
  type BoltInternals = {
    coreMaterial: THREE.MeshBasicMaterial;
    glowMaterial: THREE.SpriteMaterial;
    trailMaterial: THREE.MeshBasicMaterial;
    ringMaterials: THREE.MeshBasicMaterial[];
    shroud: THREE.Sprite;
    shroudMaterial: THREE.SpriteMaterial;
  };
  const firstBolt = (energy: EnergyProjectiles): BoltInternals =>
    (energy as unknown as { bolts: BoltInternals[] }).bolts[0];

  function fire(id: 'vortex9' | 'tesla', look: EnergyShotLook | null): BoltInternals {
    const energy = new EnergyProjectiles([], new THREE.Group());
    energy.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), WEAPON_DEFINITIONS[id].energy!, 0, look);
    return firstBolt(energy);
  }

  it('keeps the basic VORTEX-9 green and paints the upgraded one red, same config for gameplay', () => {
    const green = WEAPON_DEFINITIONS.vortex9.energy!.color;
    const basic = fire('vortex9', null);
    expect(basic.coreMaterial.color.getHex()).toBe(green);
    expect(basic.trailMaterial.color.getHex()).toBe(green);
    expect(basic.shroud.visible).toBe(false);

    const look = energyShotLook('vortex9', KOVKA_SHOTS)!;
    const red = fire('vortex9', look);
    expect(red.coreMaterial.color.getHex()).toBe(look.core);
    expect(red.glowMaterial.color.getHex()).toBe(look.color);
    expect(red.trailMaterial.color.getHex()).toBe(look.color);
    expect(red.ringMaterials[1].color.getHex()).toBe(look.accent);
    expect(red.shroud.visible).toBe(false);
  });

  it('wraps the upgraded ZEUS-77 bolt in dark energy drawn over the scene', () => {
    const look = energyShotLook('tesla', KOVKA_SHOTS)!;
    const bolt = fire('tesla', look);
    expect(bolt.coreMaterial.color.getHex()).toBe(look.core);
    expect(bolt.shroud.visible).toBe(true);
    expect(bolt.shroudMaterial.color.getHex()).toBe(look.shroud);
    expect(bolt.shroudMaterial.blending).toBe(THREE.NormalBlending);
    expect(fire('tesla', null).shroud.visible).toBe(false);
  });
});

describe('Chain arcs of an upgraded ZEUS-77', () => {
  type ArcInternals = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; shroud: THREE.Mesh; shroudMaterial: THREE.MeshBasicMaterial };
  const arcsOf = (chain: ChainLightning): ArcInternals[] => (chain as unknown as { arcs: ArcInternals[] }).arcs;
  const forksOf = (parent: THREE.Group): number => {
    let count = 0;
    parent.traverse((object) => { if ((object as THREE.Line).isLine && object.visible) count++; });
    return count;
  };
  const points = [new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 1.1, -6), new THREE.Vector3(2, 1.1, -8)];
  const seeded = (): (() => number) => { let seed = 7; return () => (seed = (seed * 16807) % 2147483647) / 2147483647; };

  it('keeps the original electric blue arcs without dark energy or forks', () => {
    const parent = new THREE.Group();
    const chain = new ChainLightning(parent, seeded());
    chain.discharge(points);
    const [first] = arcsOf(chain);
    expect(first.mesh.visible).toBe(true);
    expect(first.material.color.getHex()).toBe(0x9fe0ff);
    expect(first.shroud.visible).toBe(false);
    expect(forksOf(parent)).toBe(0);
  });

  it('draws purple arcs inside a dark envelope with purple forks, forks dropped on reduced effects', () => {
    const arc = energyShotLook('tesla', KOVKA_SHOTS)!.arc!;
    const parent = new THREE.Group();
    const chain = new ChainLightning(parent, seeded());
    chain.discharge(points, arc, true);
    const active = arcsOf(chain).filter((entry) => entry.mesh.visible);
    expect(active).toHaveLength(2);
    for (const entry of active) {
      expect(entry.material.color.getHex()).toBe(arc.core);
      expect(entry.shroud.visible).toBe(true);
      expect(entry.shroud.geometry).toBe(entry.mesh.geometry);
      expect(entry.shroudMaterial.color.getHex()).toBe(arc.shroud);
      expect(entry.shroudMaterial.blending).toBe(THREE.NormalBlending);
    }
    expect(forksOf(parent)).toBeGreaterThan(0);
    for (let frame = 0; frame < 30; frame++) chain.update(1 / 60);
    expect(arcsOf(chain).every((entry) => !entry.mesh.visible && !entry.shroud.visible)).toBe(true);
    expect(forksOf(parent)).toBe(0);

    const reducedParent = new THREE.Group();
    const reduced = new ChainLightning(reducedParent, seeded());
    reduced.discharge(points, arc, false);
    expect(arcsOf(reduced)[0].shroud.visible).toBe(true);
    expect(forksOf(reducedParent)).toBe(0);
  });
});

describe('Muzzle flash tint', () => {
  it('retints the top tier flare and restores it with white', () => {
    const flare = new MuzzleFlare(MUZZLE_FLARES.rifle);
    const uniforms = (flare as unknown as { material: THREE.ShaderMaterial }).material.uniforms;
    expect((uniforms.uTint.value as THREE.Color).getHex()).toBe(0xffffff);
    flare.setTint(KOVKA_SHOTS!.firearm.flashTint);
    expect((uniforms.uTint.value as THREE.Color).getHex()).toBe(KOVKA_SHOTS!.firearm.flashTint);
    flare.setTint(0xffffff);
    expect((uniforms.uTint.value as THREE.Color).getHex()).toBe(0xffffff);
  });

  it('retints the heavy flash sheets', () => {
    const flash = new MuzzleFlash({ length: 0.4, width: 0.2, coreScale: 1, duration: 0.05, lightIntensity: 9 });
    const material = (flash as unknown as { material: THREE.MeshBasicMaterial }).material;
    flash.setTint(KOVKA_SHOTS!.firearm.flashTint);
    expect(material.color.getHex()).toBe(KOVKA_SHOTS!.firearm.flashTint);
    flash.setTint(0xffffff);
    expect(material.color.getHex()).toBe(0xffffff);
  });
});
