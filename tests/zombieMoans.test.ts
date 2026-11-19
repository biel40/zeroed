import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SpatialCue } from '../src/audio/SpatialCue';
import type { Zombie } from '../src/zombies/Zombie';
import { ZombieMoanScheduler } from '../src/zombies/ZombieMoanScheduler';
import { ZombieMoans } from '../src/zombies/ZombieMoans';

function candidate(x: number, state: Zombie['state'] = 'walk') {
  return { position: { x, y: 0, z: 0 }, state, isAlive: state !== 'death' };
}

describe('zombie moan cadence', () => {
  const listener = { x: 0, y: 1.7, z: 0 };

  it('picks a nearby active zombie quickly, then alternates with a nearby neighbor', () => {
    const scheduler = new ZombieMoanScheduler(() => 0);
    const closest = candidate(2);
    const neighbor = candidate(4);
    const zombies = new Set([candidate(14), neighbor, candidate(0.5, 'death'), closest, candidate(1, 'spawn')]);

    expect(scheduler.update(0.4, zombies, listener)).toBeNull();
    expect(scheduler.update(0.3, zombies, listener)).toBe(closest);
    expect(scheduler.update(1.5, zombies, listener)).toBeNull();
    expect(scheduler.update(0.3, zombies, listener)).toBe(neighbor);
    expect(scheduler.update(1.8, zombies, listener)).toBe(closest);
  });

  it('looks again soon when the remaining zombie is out of range', () => {
    const scheduler = new ZombieMoanScheduler(() => 1);
    const zombie = candidate(25);
    const zombies = new Set([zombie]);
    expect(scheduler.update(0.7, zombies, listener)).toBeNull();
    zombie.position.x = 4;
    expect(scheduler.update(0.3, zombies, listener)).toBe(zombie);
    expect(scheduler.update(2, zombies, listener)).toBeNull();
    expect(scheduler.update(0.8, zombies, listener)).toBe(zombie);
  });

  it('keeps the close threat audible over an isolated, distant alternative', () => {
    const scheduler = new ZombieMoanScheduler(() => 0);
    const closest = candidate(1.5);
    const zombies = new Set([closest, candidate(13)]);
    expect(scheduler.update(0.7, zombies, listener)).toBe(closest);
    expect(scheduler.update(1.8, zombies, listener)).toBe(closest);
  });

  it('stays silent without a live zombie that has finished spawning', () => {
    const scheduler = new ZombieMoanScheduler(() => 0);
    const zombies = new Set([candidate(1, 'death'), candidate(-1, 'spawn')]);
    expect(scheduler.update(4, zombies, listener)).toBeNull();
    expect(scheduler.update(4, zombies, listener)).toBeNull();
  });
});

describe('position of a live zombie moan', () => {
  it('follows the head and camera without replay, and stops if the pool reuses the body', () => {
    const head = new THREE.Object3D();
    head.position.set(4, 1.6, -4);
    const zombie = { ...candidate(4), headHitbox: head } as unknown as Zombie;
    let id = 1;
    const population = { actives: new Set([zombie]), networkIdOf: () => id };
    const camera = new THREE.PerspectiveCamera();
    camera.position.y = 1.7;
    const directions: SpatialCue[] = [];
    const stop = vi.fn();
    const audio = { playZombieMoan: vi.fn((cue: SpatialCue) => {
      directions.push({ ...cue });
      return { update: (next: SpatialCue) => { directions.push({ ...next }); return true; }, stop };
    }) };
    const moans = new ZombieMoans(() => 0);

    moans.update(0.7, camera, population, audio);
    expect(directions[0].pan).toBeGreaterThan(0.6);
    head.position.x = -4;
    moans.update(0.1, camera, population, audio);
    expect(directions[1].pan).toBeLessThan(-0.6);
    camera.rotation.y = Math.PI;
    moans.update(0.1, camera, population, audio);
    expect(directions[2].pan).toBeGreaterThan(0.6);
    expect(directions[2].muffle).toBeGreaterThan(directions[1].muffle);
    expect(audio.playZombieMoan).toHaveBeenCalledOnce();

    id++;
    moans.update(0.1, camera, population, audio);
    expect(stop).toHaveBeenCalledOnce();
  });
});
