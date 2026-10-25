import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Zombie } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_ELECTRIFIED_DURATION, ZOMBIE_SPAWN_DURATION } from '../src/zombies/ZombieConfig';
import {
  createZombieDeathPose,
  resolveZombieDeathStyle,
  sampleZombieDeath,
  ZOMBIE_DEATH_PROFILES,
  ZOMBIE_DEATH_STYLES,
  type ZombieDeathStyle,
  type ZombieKillSource,
} from '../src/zombies/ZombieDeath';
import { ZombieManager } from '../src/zombies/ZombieManager';

function standingZombie(): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, 0, 100, 1);
  zombie.update(ZOMBIE_SPAWN_DURATION, 0);
  return zombie;
}

describe('zombie death style resolution', () => {
  it.each<[ZombieKillSource | undefined, boolean, ZombieDeathStyle]>([
    ['knife', false, 'slash'],
    ['m1911', false, 'knockback'],
    ['l96', false, 'knockback'],
    ['m4a1', false, 'riddled'],
    ['ppsh41', false, 'riddled'],
    ['ak47', false, 'riddled'],
    ['m60', false, 'riddled'],
    ['raygun', false, 'blast'],
    ['tesla', false, 'shock'],
    [undefined, false, 'knockback'],
    ['m1911', true, 'headshot'],
    ['m60', true, 'headshot'],
    ['ppsh41', true, 'headshot'],
    ['raygun', true, 'headshot'],
    // Electrocution and the blade read better than a generic head snap.
    ['tesla', true, 'shock'],
    ['knife', true, 'slash'],
  ])('%s (headshot: %s) dies with %s', (source, headshot, style) => {
    expect(resolveZombieDeathStyle(source, headshot, -1)).toBe(style);
  });

  it('topples single shots and blasts forward when the hit lands in the back', () => {
    expect(resolveZombieDeathStyle('m1911', false, 0.9)).toBe('stumble');
    expect(resolveZombieDeathStyle('raygun', false, 0.9)).toBe('stumble');
    expect(resolveZombieDeathStyle('m60', false, 0.9)).toBe('riddled');
    expect(resolveZombieDeathStyle('m1911', false, 0.2)).toBe('knockback');
  });

  it('authors every profile from the living hang and inside its own duration', () => {
    const pose = createZombieDeathPose();
    for (const style of ZOMBIE_DEATH_STYLES) {
      const profile = ZOMBIE_DEATH_PROFILES[style];
      sampleZombieDeath(profile, 0, pose);
      // The first frame is the upright rest the crossfade starts from.
      expect(Math.abs(pose.drop) + Math.abs(pose.pitch) + Math.abs(pose.roll), style).toBeLessThan(1e-6);
      expect(pose.plant, style).toBe(1);
      sampleZombieDeath(profile, 1, pose);
      expect(pose.drop, style).toBeGreaterThan(0.75);
      expect(pose.plant, style).toBe(0);
      expect(profile.duration, style).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('lethal blow attribution', () => {
  it('passes the killing weapon, chain and splash through to the death performance', () => {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    for (let i = 0; i < 3; i++) manager.spawnZombie(roundConfig(1), 0, 4);
    const [rifle, tesla, splash] = [...manager.actives];
    // Far apart: neither the splash nor the arc may reach another body.
    [rifle, tesla, splash].forEach((zombie, i) => zombie.position.set(i * 40, 0, 0));
    manager.damageZombie(rifle, 'torso', 10_000, 'm60');
    manager.applySplash(splash.position.clone(), 2, 10_000);
    // Last: the arc may only chain to bodies that are still standing.
    manager.applyChainLightning(tesla, 10_000);
    expect([rifle.deathStyle, tesla.deathStyle, splash.deathStyle]).toEqual(['riddled', 'shock', 'blast']);
  });

  it('uses the shooter position, not the local player, to read a shot in the back', () => {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [zombie] = [...manager.actives];
    zombie.group.rotation.y = 0; // facing +z
    manager.damageZombie(zombie, 'torso', 10_000, 'm1911', zombie.position.x, zombie.position.z - 5);
    expect(zombie.deathStyle).toBe('stumble');
  });

  it('turns an impact-following fall towards a side hit, bounded', () => {
    const fromSide = standingZombie();
    const fromFront = standingZombie();
    fromSide.applyDamage(1000, false, 5, 0, 'm1911');
    fromFront.applyDamage(1000, false, 0, 5, 'm1911');
    expect(fromSide.deathStyle).toBe('knockback');
    for (let i = 0; i < 40; i++) {
      fromSide.update(1 / 60, 0);
      fromFront.update(1 / 60, 0);
    }
    expect(fromFront.visual.root.rotation.y).toBeCloseTo(0, 6);
    expect(Math.abs(fromSide.visual.root.rotation.y)).toBeGreaterThan(0.5);
    expect(Math.abs(fromSide.visual.root.rotation.y)).toBeLessThanOrEqual(0.8 + 1e-6);
  });

  it('leaves ZEUS-77 arcs crawling over survivors and corpses for a while', () => {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    for (let i = 0; i < 2; i++) manager.spawnZombie(roundConfig(1), 0, 4);
    const [corpse, survivor] = [...manager.actives];
    corpse.position.set(0, 0, 0);
    survivor.position.set(1.5, 0, 0);
    corpse.hp = 1;
    survivor.hp = 10_000;
    expect(manager.applyChainLightning(corpse, 100)).toEqual([corpse, survivor]);
    const arcs = (zombie: Zombie) => zombie.visual.root.getObjectByName('zombie-electric-arcs') as THREE.Mesh;
    corpse.update(1 / 60, 0);
    survivor.update(1 / 60, 0);
    expect(corpse.deathStyle).toBe('shock');
    expect(arcs(corpse).visible).toBe(true);
    expect(arcs(survivor).visible).toBe(true);
    const positions = arcs(corpse).geometry.getAttribute('position').array as Float32Array;
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(positions.some((value) => value !== 0)).toBe(true);
    // Still crackling on the floor well after the fall…
    for (let t = 0; t < ZOMBIE_ELECTRIFIED_DURATION - 0.3; t += 1 / 60) corpse.update(1 / 60, 0);
    expect(corpse.group.visible).toBe(true);
    expect(arcs(corpse).visible).toBe(true);
    // …and gone, with the undead glow back, once the charge runs out.
    for (let t = 0; t < 0.4; t += 1 / 60) survivor.update(1 / 60, 0);
    for (let t = 0; t < ZOMBIE_ELECTRIFIED_DURATION; t += 1 / 60) survivor.update(1 / 60, 0);
    expect(arcs(survivor).visible).toBe(false);
    survivor.visual.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      expect(object.material.emissive.getHex()).not.toBe(0x5fc8ff);
    });
  });

  it('clears residual arcs when a pooled body respawns', () => {
    const zombie = standingZombie();
    zombie.electrify();
    zombie.update(1 / 60, 0);
    zombie.spawn(0, 0, 100, 1);
    zombie.update(1 / 60, 0);
    expect(zombie.visual.root.getObjectByName('zombie-electric-arcs')!.visible).toBe(false);
  });

  it('replays the host death style and impact side on a replica', () => {
    const zombie = standingZombie();
    zombie.playReplicatedDeath('slash', 0.6, -0.8);
    expect(zombie.state).toBe('death');
    expect(zombie.deathStyle).toBe('slash');
    expect(zombie.impact.toArray()).toEqual([0.6, -0.8]);
    expect(zombie.visual.root.rotation.order).toBe('YXZ');
    expect(new THREE.Vector2(...zombie.impact.toArray()).length()).toBeCloseTo(1, 6);
  });
});
