import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import {
  getDissolveNoiseTexture,
  VORTEX9_ASH_FRAGMENT_SHADER,
  VORTEX9_ASH_VERTEX_SHADER,
  VORTEX9_DISSOLVE_DURATION,
  VORTEX9_DISSOLVE_FRAGMENT_MAIN,
  VORTEX9_DISSOLVE_FRAGMENT_PARS,
  VORTEX9_DISSOLVE_VERTEX_MAIN,
  VORTEX9_DISSOLVE_VERTEX_PARS,
  VORTEX9_NEON_GREEN,
} from '../src/rendering/Vortex9DissolveShader';
import type { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import { EnergyProjectiles } from '../src/zombies/EnergyProjectiles';
import { Zombie } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_VORTEX9_DEATH_DURATION } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';

const vortex9Def = WEAPON_DEFINITIONS.vortex9;
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

function fakeWeapon(state: Weapon['state'] = 'ready', stateProgress = 0): Weapon {
  return { state, stateProgress, adsAlpha: 0, reloadType: 'empty' } as Weapon;
}

describe('VORTEX-9 Muzzle & Projectile VFX', () => {
  it('displays a 65ms green plasma muzzle flash with a plasma ring on shot', () => {
    const view = new WeaponView(vortex9Def, null);
    const flash = view.root.getObjectByName('muzzle-plasma-ring')?.parent as THREE.Sprite | undefined;
    expect(flash).toBeDefined();
    expect(flash!.visible).toBe(false);

    view.onShot();
    expect(flash!.visible).toBe(true);

    // Still visible at 50 ms
    view.update(0.05, fakeWeapon(), 0, 0, 0);
    expect(flash!.visible).toBe(true);

    // Cleared past 65 ms (~50-80 ms window)
    view.update(0.02, fakeWeapon(), 0, 0, 0);
    expect(flash!.visible).toBe(false);
  });

  it('spawns a green core bolt surrounded by 3 red/green energy rings, trail particles, and impact scorch decal', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.set(0, 0, -5);
    wall.updateMatrixWorld(true);
    scene.add(wall);

    const impacts: THREE.Vector3[] = [];
    const projectiles = new EnergyProjectiles([wall], scene);
    projectiles.onImpact = (point: THREE.Vector3) => impacts.push(point.clone());

    projectiles.fire(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      vortex9Def.energy!,
    );

    // Advance partway along the segmented raycast: bolt + 3 concentric rings are visible
    projectiles.update(0.04);
    expect(impacts.length).toBe(0);

    let visibleCores = 0;
    let visibleRings = 0;
    const ringColors: number[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible) {
        if (obj.geometry instanceof THREE.SphereGeometry) {
          visibleCores++;
        } else if (obj.geometry instanceof THREE.TorusGeometry && obj.name.startsWith('energy-bolt-ring-')) {
          visibleRings++;
          ringColors.push((obj.material as THREE.MeshBasicMaterial).color.getHex());
        }
      }
    });
    expect(visibleCores).toBe(1);
    expect(visibleRings).toBe(3);
    // Alternating neon green and plasma red rings
    expect(ringColors).toContain(VORTEX9_NEON_GREEN);
    expect(ringColors).toContain(0xff3b1f);

    // Advance until impact at z = -5
    projectiles.update(0.2);
    expect(impacts.length).toBe(1);
    expect(impacts[0].z).toBeCloseTo(-5, 1);

    // Verify temporary scorch decal and instanced plasma burst are active, then fade out cleanly
    let activeScorchDecals = 0;
    scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        (obj.material as THREE.MeshBasicMaterial).polygonOffset &&
        obj.visible
      ) {
        activeScorchDecals++;
      }
    });
    expect(activeScorchDecals).toBeGreaterThanOrEqual(1);

    // Fast-forward past scorch lifetime (3.5s) and verify cleanup
    projectiles.update(4.0);
    let remainingScorchDecals = 0;
    scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        (obj.material as THREE.MeshBasicMaterial).polygonOffset &&
        obj.visible
      ) {
        remainingScorchDecals++;
      }
    });
    expect(remainingScorchDecals).toBe(0);

    projectiles.dispose();
  });
});

describe('VORTEX-9 Vaporization / Dissolution Death & Cleanup', () => {
  it('dissolves a zombie killed by the VORTEX-9 over 1.0s with GLSL noise shader and ascending ash particles', () => {
    const zombie = new Zombie();
    let deathFinished = false;
    zombie.onDeathFinished = () => {
      deathFinished = true;
    };
    zombie.spawn(0, 0, 100, 1.8);

    const killed = zombie.applyDamage(200, false, 0, 1, 'vortex9');
    expect(killed).toBe(true);
    expect(zombie.isAlive).toBe(false);
    expect(zombie.deathKind).toBe('vortex9');
    expect(ZOMBIE_VORTEX9_DEATH_DURATION).toBe(VORTEX9_DISSOLVE_DURATION);
    expect(ZOMBIE_VORTEX9_DEATH_DURATION).toBeGreaterThanOrEqual(0.8);
    expect(ZOMBIE_VORTEX9_DEATH_DURATION).toBeLessThanOrEqual(1.2);

    // Halfway through dissolution (0.5s of 1.0s)
    zombie.update(0.5);
    expect(deathFinished).toBe(false);
    expect(zombie.visual.currentDissolveProgress).toBeCloseTo(0.5, 2);

    const points = zombie.visual.root.getObjectByName('vortex9-ash-particles') as THREE.Points | undefined;
    expect(points).toBeDefined();
    expect(points!.visible).toBe(true);

    const ashMat = points!.material as THREE.ShaderMaterial;
    expect(ashMat.vertexShader).toBe(VORTEX9_ASH_VERTEX_SHADER);
    expect(ashMat.fragmentShader).toBe(VORTEX9_ASH_FRAGMENT_SHADER);
    expect(ashMat.uniforms.uProgress.value).toBeCloseTo(0.5, 2);

    // Check that custom GLSL dissolve snippets are wired into zombie materials via onBeforeCompile
    let meshMat: THREE.MeshStandardMaterial | null = null;
    zombie.visual.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        meshMat = obj.material;
      }
    });
    expect(meshMat).not.toBeNull();
    const fakeShader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\nvoid main() {\n#include <skinning_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}',
    };
    meshMat!.onBeforeCompile(fakeShader as any, {} as any);
    expect(fakeShader.vertexShader).toContain(VORTEX9_DISSOLVE_VERTEX_PARS);
    expect(fakeShader.vertexShader).toContain(VORTEX9_DISSOLVE_VERTEX_MAIN);
    expect(fakeShader.fragmentShader).toContain(VORTEX9_DISSOLVE_FRAGMENT_PARS);
    expect(fakeShader.fragmentShader).toContain(VORTEX9_DISSOLVE_FRAGMENT_MAIN);
    expect(fakeShader.uniforms.uDissolveNoiseMap.value).toBe(getDissolveNoiseTexture());
    expect(fakeShader.uniforms.uDissolveProgress.value).toBeCloseTo(0.5, 2);

    // Complete dissolution at 1.0s: zombie signals pool release
    zombie.update(0.55);
    expect(deathFinished).toBe(true);
    expect(zombie.group.visible).toBe(false);
    zombie.dispose();
  });

  it('immediately removes zombie hit colliders and A* navigation state upon VORTEX-9 kill', () => {
    const hitColliders: THREE.Object3D[] = [];
    const onKilled = vi.fn();

    const manager = new ZombieManager(() => 0);
    manager.registerColliders(hitColliders);
    manager.onZombieKilled = onKilled;

    expect(manager.spawnZombie(roundConfig(1), 0, -5, 1)).toBe(true);
    const zombie = [...manager.actives][0];
    zombie.position.set(2, 0, -4);
    expect(hitColliders.length).toBe(2);

    // VORTEX-9 splash kill
    manager.applySplash(new THREE.Vector3(2, 0, -4), 3.5, 500);

    expect(zombie.isAlive).toBe(false);
    expect(zombie.deathKind).toBe('vortex9');
    // Colliders removed on the exact kill frame
    expect(hitColliders.length).toBe(0);
    expect(onKilled).toHaveBeenCalledWith(zombie, false, 'vortex9', { x: 2, y: 0, z: -4 });

    manager.dispose();
  });
});
