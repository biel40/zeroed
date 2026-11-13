import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Vortex9DissolveUniforms } from '../src/rendering/Vortex9DissolveShader';
import { VORTEX9_NEON_GREEN } from '../src/rendering/Vortex9DissolveShader';
import { Zombie, type ZombieForgedDeath } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_OVERLOAD_DEATH, ZOMBIE_SPAWN_DURATION } from '../src/zombies/ZombieConfig';
import { ZOMBIE_DEATH_PROFILES } from '../src/zombies/ZombieDeath';
import { ZombieManager } from '../src/zombies/ZombieManager';

const DT = 1 / 60;
const DETAILED: ZombieForgedDeath = { kind: 'overload', detailed: true };
const REDUCED: ZombieForgedDeath = { kind: 'overload', detailed: false };

function standingZombie(): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, 0, 100, 1);
  zombie.update(ZOMBIE_SPAWN_DURATION, 0);
  return zombie;
}

function bodyMaterials(zombie: Zombie): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  zombie.visual.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial
      && object.material.userData.vortex9Dissolve) materials.add(object.material);
  });
  return [...materials];
}

function dissolveOf(material: THREE.Material): Vortex9DissolveUniforms {
  return material.userData.vortex9Dissolve as Vortex9DissolveUniforms;
}

function isPurple(color: THREE.Color): boolean {
  return color.b >= color.r && color.r > color.g * 1.5;
}

function advance(zombie: Zombie, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) zombie.update(DT, 0);
}

const arcsOf = (zombie: Zombie, name: string): THREE.Mesh | undefined =>
  zombie.visual.root.getObjectByName(name) as THREE.Mesh | undefined;

describe('Forged ZEUS-77 overload death', () => {
  it('only a lethal overloaded bolt overloads; other kills keep their deaths', () => {
    const plain = standingZombie();
    expect(plain.applyDamage(1000, false, 0, 5, 'tesla')).toBe(true);
    expect(plain.deathStyle).toBe('shock');
    expect(plain.deathKind).toBe('normal');

    const survivor = standingZombie();
    survivor.hp = 10_000;
    expect(survivor.applyDamage(100, false, 0, 5, 'tesla', DETAILED)).toBe(false);
    expect(survivor.isAlive).toBe(true);

    const overloaded = standingZombie();
    expect(overloaded.applyDamage(1000, true, 0, 5, 'tesla', DETAILED)).toBe(true);
    expect(overloaded.isAlive).toBe(false);
    expect(overloaded.deathStyle).toBe('overload');
    expect(overloaded.deathKind).toBe('overload');
  });

  it('convulses in a fall clip of the overload timing and lays it face down', () => {
    const profile = ZOMBIE_DEATH_PROFILES.overload;
    expect(profile.duration).toBe(ZOMBIE_OVERLOAD_DEATH.clip);
    expect(profile.duration).toBeGreaterThanOrEqual(1.5);
    expect(profile.duration).toBeLessThanOrEqual(2);
    expect(profile.fall).toBe('forward');
    expect(ZOMBIE_DEATH_PROFILES.overload.duration).toBeGreaterThan(ZOMBIE_DEATH_PROFILES.shock.duration);
  });

  it('crackles in purple, then visibly disintegrates in purple and melts down before it is gone', () => {
    const zombie = standingZombie();
    const finished = vi.fn();
    zombie.onDeathFinished = finished;
    zombie.applyDamage(1000, false, 0, 5, 'tesla', DETAILED);
    const materials = bodyMaterials(zombie);
    expect(materials.length).toBeGreaterThan(0);

    advance(zombie, 0.5);
    const arcs = arcsOf(zombie, 'zombie-overload-arcs')!;
    expect(arcs.visible).toBe(true);
    expect(isPurple(arcs.material instanceof THREE.MeshBasicMaterial ? arcs.material.color : new THREE.Color())).toBe(true);
    // The residual blue arcs give way to the overload's.
    expect(arcsOf(zombie, 'zombie-electric-arcs')!.visible).toBe(false);
    expect(dissolveOf(materials[0]).uDissolveProgress.value).toBe(0);
    expect(materials.some((material) => isPurple(material.emissive))).toBe(true);

    advance(zombie, ZOMBIE_OVERLOAD_DEATH.disintegrateStart - 0.5 + 0.4);
    const melting = dissolveOf(materials[0]);
    expect(melting.uDissolveProgress.value).toBeGreaterThan(0);
    expect(melting.uDissolveProgress.value).toBeLessThan(1);
    expect(isPurple(melting.uDissolveEdgeColor.value)).toBe(true);
    const ash = zombie.visual.root.getObjectByName('vortex9-ash-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(ash.visible).toBe(true);
    expect(isPurple(ash.material.uniforms.uEdgeColor.value as THREE.Color)).toBe(true);
    expect(zombie.group.visible).toBe(true);
    expect(zombie.group.position.y).toBeLessThan(0);
    expect(finished).not.toHaveBeenCalled();

    advance(zombie, ZOMBIE_OVERLOAD_DEATH.duration - ZOMBIE_OVERLOAD_DEATH.disintegrateStart);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(zombie.group.visible).toBe(false);
    expect(zombie.group.position.y).toBe(0);
    expect(arcs.visible).toBe(false);
    expect(ash.visible).toBe(false);
  });

  it('comes back from the pool as an ordinary body: no dissolve, green VORTEX-9 colours, no arcs', () => {
    const zombie = standingZombie();
    zombie.applyDamage(1000, false, 0, 5, 'tesla', DETAILED);
    advance(zombie, ZOMBIE_OVERLOAD_DEATH.disintegrateStart + 0.3);
    zombie.spawn(0, 0, 100, 1);
    zombie.update(DT, 0);
    for (const material of bodyMaterials(zombie)) {
      const dissolve = dissolveOf(material);
      expect(dissolve.uDissolveProgress.value).toBe(0);
      expect(dissolve.uDissolveEdgeColor.value.getHex()).toBe(VORTEX9_NEON_GREEN);
    }
    expect(arcsOf(zombie, 'zombie-overload-arcs')!.visible).toBe(false);
    const ash = zombie.visual.root.getObjectByName('vortex9-ash-particles') as THREE.Points;
    expect(ash.geometry.drawRange.count).toBe(Infinity);
    // A VORTEX-9 kill afterwards still vaporizes in green.
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    zombie.applyDamage(1000, false, 0, 5, 'vortex9');
    zombie.update(0.3, 0);
    expect(dissolveOf(bodyMaterials(zombie)[0]).uDissolveEdgeColor.value.getHex()).toBe(VORTEX9_NEON_GREEN);
  });

  it('trims arcs and ash on reduced effects', () => {
    const detailed = standingZombie();
    const reduced = standingZombie();
    detailed.applyDamage(1000, false, 0, 5, 'tesla', DETAILED);
    reduced.applyDamage(1000, false, 0, 5, 'tesla', REDUCED);
    const indexCount = (zombie: Zombie): number => arcsOf(zombie, 'zombie-overload-arcs')!.geometry.index!.count;
    expect(indexCount(reduced)).toBeLessThan(indexCount(detailed));
    const ashCount = (zombie: Zombie): number => (zombie.visual.root.getObjectByName('vortex9-ash-particles') as THREE.Points).geometry.drawRange.count;
    expect(ashCount(reduced)).toBeLessThan(ashCount(detailed));
  });

  it('pulls the body out of play on the killing frame and keeps its attribution to the ZEUS-77', () => {
    const hitColliders: THREE.Object3D[] = [];
    const onKilled = vi.fn();
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(hitColliders);
    manager.onZombieKilled = onKilled;
    for (let i = 0; i < 2; i++) manager.spawnZombie(roundConfig(1), 0, 4);
    const [target, survivor] = [...manager.actives];
    target.position.set(0, 0, 0);
    survivor.position.set(1.5, 0, 0);
    target.hp = 1;
    survivor.hp = 10_000;
    expect(hitColliders).toHaveLength(4);

    expect(manager.applyChainLightning(target, 100, 'torso', DETAILED)).toEqual([target, survivor]);
    expect(target.isAlive).toBe(false);
    expect(target.deathStyle).toBe('overload');
    expect(survivor.isAlive).toBe(true);
    expect(hitColliders).toHaveLength(2);
    expect(hitColliders).not.toContain(target.torsoHitbox);
    expect(onKilled).toHaveBeenCalledWith(target, false, 'tesla', expect.anything());
    // A dead body never swings, however long its death plays.
    expect(target.tryAttack()).toBe(false);
    manager.dispose();
  });
});
