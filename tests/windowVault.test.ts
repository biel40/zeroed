import { describe, expect, it } from 'vitest';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import {
  findVaultStart,
  WINDOW_VAULT,
  windowVaultPose,
  type VaultOpening,
  type WindowVaultPose,
} from '../src/zombies/barriers/WindowVault';
import { Zombie } from '../src/zombies/Zombie';
import { ZOMBIE_SPAWN_DURATION } from '../src/zombies/ZombieConfig';
import { BARRIER_CONFIG, MANSION_WINDOW_OPENING } from '../src/zombies/maps/BurnedMansionConfig';

/** West window of the mansion's start room: outside is -x. */
function openWindow(): WindowBarrier {
  const barrier = new WindowBarrier('start-west-b', -7.15, 3.2, -1, 0, BARRIER_CONFIG);
  while (!barrier.isOpen) barrier.damage(1000);
  return barrier;
}

function walkingZombie(x: number, z: number): Zombie {
  const zombie = new Zombie();
  zombie.spawn(x, z, 100, 1);
  zombie.update(ZOMBIE_SPAWN_DURATION + 0.1);
  return zombie;
}

/** Steps the body along x in 1 cm strides at 60 fps, returning the visual root height each frame. */
function walk(zombie: Zombie, openings: ReadonlyArray<VaultOpening>, toX: number, z = zombie.position.z): number[] {
  const heights: number[] = [];
  const step = Math.sign(toX - zombie.position.x) * 0.01;
  while (Math.abs(toX - zombie.position.x) > 0.005) {
    zombie.position.x += step;
    zombie.position.z = z;
    zombie.trackWindowVault(openings);
    zombie.update(1 / 60, 0.6);
    heights.push(zombie.visual.root.position.y);
  }
  return heights;
}

describe('window vault', () => {
  it('climbs only through open windows with a sill, starting from outside', () => {
    const window = openWindow();
    expect(window.sill).toBe(MANSION_WINDOW_OPENING.sill);
    expect(findVaultStart([window], -7.15 - 0.6, 3.2, 0)).toBe(window);
    // Inside the room, beside the opening, on another floor or boarded up: no climb.
    expect(findVaultStart([window], -7.15 + 0.5, 3.2, 0)).toBeNull();
    expect(findVaultStart([window], -7.15 - 0.6, 3.2 + WINDOW_VAULT.halfWidth + 0.1, 0)).toBeNull();
    expect(findVaultStart([window], -7.15 - 0.6, 3.2, -1)).toBeNull();
    const boarded = new WindowBarrier('boarded', -7.15, 3.2, -1, 0, BARRIER_CONFIG);
    expect(findVaultStart([boarded], -7.15 - 0.6, 3.2, 0)).toBeNull();
    // Doorway-like gates have no sill to climb.
    const gate = new WindowBarrier('gate', -7.15, 3.2, -1, 0, { ...BARRIER_CONFIG, sill: 0 });
    while (!gate.isOpen) gate.damage(1000);
    expect(findVaultStart([gate], -7.15 - 0.6, 3.2, 0)).toBeNull();
  });

  it('reaches for the sill, hauls the hips over it and absorbs the landing', () => {
    const sill = MANSION_WINDOW_OPENING.sill;
    const pose: WindowVaultPose = { lift: 0, rootPitch: 0, torsoPitch: 0, roll: 0, reach: 0 };
    windowVaultPose(0, sill, pose);
    expect(pose.lift).toBe(0);
    expect(pose.reach).toBe(0);
    windowVaultPose(0.3, sill, pose);
    expect(pose.reach).toBeGreaterThan(0.9);
    expect(pose.torsoPitch).toBeGreaterThan(0.4);
    windowVaultPose(0.5, sill, pose);
    expect(pose.lift).toBeCloseTo(sill + WINDOW_VAULT.clearance, 5);
    windowVaultPose(0.7, sill, pose);
    expect(pose.reach).toBe(0);
    windowVaultPose(0.86, sill, pose);
    expect(pose.lift).toBeLessThan(0);
    windowVaultPose(1, sill, pose);
    expect(pose.lift).toBe(0);
    expect(pose.torsoPitch).toBe(0);
  });

  it('lifts a zombie over the sill as it walks in and sets it back on the floor', () => {
    const window = openWindow();
    const zombie = walkingZombie(-8.3, 3.2);
    const heights = walk(zombie, [window], -5.9);
    expect(Math.max(...heights)).toBeGreaterThan(MANSION_WINDOW_OPENING.sill * 0.9);
    expect(heights[0]).toBeCloseTo(0, 3);
    for (let frame = 0; frame < 60; frame++) {
      zombie.trackWindowVault([window]);
      zombie.update(1 / 60, 0);
    }
    expect(zombie.visual.root.position.y).toBeCloseTo(0, 2);
  });

  it('never climbs when walking past an open window from inside, or through a boarded one', () => {
    const window = openWindow();
    const inside = walkingZombie(-6.6, 1.5);
    inside.position.z = 1.5;
    const heights: number[] = [];
    for (let z = 1.5; z < 5; z += 0.02) {
      inside.position.z = z;
      inside.trackWindowVault([window]);
      inside.update(1 / 60, 0.6);
      heights.push(inside.visual.root.position.y);
    }
    expect(Math.max(...heights.map(Math.abs))).toBeLessThan(0.01);

    const boarded = new WindowBarrier('boarded', -7.15, 3.2, -1, 0, BARRIER_CONFIG);
    const blocked = walkingZombie(-8.3, 3.2);
    expect(Math.max(...walk(blocked, [boarded], -7.6).map(Math.abs))).toBeLessThan(0.01);
  });

  it('starts every pooled body on the floor again', () => {
    const window = openWindow();
    const zombie = walkingZombie(-8.3, 3.2);
    walk(zombie, [window], -7.15);
    expect(zombie.visual.root.position.y).toBeGreaterThan(0.2);
    zombie.spawn(-14, 3.2, 100, 1);
    zombie.update(ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.trackWindowVault([window]);
    zombie.update(1 / 60, 0);
    expect(zombie.visual.root.position.y).toBeCloseTo(0, 3);
  });
});
