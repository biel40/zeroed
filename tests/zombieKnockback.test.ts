import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundConfig, ZOMBIE_TYPE_CONFIGS } from '../src/zombies/ZombieConfig';
import { ZombieKnockback } from '../src/zombies/ZombieKnockback';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { Zombie } from '../src/zombies/Zombie';
import { ZOMBIE_MODELS, ZombieVisual } from '../src/zombies/ZombieVisual';
import { installCanvasDocument } from './coopHarness';

const DT = 1 / 60;
const out = { x: 0, z: 0 };

function travel(knockback: ZombieKnockback, seconds: number): { x: number; z: number; steps: number[] } {
  const total = { x: 0, z: 0, steps: [] as number[] };
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    if (!knockback.step(DT, out)) continue;
    total.x += out.x;
    total.z += out.z;
    total.steps.push(Math.hypot(out.x, out.z));
  }
  return total;
}

describe('ZombieKnockback', () => {
  it('covers the whole shove in its time, fastest first, then rests', () => {
    const knockback = new ZombieKnockback();
    knockback.push(0, -1, 3, 0.4);
    expect(knockback.active).toBe(true);
    const { x, z, steps } = travel(knockback, 0.5);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-3, 3);
    for (let index = 1; index < steps.length; index++) expect(steps[index]).toBeLessThanOrEqual(steps[index - 1] + 1e-9);
    expect(knockback.active).toBe(false);
    expect(knockback.step(DT, out)).toBe(false);
  });

  it('never stacks: a weaker shove mid-flight is ignored, a stronger one replaces what is left', () => {
    const knockback = new ZombieKnockback();
    knockback.push(1, 0, 3, 0.4);
    travel(knockback, 0.1);
    knockback.push(1, 0, 0.5, 0.4);
    const rest = travel(knockback, 1);
    // What was left of the first shove, no more.
    expect(rest.x).toBeLessThan(3);
    expect(rest.x).toBeGreaterThan(0.5);

    knockback.push(1, 0, 3, 0.4);
    travel(knockback, 0.3);
    knockback.push(0, 1, 3, 0.4);
    const turned = travel(knockback, 1);
    expect(turned.z).toBeCloseTo(3, 3);
  });

  it('normalises the direction and ignores empty shoves', () => {
    const knockback = new ZombieKnockback();
    knockback.push(0, 0, 3, 0.4);
    knockback.push(3, 4, 0, 0.4);
    expect(knockback.active).toBe(false);
    knockback.push(3, 4, 2, 0.4);
    const { x, z } = travel(knockback, 1);
    expect(Math.hypot(x, z)).toBeCloseTo(2, 3);
    expect(x / z).toBeCloseTo(0.75, 6);
    knockback.push(1, 0, 2, 0.4);
    knockback.reset();
    expect(knockback.active).toBe(false);
  });
});

describe('Zombie knockback', () => {
  function standing(typeId: 'normal' | 'brute' = 'normal'): Zombie {
    const zombie = new Zombie(typeId === 'brute' ? new ZombieVisual('brute', null, ZOMBIE_MODELS.brute.tints[0]) : undefined);
    zombie.spawn(0, 0, 500, 2, 0, 0, typeId);
    zombie.skipSpawnRise();
    return zombie;
  }

  it('scales the shove by its type: a brute barely moves', () => {
    expect(ZOMBIE_TYPE_CONFIGS.brute.knockbackScale).toBeLessThan(0.5);
    expect(ZOMBIE_TYPE_CONFIGS.normal.knockbackScale).toBe(1);
    const walker = standing();
    const brute = standing('brute');
    expect(walker.knockBack(0, -1, 3, 0.4)).toBe(true);
    expect(brute.knockBack(0, -1, 3, 0.4)).toBe(true);
    let walkerTravel = 0;
    let bruteTravel = 0;
    for (let t = 0; t < 1; t += DT) {
      if (walker.stepKnockback(DT, out)) walkerTravel += Math.hypot(out.x, out.z);
      if (brute.stepKnockback(DT, out)) bruteTravel += Math.hypot(out.x, out.z);
    }
    expect(walkerTravel).toBeCloseTo(3, 3);
    expect(bruteTravel).toBeCloseTo(3 * ZOMBIE_TYPE_CONFIGS.brute.knockbackScale, 3);
  });

  it('does not walk against the gust while it is shoved', () => {
    const zombie = standing();
    zombie.knockBack(1, 0, 3, 0.4);
    expect(zombie.paceScale).toBe(0);
    for (let t = 0; t < 0.5; t += DT) zombie.stepKnockback(DT, out);
    expect(zombie.paceScale).toBeGreaterThan(0);
  });

  it('ignores the shove while rising out of the ground or dead, and forgets it on respawn', () => {
    const rising = new Zombie();
    rising.spawn(0, 0, 100, 2);
    expect(rising.knockBack(1, 0, 3, 0.4)).toBe(false);
    const dead = standing();
    dead.applyDamage(1000);
    expect(dead.knockBack(1, 0, 3, 0.4)).toBe(false);
    const recycled = standing();
    recycled.knockBack(1, 0, 3, 0.4);
    recycled.spawn(0, 0, 100, 2);
    recycled.skipSpawnRise();
    expect(recycled.stepKnockback(DT, out)).toBe(false);
  });
});

describe('ZombieManager knockback', () => {
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  /** A walker two metres north of the player, who stands at the origin looking north. */
  function arena(walls: THREE.Object3D[] = []): { manager: ZombieManager; zombie: Zombie } {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(walls);
    expect(manager.spawnAmbushZombie(roundConfig(1), 0, -2, 1, 0, 0)).toBe(true);
    return { manager, zombie: [...manager.actives][0] };
  }

  function run(manager: ZombieManager, seconds: number): void {
    for (let t = 0; t < seconds - 1e-9; t += DT) manager.update(DT, 0, 0, 0);
  }

  it('drives a walker back several metres without turning its back on the player', () => {
    const { manager, zombie } = arena();
    const facing = zombie.group.rotation.y;
    expect(manager.knockBack(zombie, 0, -1, 3, 0.4)).toBe(true);
    run(manager, 0.45);
    expect(zombie.position.z).toBeLessThan(-4.6);
    expect(Math.cos(zombie.group.rotation.y - facing)).toBeGreaterThan(0.9);
    expect(zombie.isAlive).toBe(true);
    // Then it comes back for the player.
    const pushedTo = zombie.position.z;
    run(manager, 1);
    expect(zombie.position.z).toBeGreaterThan(pushedTo);
  });

  it('stops against a wall instead of passing through it', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.4));
    wall.position.set(0, 1.5, -3.6);
    wall.userData.surface = 'concrete';
    wall.updateMatrixWorld(true);
    const { manager, zombie } = arena([wall]);
    manager.knockBack(zombie, 0, -1, 3, 0.4);
    run(manager, 0.45);
    expect(zombie.position.z).toBeGreaterThan(-3.4 + zombie.bodyRadius - 0.05);
  });

  it('refuses the bodies a reset sent back to the pool', () => {
    const { manager, zombie } = arena();
    manager.knockBack(zombie, 0, -1, 3, 0.4);
    manager.reset();
    expect(manager.knockBack(zombie, 0, -1, 3, 0.4)).toBe(false);
  });
});
